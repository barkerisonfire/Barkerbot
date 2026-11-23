// Bridges renderer calls to the active provider (demo or live hybrid).
import { ipcMain, type WebContents } from 'electron'
import type { DirectoryProvider, OffboardingOptions, OnboardingRequest, Settings } from '@shared/types'
import { MockProvider } from '@shared/mockProvider'
import { runOffboarding, runOnboarding } from '@shared/workflows'
import { GraphAuth } from './auth'
import { HybridProvider } from './providers/hybridProvider'
import { settingsStore, templateStore } from './store'

let provider: DirectoryProvider
let auth: GraphAuth | null = null
let demoTemplates = templateStore.list()

function build(s: Settings): void {
  if (s.mode === 'live' && s.tenantId && s.clientId) {
    auth = new GraphAuth(s.tenantId, s.clientId)
    provider = new HybridProvider(auth, s)
  } else {
    auth = null
    provider = new MockProvider()
  }
}

const PROVIDER_METHODS: (keyof DirectoryProvider)[] = [
  'status', 'listUsers', 'getUser', 'createUser', 'updateUser', 'setManager', 'setUserEnabled',
  'resetPassword', 'deleteUser', 'revokeSessions', 'moveUser', 'setHiddenFromGal',
  'convertMailboxToShared', 'setForwarding', 'listGroups', 'getGroupMembers', 'addGroupMember',
  'removeGroupMember', 'createGroup', 'listLicenses', 'setUserLicenses', 'triggerSync', 'waitForCloudUser'
]

export function registerIpc(getWeb: () => WebContents | undefined): void {
  build(settingsStore.get())
  const emit = (p: unknown) => getWeb()?.send('workflow:progress', p)

  for (const m of PROVIDER_METHODS) {
    ipcMain.handle(`dir:${m}`, (_e, ...args: unknown[]) =>
      (provider[m] as (...a: unknown[]) => Promise<unknown>).apply(provider, args)
    )
  }

  ipcMain.handle('settings:get', () => settingsStore.get())
  ipcMain.handle('settings:save', (_e, s: Settings) => {
    settingsStore.set(s)
    build(s)
  })
  ipcMain.handle('auth:signIn', async () => {
    if (!auth) throw new Error('Switch to live mode and enter tenant and client IDs first')
    await auth.signIn()
  })
  ipcMain.handle('auth:signOut', () => auth?.signOut())

  const isDemo = () => settingsStore.get().mode === 'demo'
  const templates = () => (isDemo() ? demoTemplates : templateStore.list())
  ipcMain.handle('templates:list', () => templates())
  ipcMain.handle('templates:save', (_e, t) => {
    if (isDemo()) demoTemplates = [...demoTemplates.filter((x) => x.id !== t.id), t]
    else templateStore.save(t)
  })
  ipcMain.handle('templates:delete', (_e, id: string) => {
    if (isDemo()) demoTemplates = demoTemplates.filter((x) => x.id !== id)
    else templateStore.remove(id)
  })

  ipcMain.handle('workflow:onboard', (_e, req: OnboardingRequest) => {
    const t = templates().find((x) => x.id === req.templateId)
    if (!t) throw new Error('Template not found')
    return runOnboarding(provider, t, req, emit)
  })
  ipcMain.handle('workflow:offboard', (_e, opts: OffboardingOptions) =>
    runOffboarding(provider, opts, settingsStore.get().disabledOu, emit)
  )
}
