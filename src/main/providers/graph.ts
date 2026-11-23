// Thin Microsoft Graph client for the Entra ID side of the hybrid provider.
import type { GraphAuth } from '../auth'
import type { GroupType, LicenseSku } from '@shared/types'

const BASE = 'https://graph.microsoft.com/v1.0'

export interface GraphUser {
  id: string
  displayName: string
  givenName?: string
  surname?: string
  userPrincipalName: string
  mail?: string
  jobTitle?: string
  department?: string
  officeLocation?: string
  mobilePhone?: string
  usageLocation?: string
  accountEnabled: boolean
  assignedLicenses: { skuId: string }[]
  onPremisesSyncEnabled?: boolean
  onPremisesImmutableId?: string
  onPremisesSamAccountName?: string
  onPremisesDistinguishedName?: string
  createdDateTime?: string
  signInActivity?: { lastSignInDateTime?: string }
  manager?: { id: string }
}

export interface GraphGroup {
  id: string
  displayName: string
  description?: string
  mail?: string
  groupTypes: string[]
  securityEnabled: boolean
  mailEnabled: boolean
  onPremisesSyncEnabled?: boolean
  onPremisesSecurityIdentifier?: string
}

const FRIENDLY: Record<string, string> = {
  SPE_E3: 'Microsoft 365 E3',
  SPE_E5: 'Microsoft 365 E5',
  SPB: 'Microsoft 365 Business Premium',
  O365_BUSINESS_PREMIUM: 'Microsoft 365 Business Standard',
  O365_BUSINESS_ESSENTIALS: 'Microsoft 365 Business Basic',
  ENTERPRISEPACK: 'Office 365 E3',
  ENTERPRISEPREMIUM: 'Office 365 E5',
  STANDARDPACK: 'Office 365 E1',
  EXCHANGESTANDARD: 'Exchange Online (Plan 1)',
  EXCHANGEENTERPRISE: 'Exchange Online (Plan 2)',
  POWER_BI_PRO: 'Power BI Pro',
  VISIOCLIENT: 'Visio Plan 2',
  PROJECTPROFESSIONAL: 'Project Plan 3',
  MCOEV: 'Teams Phone Standard',
  EMS: 'Enterprise Mobility + Security E3',
  AAD_PREMIUM: 'Microsoft Entra ID P1',
  AAD_PREMIUM_P2: 'Microsoft Entra ID P2',
  FLOW_FREE: 'Power Automate Free',
  Microsoft_Teams_Exploratory_Dept: 'Teams Exploratory'
}

const USER_SELECT =
  'id,displayName,givenName,surname,userPrincipalName,mail,jobTitle,department,officeLocation,mobilePhone,' +
  'usageLocation,accountEnabled,assignedLicenses,onPremisesSyncEnabled,onPremisesImmutableId,' +
  'onPremisesSamAccountName,onPremisesDistinguishedName,createdDateTime'

export class GraphClient {
  private skuCache: LicenseSku[] | null = null
  private signInActivityAllowed = true

  constructor(private auth: GraphAuth) {}

  async req<T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
    const token = await this.auth.token()
    const res = await fetch(path.startsWith('http') ? path : BASE + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    if (res.status === 204) return undefined as T
    const text = await res.text()
    const json = text ? JSON.parse(text) : undefined
    if (!res.ok) {
      const err = new Error(json?.error?.message ?? `Graph ${method} ${path} failed (${res.status})`) as Error & {
        status: number
      }
      err.status = res.status
      throw err
    }
    return json as T
  }

  async all<T>(path: string, headers?: Record<string, string>): Promise<T[]> {
    const out: T[] = []
    let next: string | undefined = path
    while (next) {
      const page: { value: T[]; '@odata.nextLink'?: string } = await this.req('GET', next, undefined, headers)
      out.push(...page.value)
      next = page['@odata.nextLink']
    }
    return out
  }

  async organization(): Promise<{ name: string; domains: string[]; initialDomain: string }> {
    const { value } = await this.req('GET', '/organization?$select=displayName,verifiedDomains')
    const org = value[0]
    const domains = org.verifiedDomains as { name: string; isInitial: boolean; isDefault: boolean }[]
    return {
      name: org.displayName,
      domains: domains.sort((a, b) => Number(b.isDefault) - Number(a.isDefault)).map((d) => d.name),
      initialDomain: domains.find((d) => d.isInitial)?.name ?? domains[0].name
    }
  }

  async listUsers(): Promise<GraphUser[]> {
    if (this.signInActivityAllowed) {
      try {
        return await this.all<GraphUser>(`/users?$select=${USER_SELECT},signInActivity&$top=999`)
      } catch (e) {
        // signInActivity needs Entra ID P1 + AuditLog.Read.All; fall back without it.
        if ((e as { status?: number }).status !== 403 && (e as { status?: number }).status !== 400) throw e
        this.signInActivityAllowed = false
      }
    }
    return this.all<GraphUser>(`/users?$select=${USER_SELECT}&$top=999`)
  }

