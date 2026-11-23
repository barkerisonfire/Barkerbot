// Onboarding / offboarding engine. Runs against any DirectoryProvider, so the
// same logic drives demo mode (in the renderer) and live hybrid mode (in main).
import type {
  DirectoryProvider,
  OffboardingOptions,
  OnboardingRequest,
  OnboardingTemplate,
  WorkflowProgress,
  WorkflowResult,
  WorkflowStep
} from './types'
import { generatePassword, makeRunId } from './password'

type Emit = (p: WorkflowProgress) => void

class Runner {
  steps: WorkflowStep[] = []
  failed = false
  constructor(
    public runId: string,
    private emit: Emit
  ) {}

  add(id: string, label: string): void {
    this.steps.push({ id, label, status: 'pending' })
  }

  private set(id: string, patch: Partial<WorkflowStep>): void {
    this.steps = this.steps.map((s) => (s.id === id ? { ...s, ...patch } : s))
    this.emit({ runId: this.runId, steps: this.steps })
  }

  /** Runs a step. `critical` failures skip all remaining steps. */
  async run(id: string, fn: () => Promise<string | void>, critical = false): Promise<boolean> {
    if (!this.steps.some((s) => s.id === id)) return true
    if (this.failed) {
      this.set(id, { status: 'skipped', message: 'Skipped because an earlier step failed' })
      return false
    }
    this.set(id, { status: 'running' })
    try {
      const msg = await fn()
      this.set(id, { status: 'done', message: msg || undefined })
      return true
    } catch (e) {
      this.set(id, { status: 'failed', message: e instanceof Error ? e.message : String(e) })
      if (critical) this.failed = true
      return false
    }
  }

  start(): void {
    this.emit({ runId: this.runId, steps: this.steps })
  }
}

export async function runOnboarding(
  provider: DirectoryProvider,
  template: OnboardingTemplate,
  req: OnboardingRequest,
  emit: Emit
): Promise<WorkflowResult> {
  const r = new Runner(makeRunId(), emit)
  const groups = await provider.listGroups()
  const tplGroups = groups.filter((g) => template.groupIds.includes(g.id))
  const adGroups = tplGroups.filter((g) => g.source !== 'cloud')
  const cloudGroups = tplGroups.filter((g) => g.source === 'cloud')
  const onprem = template.target === 'onprem'
  const upn = `${req.alias}@${template.domain}`
  const password = generatePassword()

  r.add('create', onprem ? `Create AD account ${upn}` : `Create Entra ID account ${upn}`)
  if (req.managerId) r.add('manager', 'Set manager')
  if (onprem && adGroups.length) r.add('adgroups', `Add to ${adGroups.length} on-prem group(s)`)
  if (onprem) {
    r.add('sync', 'Run Entra Connect delta sync')
    r.add('wait', 'Wait for account to appear in Entra ID')
  }
  if (template.licenseSkus.length) r.add('licenses', `Assign ${template.licenseSkus.length} license(s)`)
  if (cloudGroups.length) r.add('cloudgroups', `Add to ${cloudGroups.length} cloud group(s)`)
  r.start()

  let userId = ''
  await r.run(
    'create',
    async () => {
      const u = await provider.createUser({
        target: template.target,
        givenName: req.givenName,
        surname: req.surname,
        displayName: `${req.givenName} ${req.surname}`,
        alias: req.alias,
        domain: template.domain,
        password,
        forceChangePassword: true,
        jobTitle: req.jobTitleOverride || template.jobTitle,
        department: template.department,
        officeLocation: template.officeLocation,
        mobilePhone: req.mobilePhone,
        usageLocation: template.usageLocation,
        ou: template.ou
      })
      userId = u.id
      return onprem ? `Created in ${template.ou ?? 'default OU'}` : `Object id ${u.id}`
    },
    true
  )

  await r.run('manager', async () => {
    await provider.setManager(userId, req.managerId!)
  })

  await r.run('adgroups', async () => {
    for (const g of adGroups) await provider.addGroupMember(g.id, userId)
    return adGroups.map((g) => g.displayName).join(', ')
  })

  await r.run('sync', () => provider.triggerSync(), true)
  await r.run(
    'wait',
    async () => {
      const u = await provider.waitForCloudUser(userId, 5 * 60_000)
      userId = u.id
      return 'Account is now synced to Entra ID'
    },
    true
  )

  await r.run('licenses', async () => {
    await provider.updateUser(userId, { usageLocation: template.usageLocation })
    await provider.setUserLicenses(userId, template.licenseSkus, [])
    return template.licenseSkus.join(', ')
  })

  await r.run('cloudgroups', async () => {
    for (const g of cloudGroups) await provider.addGroupMember(g.id, userId)
    return cloudGroups.map((g) => g.displayName).join(', ')
  })

  const success = r.steps.every((s) => s.status === 'done')
  return {
    runId: r.runId,
    kind: 'onboarding',
    subject: upn,
    steps: r.steps,
    success,
    output: { 'User name': upn, 'Temporary password': password }
  }
}

export async function runOffboarding(
  provider: DirectoryProvider,
  opts: OffboardingOptions,
  disabledOu: string,
  emit: Emit
): Promise<WorkflowResult> {
  const r = new Runner(makeRunId(), emit)
  const user = await provider.getUser(opts.userId)
  const hasAd = user.source !== 'cloud'
  const hasCloud = user.source !== 'onprem'
  const newPassword = generatePassword(20)

  if (opts.disableAccount) r.add('disable', 'Block sign-in')
  if (opts.resetPassword) r.add('password', 'Reset password to random value')
  if (opts.revokeSessions && hasCloud) r.add('revoke', 'Sign out of all sessions')
  // Mailbox conversion must happen before licenses are removed.
  if (opts.convertToShared && hasCloud) r.add('shared', 'Convert mailbox to shared')
  if (opts.forwardTo && hasCloud) r.add('forward', `Forward email to ${opts.forwardTo}`)
  if (opts.hideFromGal) r.add('gal', 'Hide from global address list')
  if (opts.removeGroups && user.groupIds.length) r.add('groups', `Remove from ${user.groupIds.length} group(s)`)
  if (opts.removeLicenses && user.licenses.length) r.add('licenses', `Remove ${user.licenses.length} license(s)`)
  if (opts.moveToDisabledOu && hasAd) r.add('move', 'Move to disabled users OU')
  if (hasAd && user.source === 'synced') r.add('sync', 'Run Entra Connect delta sync')
  r.start()

  await r.run('disable', () => provider.setUserEnabled(user.id, false))
  await r.run('password', () => provider.resetPassword(user.id, newPassword, false))
  await r.run('revoke', () => provider.revokeSessions(user.id))
  await r.run('shared', () => provider.convertMailboxToShared(user.id))
  await r.run('forward', () => provider.setForwarding(user.id, opts.forwardTo!))
  await r.run('gal', () => provider.setHiddenFromGal(user.id, true))
  await r.run('groups', async () => {
    const errors: string[] = []
    for (const gid of user.groupIds) {
      try {
        await provider.removeGroupMember(gid, user.id)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
    if (errors.length) throw new Error(errors.join('; '))
  })
  await r.run('licenses', async () => {
    await provider.setUserLicenses(user.id, [], user.licenses)
    return user.licenses.join(', ')
  })
  await r.run('move', async () => {
    await provider.moveUser(user.id, disabledOu)
    return disabledOu
  })
  await r.run('sync', () => provider.triggerSync())

  return {
    runId: r.runId,
    kind: 'offboarding',
    subject: user.userPrincipalName,
    steps: r.steps,
    success: r.steps.every((s) => s.status === 'done')
  }
}
