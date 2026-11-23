// In-memory hybrid directory used for demo mode. Simulates AD vs Entra
// mastering rules and Entra Connect sync so the UI behaves like the real thing.
import type {
  ConnectionStatus,
  DirGroup,
  DirUser,
  DirectoryProvider,
  LicenseSku,
  NewGroupInput,
  NewUserInput,
  UserPatch
} from './types'
import { DEMO_DOMAINS, buildDemoUsers, demoGroups, demoLicenses } from './mockData'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

export class MockProvider implements DirectoryProvider {
  private users: DirUser[] = buildDemoUsers()
  private groups: DirGroup[] = clone(demoGroups)
  private licenses: LicenseSku[] = clone(demoLicenses)
  private lastSync = new Date(Date.now() - 12 * 60_000).toISOString()
  private seq = 1000

  constructor(private latency = 250) {}

  private async tick(mult = 1): Promise<void> {
    await wait(this.latency * mult)
  }

  private u(id: string): DirUser {
    const u = this.users.find((x) => x.id === id)
    if (!u) throw new Error(`User ${id} not found`)
    return u
  }

  private g(id: string): DirGroup {
    const g = this.groups.find((x) => x.id === id)
    if (!g) throw new Error(`Group ${id} not found`)
    return g
  }

  private recount(): void {
    for (const g of this.groups) g.memberCount = this.users.filter((u) => u.groupIds.includes(g.id)).length
    for (const l of this.licenses)
      l.consumed = this.users.filter((u) => u.licenses.includes(l.skuPartNumber)).length
  }

  /** Changes to AD-mastered attributes on synced users wait for the next sync. */
  private touch(u: DirUser): void {
    if (u.source === 'synced') u.pendingSync = true
  }

  async status(): Promise<ConnectionStatus> {
    return {
      mode: 'demo',
      entra: { connected: true, tenantName: 'Contoso (demo)', account: 'admin@contoso.onmicrosoft.com' },
      ad: { connected: true, domain: 'contoso.local' },
      sync: { available: true, lastSync: this.lastSync },
      domains: DEMO_DOMAINS
    }
  }

  async listUsers(): Promise<DirUser[]> {
    await this.tick()
    this.recount()
    return clone(this.users)
  }

  async getUser(id: string): Promise<DirUser> {
    await this.tick(0.5)
    return clone(this.u(id))
  }

  async createUser(input: NewUserInput): Promise<DirUser> {
    await this.tick(2)
    const upn = `${input.alias}@${input.domain}`.toLowerCase()
    if (this.users.some((u) => u.userPrincipalName === upn)) throw new Error(`${upn} already exists`)
    const n = ++this.seq
    const onprem = input.target === 'onprem'
    const user: DirUser = {
      id: `u-${n}`,
      entraId: onprem ? undefined : `e-${n}`,
      adGuid: onprem ? `ad-${n}` : undefined,
      source: onprem ? 'onprem' : 'cloud',
      displayName: input.displayName,
      givenName: input.givenName,
      surname: input.surname,
      userPrincipalName: upn,
      mail: onprem ? undefined : upn,
      samAccountName: onprem ? input.alias.slice(0, 20) : undefined,
      distinguishedName: onprem ? `CN=${input.displayName},${input.ou}` : undefined,
      jobTitle: input.jobTitle,
      department: input.department,
      officeLocation: input.officeLocation,
      mobilePhone: input.mobilePhone,
      usageLocation: input.usageLocation,
      accountEnabled: true,
      licenses: [],
      groupIds: [],
      createdDateTime: new Date().toISOString(),
      pendingSync: onprem
    }
    this.users.push(user)
    return clone(user)
  }

  async updateUser(id: string, patch: UserPatch): Promise<DirUser> {
    await this.tick()
    const u = this.u(id)
    Object.assign(u, patch)
    if (Object.keys(patch).some((k) => k !== 'usageLocation')) this.touch(u)
    return clone(u)
  }

  async setManager(id: string, managerId: string | null): Promise<void> {
    await this.tick()
    const u = this.u(id)
    u.managerId = managerId ?? undefined
    this.touch(u)
  }

  async setUserEnabled(id: string, enabled: boolean): Promise<void> {
    await this.tick()
    const u = this.u(id)
    u.accountEnabled = enabled
    this.touch(u)
  }

  async resetPassword(id: string, _password: string, _force: boolean): Promise<void> {
    await this.tick()
    this.u(id)
  }