  getUser(id: string): Promise<GraphUser> {
    return this.req('GET', `/users/${id}?$select=${USER_SELECT}&$expand=manager($select=id)`).catch((e) => {
      if (e.status === 404) return this.req('GET', `/users/${id}?$select=${USER_SELECT}`)
      throw e
    })
  }

  async findUserByUpn(upn: string): Promise<GraphUser | null> {
    try {
      return await this.req('GET', `/users/${encodeURIComponent(upn)}?$select=${USER_SELECT}`)
    } catch (e) {
      if ((e as { status?: number }).status === 404) return null
      throw e
    }
  }

  async userMemberOf(id: string): Promise<string[]> {
    const groups = await this.all<{ id: string; '@odata.type': string }>(`/users/${id}/memberOf?$select=id`)
    return groups.filter((g) => g['@odata.type'] === '#microsoft.graph.group').map((g) => g.id)
  }

  listGroups(): Promise<GraphGroup[]> {
    return this.all<GraphGroup>(
      '/groups?$select=id,displayName,description,mail,groupTypes,securityEnabled,mailEnabled,' +
        'onPremisesSyncEnabled,onPremisesSecurityIdentifier&$top=999'
    )
  }

  async groupMemberIds(groupId: string): Promise<string[]> {
    const m = await this.all<{ id: string }>(`/groups/${groupId}/members?$select=id&$top=999`)
    return m.map((x) => x.id)
  }

  /** groupId -> member user ids, fetched with bounded concurrency. */
  async memberships(groupIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>()
    const queue = [...groupIds]
    const worker = async () => {
      for (let id = queue.shift(); id; id = queue.shift()) map.set(id, await this.groupMemberIds(id).catch(() => []))
    }
    await Promise.all(Array.from({ length: 8 }, worker))
    return map
  }

  async listSkus(force = false): Promise<LicenseSku[]> {
    if (this.skuCache && !force) return this.skuCache
    const { value } = await this.req('GET', '/subscribedSkus')
    this.skuCache = (value as any[])
      .filter((s) => s.capabilityStatus === 'Enabled' || s.capabilityStatus === 'Warning')
      .map((s) => ({
        skuId: s.skuId,
        skuPartNumber: s.skuPartNumber,
        friendlyName: FRIENDLY[s.skuPartNumber] ?? s.skuPartNumber,
        total: s.prepaidUnits?.enabled ?? 0,
        consumed: s.consumedUnits ?? 0
      }))
    return this.skuCache
  }

  async skuPartNumbers(assigned: { skuId: string }[]): Promise<string[]> {
    const skus = await this.listSkus()
    return assigned.map((a) => skus.find((s) => s.skuId === a.skuId)?.skuPartNumber ?? a.skuId)
  }

  async assignLicenses(userId: string, add: string[], remove: string[]): Promise<void> {
    const skus = await this.listSkus()
    const id = (part: string) => {
      const s = skus.find((x) => x.skuPartNumber === part || x.skuId === part)
      if (!s) throw new Error(`License ${part} isn't available in this tenant`)
      return s.skuId
    }
    await this.req('POST', `/users/${userId}/assignLicense`, {
      addLicenses: add.map((p) => ({ skuId: id(p), disabledPlans: [] })),
      removeLicenses: remove.map(id)
    })
    this.skuCache = null
  }

  createUser(body: Record<string, unknown>): Promise<GraphUser> {
    return this.req('POST', '/users', body)
  }

  patchUser(id: string, body: Record<string, unknown>): Promise<void> {
    return this.req('PATCH', `/users/${id}`, body)
  }

  setManager(id: string, managerId: string | null): Promise<void> {
    return managerId
      ? this.req('PUT', `/users/${id}/manager/$ref`, { '@odata.id': `${BASE}/users/${managerId}` })
      : this.req('DELETE', `/users/${id}/manager/$ref`)
  }

  deleteUser(id: string): Promise<void> {
    return this.req('DELETE', `/users/${id}`)
  }

  revokeSessions(id: string): Promise<void> {
    return this.req('POST', `/users/${id}/revokeSignInSessions`)
  }

  addMember(groupId: string, userId: string): Promise<void> {
    return this.req('POST', `/groups/${groupId}/members/$ref`, { '@odata.id': `${BASE}/directoryObjects/${userId}` })
  }

  removeMember(groupId: string, userId: string): Promise<void> {
    return this.req('DELETE', `/groups/${groupId}/members/${userId}/$ref`)
  }

  createGroup(name: string, nickname: string, description: string | undefined, type: GroupType): Promise<GraphGroup> {
    if (type === 'distribution' || type === 'mailSecurity')
      throw new Error('Graph cannot create distribution or mail-enabled security groups. Use Exchange or on-prem AD.')
    return this.req('POST', '/groups', {
      displayName: name,
      mailNickname: nickname,
      description: description || undefined,
      mailEnabled: type === 'm365',
      securityEnabled: type === 'security',
      groupTypes: type === 'm365' ? ['Unified'] : []
    })
  }
}

export function graphGroupType(g: GraphGroup): GroupType {
  if (g.groupTypes.includes('Unified')) return 'm365'
  if (g.mailEnabled && g.securityEnabled) return 'mailSecurity'
  if (g.mailEnabled) return 'distribution'
  return 'security'
}
