import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Toast, ToastBody, ToastTitle, useToastController, type ToastIntent } from '@fluentui/react-components'
import type { ConnectionStatus, DirGroup, DirUser, LicenseSku, Settings, WorkflowResult } from '@shared/types'
import { api, errMsg } from './api'

export type Page = 'home' | 'users' | 'groups' | 'onboarding' | 'offboarding' | 'templates' | 'settings'

interface Ctx {
  page: Page
  pageParam?: string
  navigate(p: Page, param?: string): void
  status: ConnectionStatus | null
  settings: Settings | null
  users: DirUser[]
  groups: DirGroup[]
  licenses: LicenseSku[]
  loading: boolean
  loadError: string | null
  reload(): Promise<void>
  refreshStatus(): Promise<void>
  setSettings(s: Settings): Promise<void>
  notify(title: string, body?: string, intent?: ToastIntent): void
  /** Run an action, toast on failure, return success. */
  attempt(fn: () => Promise<unknown>, success?: string): Promise<boolean>
  history: WorkflowResult[]
  addHistory(r: WorkflowResult): void
  search: string
  setSearch(s: string): void
}

const AppCtx = createContext<Ctx | null>(null)
export const TOASTER_ID = 'app-toaster'

export function AppProvider({ children }: { children: ReactNode }) {
  const { dispatchToast } = useToastController(TOASTER_ID)
  const [page, setPage] = useState<Page>('home')
  const [pageParam, setPageParam] = useState<string>()
  const [status, setStatus] = useState<ConnectionStatus | null>(null)
  const [settings, setSettingsState] = useState<Settings | null>(null)
  const [users, setUsers] = useState<DirUser[]>([])
  const [groups, setGroups] = useState<DirGroup[]>([])
  const [licenses, setLicenses] = useState<LicenseSku[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [history, setHistory] = useState<WorkflowResult[]>([])
  const [search, setSearch] = useState('')

  const notify = useCallback(
    (title: string, body?: string, intent: ToastIntent = 'success') =>
      dispatchToast(
        <Toast>
          <ToastTitle>{title}</ToastTitle>
          {body && <ToastBody>{body}</ToastBody>}
        </Toast>,
        { intent, timeout: intent === 'error' ? 8000 : 4000 }
      ),
    [dispatchToast]
  )

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await api.status())
    } catch (e) {
      setStatus(null)
      setLoadError(errMsg(e))
    }
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [u, g, l] = await Promise.all([api.listUsers(), api.listGroups(), api.listLicenses()])
      setUsers(u)
      setGroups(g)
      setLicenses(l)
    } catch (e) {
      setLoadError(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const attempt = useCallback(
    async (fn: () => Promise<unknown>, success?: string) => {
      try {
        await fn()
        if (success) notify(success)
        return true
      } catch (e) {
        notify('Something went wrong', errMsg(e), 'error')
        return false
      }
    },
    [notify]
  )

  const setSettings = useCallback(
    async (s: Settings) => {
      await api.saveSettings(s)
      setSettingsState(s)
      await refreshStatus()
      await reload()
    },
    [refreshStatus, reload]
  )

  useEffect(() => {
    api.getSettings().then(setSettingsState)
    refreshStatus()
    reload()
  }, [refreshStatus, reload])

  const value = useMemo<Ctx>(
    () => ({
      page,
      pageParam,
      navigate: (p, param) => {
        setPage(p)
        setPageParam(param)
      },
      status,
      settings,
      users,
      groups,
      licenses,
      loading,
      loadError,
      reload,
      refreshStatus,
      setSettings,
      notify,
      attempt,
      history,
      addHistory: (r) => {
        setHistory((h) => [r, ...h].slice(0, 20))
        refreshStatus()
      },
      search,
      setSearch
    }),
    [page, pageParam, status, settings, users, groups, licenses, loading, loadError, reload, refreshStatus, setSettings, notify, attempt, history, search]
  )

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export function useApp(): Ctx {
  const c = useContext(AppCtx)
  if (!c) throw new Error('useApp outside provider')
  return c
}
