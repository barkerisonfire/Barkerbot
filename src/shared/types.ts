// Shared domain model used by main process, preload and renderer.

/** Where an object lives / is mastered. */
export type ObjectSource = 'cloud' | 'onprem' | 'synced'

export interface DirUser {
  /** Stable app id: Entra object id when known, otherwise `ad:<objectGUID>`. */
  id: string
  entraId?: string
  adGuid?: string
  source: ObjectSource
  displayName: string
  givenName?: string
  surname?: string
  userPrincipalName: string
  mail?: string
  samAccountName?: string
  distinguishedName?: string
  jobTitle?: string
  department?: string
  officeLocation?: string
  mobilePhone?: string
  usageLocation?: string
  managerId?: string
  accountEnabled: boolean
  /** skuPartNumbers, e.g. ENTERPRISEPACK */
  licenses: string[]
  groupIds: string[]
  createdDateTime?: string
  lastSignInDateTime?: string
  /** On-prem change not yet synced to Entra. */
  pendingSync?: boolean
}

export type GroupType = 'security' | 'm365' | 'distribution' | 'mailSecurity'

export interface DirGroup {
  id: string
  entraId?: string
  adGuid?: string
  source: ObjectSource
  displayName: string
  description?: string
  mail?: string
  groupType: GroupType
  memberCount: number
  distinguishedName?: string
}

export interface LicenseSku {
  skuId: string
  skuPartNumber: string
  friendlyName: string
  total: number
  consumed: number
}

export interface UserPatch {
  displayName?: string
  givenName?: string
  surname?: string
  jobTitle?: string
  department?: string
  officeLocation?: string
  mobilePhone?: string
  usageLocation?: string
}

export interface NewUserInput extends UserPatch {
  target: 'cloud' | 'onprem'
  givenName: string
  surname: string
  displayName: string
  /** local part, domain picked from `domain` */
  alias: string
  domain: string
  password: string
  forceChangePassword: boolean
  /** On-prem only: OU distinguished name */
  ou?: string
}

export interface NewGroupInput {
  target: 'cloud' | 'onprem'
  displayName: string
  description?: string
  groupType: GroupType
  mailNickname: string
  ou?: string
}

export interface ConnectionStatus {
  mode: 'demo' | 'live'
  entra: { connected: boolean; tenantName?: string; account?: string; error?: string }
  ad: { connected: boolean; domain?: string; error?: string }
  sync: { available: boolean; lastSync?: string; error?: string }
  domains: string[]
}

export interface Settings {
  mode: 'demo' | 'live'
  tenantId: string
  clientId: string
  adEnabled: boolean
  /** Domain controller to target (optional, -Server). */
  adServer: string
  /** Entra Connect server for Start-ADSyncSyncCycle (blank = local). */
  syncServer: string
  defaultOu: string
  disabledOu: string
  /** Trigger delta sync automatically after on-prem writes. */
  autoSync: boolean
  /** Exchange Online PowerShell for mailbox steps. */
  exchangeEnabled: boolean
}

export const defaultSettings: Settings = {
  mode: 'demo',
  tenantId: '',
  clientId: '',
  adEnabled: true,
  adServer: '',
  syncServer: '',
  defaultOu: 'OU=Users,OU=Company,DC=contoso,DC=local',
  disabledOu: 'OU=Disabled Users,OU=Company,DC=contoso,DC=local',
  autoSync: true,
  exchangeEnabled: false
}

// ---------- Onboarding / offboarding ----------

export interface OnboardingTemplate {
  id: string
  name: string
  description: string
  target: 'cloud' | 'onprem'
  ou?: string
  jobTitle?: string
  department?: string
  officeLocation?: string
  usageLocation: string
  domain: string
  /** App group ids (cloud or on-prem). */
  groupIds: string[]
  licenseSkus: string[]
}

export interface OnboardingRequest {
  templateId: string
  givenName: string
  surname: string
  alias: string
  mobilePhone?: string
  managerId?: string
  jobTitleOverride?: string
}

export interface OffboardingOptions {
  userId: string
  disableAccount: boolean
  resetPassword: boolean
  revokeSessions: boolean
  removeGroups: boolean
  removeLicenses: boolean
  convertToShared: boolean
  forwardTo?: string
  hideFromGal: boolean
  moveToDisabledOu: boolean
}

export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped'

export interface WorkflowStep {
  id: string
  label: string
  status: StepStatus
  message?: string
}

export interface WorkflowResult {
  runId: string
  kind: 'onboarding' | 'offboarding'
  subject: string
  steps: WorkflowStep[]
  success: boolean
  /** e.g. temporary password for onboarding */
  output?: Record<string, string>
}

export interface WorkflowProgress {
  runId: string
  steps: WorkflowStep[]
}

/** Everything a directory backend must support (demo + live hybrid). */
export interface DirectoryProvider {
  status(): Promise<ConnectionStatus>
  listUsers(): Promise<DirUser[]>
  getUser(id: string): Promise<DirUser>
  createUser(input: NewUserInput): Promise<DirUser>
  updateUser(id: string, patch: UserPatch): Promise<DirUser>
  setManager(id: string, managerId: string | null): Promise<void>
  setUserEnabled(id: string, enabled: boolean): Promise<void>
  resetPassword(id: string, password: string, forceChange: boolean): Promise<void>
  deleteUser(id: string): Promise<void>
  revokeSessions(id: string): Promise<void>
  moveUser(id: string, ou: string): Promise<void>
  setHiddenFromGal(id: string, hidden: boolean): Promise<void>
  convertMailboxToShared(id: string): Promise<void>
  setForwarding(id: string, address: string): Promise<void>

  listGroups(): Promise<DirGroup[]>
  getGroupMembers(groupId: string): Promise<DirUser[]>
  addGroupMember(groupId: string, userId: string): Promise<void>
  removeGroupMember(groupId: string, userId: string): Promise<void>
  createGroup(input: NewGroupInput): Promise<DirGroup>

  listLicenses(): Promise<LicenseSku[]>
  setUserLicenses(userId: string, add: string[], remove: string[]): Promise<void>

  /** Run Entra Connect delta sync. */
  triggerSync(): Promise<void>
  /** After an on-prem create: wait until the user shows up in Entra. */
  waitForCloudUser(id: string, timeoutMs: number): Promise<DirUser>
}

/** API exposed to the renderer (window.barkerbot). */
export interface BarkerApi extends DirectoryProvider {
  getSettings(): Promise<Settings>
  saveSettings(s: Settings): Promise<void>
  signIn(): Promise<void>
  signOut(): Promise<void>
  listTemplates(): Promise<OnboardingTemplate[]>
  saveTemplate(t: OnboardingTemplate): Promise<void>
  deleteTemplate(id: string): Promise<void>
  runOnboarding(req: OnboardingRequest): Promise<WorkflowResult>
  runOffboarding(opts: OffboardingOptions): Promise<WorkflowResult>
  onWorkflowProgress(cb: (p: WorkflowProgress) => void): () => void
}
