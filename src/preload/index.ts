import { contextBridge, ipcRenderer } from 'electron'

const dir = [
  'status', 'listUsers', 'getUser', 'createUser', 'updateUser', 'setManager', 'setUserEnabled',
  'resetPassword', 'deleteUser', 'revokeSessions', 'moveUser', 'setHiddenFromGal',
  'convertMailboxToShared', 'setForwarding', 'listGroups', 'getGroupMembers', 'addGroupMember',
  'removeGroupMember', 'createGroup', 'listLicenses', 'setUserLicenses', 'triggerSync', 'waitForCloudUser'
] as const

const api: Record<string, unknown> = Object.fromEntries(
  dir.map((m) => [m, (...args: unknown[]) => ipcRenderer.invoke(`dir:${m}`, ...args)])
)

Object.assign(api, {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s: unknown) => ipcRenderer.invoke('settings:save', s),
  signIn: () => ipcRenderer.invoke('auth:signIn'),
  signOut: () => ipcRenderer.invoke('auth:signOut'),
  listTemplates: () => ipcRenderer.invoke('templates:list'),
  saveTemplate: (t: unknown) => ipcRenderer.invoke('templates:save', t),
  deleteTemplate: (id: string) => ipcRenderer.invoke('templates:delete', id),
  runOnboarding: (r: unknown) => ipcRenderer.invoke('workflow:onboard', r),
  runOffboarding: (o: unknown) => ipcRenderer.invoke('workflow:offboard', o),
  onWorkflowProgress: (cb: (p: unknown) => void) => {
    const h = (_e: unknown, p: unknown) => cb(p)
    ipcRenderer.on('workflow:progress', h)
    return () => ipcRenderer.removeListener('workflow:progress', h)
  }
})

contextBridge.exposeInMainWorld('barkerbot', api)