  async deleteUser(id: string): Promise<void> {
    await this.tick()
    this.u(id)
    this.users = this.users.filter((u) => u.id !== id)
  }

  async revokeSessions(id: string): Promise<void> {
    await this.tick()
    if (this.u(id).source === 'onprem') throw new Error('User is not in Entra ID')
  }

  async moveUser(id: string, ou: string): Promise<void> {
    await this.tick()
    const u = this.u(id)
    if (u.source === 'cloud') throw new Error('Cloud-only users have no OU')
    u.distinguishedName = `CN=${u.displayName},${ou}`
    this.touch(u)
  }

  async setHiddenFromGal(id: string, _hidden: boolean): Promise<void> {
    await this.tick()
    this.touch(this.u(id))
  }

  async convertMailboxToShared(id: string): Promise<void> {
    await this.tick(2)
    if (!this.u(id).mail) throw new Error('User has no mailbox')
  }

  async setForwarding(id: string, address: string): Promise<void> {
    await this.tick()
    if (!address.includes('@')) throw new Error('Invalid forwarding address')
    this.u(id)
  }

  async listGroups(): Promise<DirGroup[]> {
    await this.tick()
    this.recount()
    return clone(this.groups)
  }

  async getGroupMembers(groupId: string): Promise<DirUser[]> {
    await this.tick(0.5)
    return clone(this.users.filter((u) => u.groupIds.includes(groupId)))
  }

  async addGroupMember(groupId: string, userId: string): Promise<void> {
    await this.tick()
    const g = this.g(groupId)
    const u = this.u(userId)
    if (g.source === 'cloud' && u.source === 'onprem')
      throw new Error(`${u.displayName} isn't synced to Entra ID yet, so can't join cloud group ${g.displayName}`)
    if (g.source !== 'cloud' && u.source === 'cloud')
      throw new Error(`Cloud-only user ${u.displayName} can't join on-prem group ${g.displayName}`)
    if (!u.groupIds.includes(groupId)) u.groupIds.push(groupId)
  }

  async removeGroupMember(groupId: string, userId: string): Promise<void> {
    await this.tick()
    const u = this.u(userId)
    u.groupIds = u.groupIds.filter((g) => g !== groupId)
  }

  async createGroup(input: NewGroupInput): Promise<DirGroup> {
    await this.tick()
    const n = ++this.seq
    const g: DirGroup = {
      id: `g-${n}`,
      source: input.target === 'onprem' ? 'onprem' : 'cloud',
      displayName: input.displayName,
      description: input.description,
      groupType: input.groupType,
      mail: input.groupType === 'security' ? undefined : `${input.mailNickname}@contoso.com`,
      memberCount: 0,
      distinguishedName: input.target === 'onprem' ? `CN=${input.displayName},${input.ou}` : undefined
    }
    this.groups.push(g)
    return clone(g)
  }

  async listLicenses(): Promise<LicenseSku[]> {
    await this.tick(0.5)
    this.recount()
    return clone(this.licenses)
  }

  async setUserLicenses(userId: string, add: string[], remove: string[]): Promise<void> {
    await this.tick()
    const u = this.u(userId)
    if (u.source === 'onprem') throw new Error(`${u.displayName} isn't in Entra ID yet. Run a sync first.`)
    if (add.length && !u.usageLocation) throw new Error('Usage location must be set before assigning licenses')
    this.recount()
    for (const sku of add) {
      const l = this.licenses.find((x) => x.skuPartNumber === sku)
      if (!l) throw new Error(`Unknown SKU ${sku}`)
      if (!u.licenses.includes(sku) && l.consumed >= l.total) throw new Error(`No ${l.friendlyName} licenses available`)
    }
    u.licenses = [...new Set([...u.licenses.filter((l) => !remove.includes(l)), ...add])]
  }

  async triggerSync(): Promise<void> {
    await this.tick(6)
    for (const u of this.users) {
      if (u.source === 'onprem' && u.distinguishedName?.includes('OU=Company')) {
        u.source = 'synced'
        u.entraId = `e-${u.id}`
        u.mail = u.userPrincipalName
      }
      u.pendingSync = false
    }
    this.lastSync = new Date().toISOString()
  }

  async waitForCloudUser(id: string, _timeoutMs: number): Promise<DirUser> {
    await this.tick(2)
    const u = this.u(id)
    if (u.source === 'onprem') throw new Error('User is outside the sync scope (OU not synced)')
    return clone(u)
  }
}
