// Live hybrid provider: merges on-prem AD (PowerShell) and Entra ID (Graph)
// into one view and routes each write to the system that masters it.
//
// Routing rules
//  - Synced / on-prem users: identity attributes, enable/disable, password,
//    manager, OU and group membership of AD groups -> Active Directory.
//    (Entra rejects edits to these on synced objects.)
//  - Cloud users and anything cloud-only (licenses, usage location, cloud
//    groups, session revocation) -> Microsoft Graph.
//  - Mailbox actions -> Exchange Online PowerShell.
import type {
  ConnectionStatus,
  DirGroup,
  DirUser,
  DirectoryProvider,
  LicenseSku,
  NewGroupInput,
  NewUserInput,
  Settings,
  UserPatch
} from '@shared/types'
import type { GraphAuth } from '../auth'
import { AdClient, type AdGroup, type AdUser } from './ad'
import { ExchangeClient } from './exchange'
import { GraphClient, graphGroupType, type GraphGroup, type GraphUser } from './graph'

const SYSTEM_ACCOUNTS = /^(krbtgt|guest|defaultaccount|wdagutilityaccount|msol_.*|sync_.*|aad_.*)$/i
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class HybridProvider implements DirectoryProvider {
  private graph: GraphClient
  private ad: AdClient | null
  private exo: ExchangeClient
  private users = new Map<string, DirUser>()
  private groups = new Map<string, DirGroup>()
  private org: Promise<{ name: string; domains: string[]; initialDomain: string }> | null = null
  private syncTimer: NodeJS.Timeout | null = null
  private lastSync?: string

  constructor(
    private auth: GraphAuth,
    private settings: Settings
  ) {
    this.graph = new GraphClient(auth)
    this.ad = settings.adEnabled ? new AdClient(settings.adServer) : null
    this.exo = new ExchangeClient(
      () => auth.tokenFor(['https://outlook.office365.com/Exchange.Manage']),
      async () => (await this.organization()).initialDomain
    )
  }

  private organization() {
    this.org ??= this.graph.organization().catch((e) => {
      this.org = null
      throw e
    })
    return this.org
  }

  // ---------- helpers ----------

  private requireAd(): AdClient {
    if (!this.ad) throw new Error('On-prem AD is disabled in Settings')
    return this.ad
  }

  private async user(id: string): Promise<DirUser> {
    if (!this.users.has(id)) await this.listUsers()
    const u = this.users.get(id)
    if (!u) throw new Error(`User ${id} not found`)
    return u
  }

  private async group(id: string): Promise<DirGroup> {
    if (!this.groups.has(id)) await this.listGroups()
    const g = this.groups.get(id)
    if (!g) throw new Error(`Group ${id} not found`)
    return g
  }

  private needEntra(u: DirUser): string {
    if (!u.entraId) throw new Error(`${u.displayName} isn't in Entra ID yet. Run a sync first.`)
    return u.entraId
  }

  private needAd(u: DirUser): string {
    if (!u.adGuid) throw new Error(`${u.displayName} is a cloud-only account (no AD object)`)
    return u.adGuid
  }

  /** After AD writes to synced objects, debounce a delta sync if enabled. */
  private afterAdWrite(u?: DirUser): void {
    if (u && u.source === 'synced') u.pendingSync = true
    if (!this.settings.autoSync || !this.ad) return
    if (this.syncTimer) clearTimeout(this.syncTimer)
    this.syncTimer = setTimeout(() => this.triggerSync().catch(() => undefined), 15_000)
  }

  private fromGraph(g: GraphUser, licenses: string[], ad?: AdUser): DirUser {
    return {
      id: g.id,
      entraId: g.id,
      adGuid: ad?.guid,
      source: g.onPremisesSyncEnabled ? 'synced' : 'cloud',
      displayName: g.displayName,
      givenName: g.givenName,
      surname: g.surname,
      userPrincipalName: g.userPrincipalName,
      mail: g.mail,
      samAccountName: g.onPremisesSamAccountName ?? ad?.sam,
      distinguishedName: ad?.dn ?? g.onPremisesDistinguishedName,
      jobTitle: g.jobTitle,
      department: g.department,
      officeLocation: g.officeLocation,
      mobilePhone: g.mobilePhone,
      usageLocation: g.usageLocation,
      managerId: g.manager?.id,
      // For synced users AD is authoritative and may be ahead of Entra.
      accountEnabled: ad ? ad.enabled : g.accountEnabled,
      licenses,
      groupIds: [],
      createdDateTime: g.createdDateTime,
      lastSignInDateTime: g.signInActivity?.lastSignInDateTime
    }
  }

  private fromAd(a: AdUser): DirUser {
    return {
      id: `ad:${a.guid}`,
      adGuid: a.guid,
      source: 'onprem',
      displayName: a.displayName || a.sam,
      givenName: a.givenName,
      surname: a.surname,
      userPrincipalName: a.upn || a.sam,
      mail: a.mail,
      samAccountName: a.sam,
      distinguishedName: a.dn,
      jobTitle: a.title,
      department: a.department,
      officeLocation: a.office,
      mobilePhone: a.mobile,
      accountEnabled: a.enabled,
      licenses: [],
      groupIds: [],
      createdDateTime: a.created,
      lastSignInDateTime: a.lastLogon
    }
  }

  // ---------- status ----------

  async status(): Promise<ConnectionStatus> {
    const s: ConnectionStatus = {
      mode: 'live',
      entra: { connected: false, account: this.auth.accountName },
      ad: { connected: false },
      sync: { available: !!this.ad, lastSync: this.lastSync },
      domains: []
    }
    await Promise.all([
      this.organization()
        .then((o) => {
          s.entra = { connected: true, tenantName: o.name, account: this.auth.accountName }
          s.domains = o.domains
        })
        .catch((e) => (s.entra.error = e.message)),
      this.ad
        ? this.ad
            .domain()
            .then((d) => (s.ad = { connected: true, domain: d }))
            .catch((e) => (s.ad.error = e.message))
        : Promise.resolve((s.ad.error = 'Disabled in Settings'))
    ])
    return s
  }

  // ---------- users ----------

  async listUsers(): Promise<DirUser[]> {
    const [gUsers, aUsers, groups] = await Promise.all([
      this.graph.listUsers(),
      this.ad ? this.ad.listUsers() : Promise.resolve([] as AdUser[]),
      this.listGroups()
    ])
    const skus = await this.graph.listSkus()
    const skuName = (id: string) => skus.find((s) => s.skuId === id)?.skuPartNumber ?? id
    const adByImmutable = new Map(aUsers.map((a) => [a.immutableId, a]))
    const adByDn = new Map(aUsers.map((a) => [a.dn.toLowerCase(), a]))
    const groupByDn = new Map(
      groups.filter((g) => g.distinguishedName).map((g) => [g.distinguishedName!.toLowerCase(), g.id])
    )

    const merged: DirUser[] = []
    const matched = new Set<string>()
    for (const g of gUsers) {
      const ad = g.onPremisesImmutableId ? adByImmutable.get(g.onPremisesImmutableId) : undefined
      if (ad) matched.add(ad.guid)
      merged.push(this.fromGraph(g, g.assignedLicenses.map((l) => skuName(l.skuId)), ad))
    }
    for (const a of aUsers) {
      if (matched.has(a.guid) || SYSTEM_ACCOUNTS.test(a.sam)) continue
      merged.push(this.fromAd(a))
    }

    // Membership: AD groups from memberOf, cloud-only groups from Graph.
    const appIdByAdGuid = new Map(merged.filter((u) => u.adGuid).map((u) => [u.adGuid!, u.id]))
    const cloudGroups = groups.filter((g) => g.source === 'cloud')
    const members = await this.graph.memberships(cloudGroups.map((g) => g.entraId!))
    const byId = new Map(merged.map((u) => [u.id, u]))
    for (const u of merged) {
      const ad = u.adGuid ? aUsers.find((a) => a.guid === u.adGuid) : undefined
      if (ad) {
        u.groupIds = ad.memberOf.map((dn) => groupByDn.get(dn.toLowerCase())).filter((x): x is string => !!x)
        const mgr = ad.managerDn ? adByDn.get(ad.managerDn.toLowerCase()) : undefined
        if (mgr) u.managerId = appIdByAdGuid.get(mgr.guid)
      }
      u.pendingSync = this.users.get(u.id)?.pendingSync
    }
    for (const g of cloudGroups) for (const uid of members.get(g.entraId!) ?? []) byId.get(uid)?.groupIds.push(g.id)

    this.users = new Map(merged.map((u) => [u.id, u]))
    return merged
  }

  async getUser(id: string): Promise<DirUser> {
    const u = await this.user(id)
    if (u.entraId) {
      const [g, memberOf] = await Promise.all([this.graph.getUser(u.entraId), this.graph.userMemberOf(u.entraId)])
      if (!u.adGuid && g.manager) u.managerId = g.manager.id
      u.licenses = await this.graph.skuPartNumbers(g.assignedLicenses)
      const ids = new Set(u.groupIds)
      for (const gid of memberOf) if (this.groups.get(gid)?.source === 'cloud') ids.add(gid)
      u.groupIds = [...ids]
    }
    return u
  }

  async createUser(input: NewUserInput): Promise<DirUser> {
    const upn = `${input.alias}@${input.domain}`
    if (input.target === 'onprem') {
      const ad = this.requireAd()
      const guid = await ad.createUser({
        name: input.displayName,
        givenName: input.givenName,
        surname: input.surname,
        sam: input.alias.slice(0, 20),
        upn,
        ou: input.ou || this.settings.defaultOu,
        password: input.password,
        forceChange: input.forceChangePassword,
        title: input.jobTitle,
        department: input.department,
        office: input.officeLocation,
        mobile: input.mobilePhone,
        mail: upn
      })
      const u: DirUser = {
        ...this.fromAd({
          guid,
          immutableId: '',
          sam: input.alias.slice(0, 20),
          upn,
          dn: `CN=${input.displayName},${input.ou || this.settings.defaultOu}`,
          displayName: input.displayName,
          givenName: input.givenName,
          surname: input.surname,
          title: input.jobTitle,
          department: input.department,
          office: input.officeLocation,
          mobile: input.mobilePhone,
          enabled: true,
          memberOf: []
        }),
        usageLocation: input.usageLocation,
        pendingSync: true
      }
      this.users.set(u.id, u)
      this.afterAdWrite()
      return u
    }
    const g = await this.graph.createUser({
      accountEnabled: true,
      displayName: input.displayName,
      givenName: input.givenName,
      surname: input.surname,
      mailNickname: input.alias,
      userPrincipalName: upn,
      jobTitle: input.jobTitle || undefined,
      department: input.department || undefined,
      officeLocation: input.officeLocation || undefined,
      mobilePhone: input.mobilePhone || undefined,
      usageLocation: input.usageLocation || undefined,
      passwordProfile: { password: input.password, forceChangePasswordNextSignIn: input.forceChangePassword }
    })
    const u = this.fromGraph(g, [])
    this.users.set(u.id, u)
    return u
  }

  async updateUser(id: string, patch: UserPatch): Promise<DirUser> {
    const u = await this.user(id)
    const { usageLocation, ...rest } = patch
    if (usageLocation !== undefined) await this.graph.patchUser(this.needEntra(u), { usageLocation: usageLocation || null })
    if (Object.keys(rest).length) {
      if (u.adGuid) {
        await this.requireAd().updateUser(u.adGuid, rest)
        this.afterAdWrite(u)
      } else {
        const body = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v || null]))
        await this.graph.patchUser(this.needEntra(u), body)
      }
    }
    Object.assign(u, patch)
    return u
  }

  async setManager(id: string, managerId: string | null): Promise<void> {
    const u = await this.user(id)
    const m = managerId ? await this.user(managerId) : null
    if (u.adGuid && (!m || m.adGuid)) {
      await this.requireAd().setManager(u.adGuid, m?.adGuid ?? null)
      this.afterAdWrite(u)
    } else {
      await this.graph.setManager(this.needEntra(u), m ? this.needEntra(m) : null)
    }
    u.managerId = managerId ?? undefined
  }

  async setUserEnabled(id: string, enabled: boolean): Promise<void> {
    const u = await this.user(id)
    if (u.adGuid) {
      await this.requireAd().setEnabled(u.adGuid, enabled)
      this.afterAdWrite(u)
    } else await this.graph.patchUser(this.needEntra(u), { accountEnabled: enabled })
    u.accountEnabled = enabled
  }

  async resetPassword(id: string, password: string, forceChange: boolean): Promise<void> {
    const u = await this.user(id)
    if (u.adGuid) {
      await this.requireAd().resetPassword(u.adGuid, password, forceChange)
      this.afterAdWrite(u)
    } else
      await this.graph.patchUser(this.needEntra(u), {
        passwordProfile: { password, forceChangePasswordNextSignIn: forceChange }
      })
  }

  async deleteUser(id: string): Promise<void> {
    const u = await this.user(id)
    if (u.adGuid) {
      await this.requireAd().deleteUser(u.adGuid)
      this.afterAdWrite()
    } else await this.graph.deleteUser(this.needEntra(u))
    this.users.delete(id)
  }

  async revokeSessions(id: string): Promise<void> {
    await this.graph.revokeSessions(this.needEntra(await this.user(id)))
  }

  async moveUser(id: string, ou: string): Promise<void> {
    const u = await this.user(id)
    await this.requireAd().move(this.needAd(u), ou)
    this.afterAdWrite(u)
  }

  async setHiddenFromGal(id: string, hidden: boolean): Promise<void> {
    const u = await this.user(id)
    if (u.adGuid) {
      // Hybrid Exchange: the attribute is mastered on-prem and synced.
      await this.requireAd().setHiddenFromGal(u.adGuid, hidden)
      this.afterAdWrite(u)
    } else {
      this.requireExchange()
      await this.exo.hideFromGal(u.userPrincipalName, hidden)
    }
  }

  private requireExchange(): void {
    if (!this.settings.exchangeEnabled) throw new Error('Exchange Online is disabled in Settings')
  }

  async convertMailboxToShared(id: string): Promise<void> {
    this.requireExchange()
    const u = await this.user(id)
    this.needEntra(u)
    await this.exo.convertToShared(u.userPrincipalName)
  }

  async setForwarding(id: string, address: string): Promise<void> {
    this.requireExchange()
    const u = await this.user(id)
    this.needEntra(u)
    await this.exo.setForwarding(u.userPrincipalName, address)
  }

  // ---------- groups ----------

  async listGroups(): Promise<DirGroup[]> {
    const [gGroups, aGroups] = await Promise.all([
      this.graph.listGroups(),
      this.ad ? this.ad.listGroups() : Promise.resolve([] as AdGroup[])
    ])
    const adBySid = new Map(aGroups.map((a) => [a.sid, a]))
    const matched = new Set<string>()
    const merged: DirGroup[] = gGroups.map((g: GraphGroup) => {
      const ad = g.onPremisesSecurityIdentifier ? adBySid.get(g.onPremisesSecurityIdentifier) : undefined
      if (ad) matched.add(ad.guid)
      return {
        id: g.id,
        entraId: g.id,
        adGuid: ad?.guid,
        source: g.onPremisesSyncEnabled ? 'synced' : 'cloud',
        displayName: g.displayName,
        description: g.description,
        mail: g.mail,
        groupType: graphGroupType(g),
        memberCount: ad?.memberCount ?? this.groups.get(g.id)?.memberCount ?? 0,
        distinguishedName: ad?.dn
      } satisfies DirGroup
    })
    for (const a of aGroups) {
      if (matched.has(a.guid)) continue
      merged.push({
        id: `ad:${a.guid}`,
        adGuid: a.guid,
        source: 'onprem',
        displayName: a.name,
        description: a.description,
        mail: a.mail,
        groupType: a.category === 'Distribution' ? 'distribution' : 'security',
        memberCount: a.memberCount,
        distinguishedName: a.dn
      })
    }
    // Member counts for cloud groups come from the user listing.
    for (const g of merged)
      if (g.source === 'cloud' && this.users.size)
        g.memberCount = [...this.users.values()].filter((u) => u.groupIds.includes(g.id)).length
    this.groups = new Map(merged.map((g) => [g.id, g]))
    return merged
  }

  async getGroupMembers(groupId: string): Promise<DirUser[]> {
    const g = await this.group(groupId)
    if (!this.users.size) await this.listUsers()
    const all = [...this.users.values()]
    if (g.source === 'cloud') {
      const ids = new Set(await this.graph.groupMemberIds(g.entraId!))
      return all.filter((u) => u.entraId && ids.has(u.entraId))
    }
    const guids = new Set(await this.requireAd().groupMemberGuids(g.adGuid!))
    return all.filter((u) => u.adGuid && guids.has(u.adGuid))
  }

  async addGroupMember(groupId: string, userId: string): Promise<void> {
    const [g, u] = await Promise.all([this.group(groupId), this.user(userId)])
    if (g.source === 'cloud') await this.graph.addMember(g.entraId!, this.needEntra(u))
    else {
      if (!g.adGuid) throw new Error(`${g.displayName} is synced but its AD object wasn't found`)
      await this.requireAd().addMember(g.adGuid, this.needAd(u))
      this.afterAdWrite(u)
    }
    if (!u.groupIds.includes(groupId)) u.groupIds.push(groupId)
  }

  async removeGroupMember(groupId: string, userId: string): Promise<void> {
    const [g, u] = await Promise.all([this.group(groupId), this.user(userId)])
    if (g.source === 'cloud') await this.graph.removeMember(g.entraId!, this.needEntra(u))
    else {
      if (!g.adGuid) throw new Error(`${g.displayName} is synced but its AD object wasn't found`)
      await this.requireAd().removeMember(g.adGuid, this.needAd(u))
      this.afterAdWrite(u)
    }
    u.groupIds = u.groupIds.filter((x) => x !== groupId)
  }

  async createGroup(input: NewGroupInput): Promise<DirGroup> {
    if (input.target === 'onprem') {
      const ou = input.ou || this.settings.defaultOu
      const guid = await this.requireAd().createGroup(input.displayName, input.mailNickname, ou, input.description, input.groupType)
      const g: DirGroup = {
        id: `ad:${guid}`,
        adGuid: guid,
        source: 'onprem',
        displayName: input.displayName,
        description: input.description,
        groupType: input.groupType === 'distribution' ? 'distribution' : 'security',
        memberCount: 0,
        distinguishedName: `CN=${input.displayName},${ou}`
      }
      this.groups.set(g.id, g)
      this.afterAdWrite()
      return g
    }
    const gg = await this.graph.createGroup(input.displayName, input.mailNickname, input.description, input.groupType)
    const g: DirGroup = {
      id: gg.id,
      entraId: gg.id,
      source: 'cloud',
      displayName: gg.displayName,
      description: gg.description,
      mail: gg.mail,
      groupType: graphGroupType(gg),
      memberCount: 0
    }
    this.groups.set(g.id, g)
    return g
  }

  // ---------- licenses ----------

  listLicenses(): Promise<LicenseSku[]> {
    return this.graph.listSkus(true)
  }

  async setUserLicenses(userId: string, add: string[], remove: string[]): Promise<void> {
    const u = await this.user(userId)
    await this.graph.assignLicenses(this.needEntra(u), add, remove)
    u.licenses = [...new Set([...u.licenses.filter((l) => !remove.includes(l)), ...add])]
  }

  // ---------- sync ----------

  async triggerSync(): Promise<void> {
    if (this.syncTimer) clearTimeout(this.syncTimer)
    this.syncTimer = null
    await this.requireAd().triggerSync(this.settings.syncServer)
    this.lastSync = new Date().toISOString()
    for (const u of this.users.values()) u.pendingSync = false
  }

  async waitForCloudUser(id: string, timeoutMs: number): Promise<DirUser> {
    const u = await this.user(id)
    if (u.entraId) return u
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const g = await this.graph.findUserByUpn(u.userPrincipalName)
      if (g) {
        const synced = this.fromGraph(g, [], undefined)
        synced.adGuid = u.adGuid
        synced.distinguishedName = u.distinguishedName
        synced.groupIds = u.groupIds
        this.users.delete(id)
        this.users.set(synced.id, synced)
        return synced
      }
      await sleep(10_000)
    }
    throw new Error('Timed out waiting for Entra Connect. Check that the OU is in sync scope.')
  }
}
