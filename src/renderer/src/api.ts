// Renderer API. Inside Electron this proxies to the main process over IPC;
// in a plain browser (npm run web) it runs the demo tenant in-page.
import type { BarkerApi, OnboardingTemplate, Settings, WorkflowProgress } from '@shared/types'
import { defaultSettings } from '@shared/types'
import { MockProvider } from '@shared/mockProvider'
import { demoTemplates } from '@shared/mockData'
import { runOffboarding, runOnboarding } from '@shared/workflows'

function browserDemoApi(): BarkerApi {
  const p = new MockProvider()
  let settings: Settings = { ...defaultSettings }
  let templates: OnboardingTemplate[] = [...demoTemplates]
  const listeners = new Set<(x: WorkflowProgress) => void>()
  const emit = (x: WorkflowProgress) => listeners.forEach((l) => l(x))

  const dir = Object.fromEntries(
    Object.getOwnPropertyNames(MockProvider.prototype)
      .filter((k) => k !== 'constructor' && !['tick', 'u', 'g', 'recount', 'touch'].includes(k))
      .map((k) => [k, (...a: unknown[]) => (p as any)[k](...a)])
  )

  return {
    ...(dir as unknown as BarkerApi),
    getSettings: async () => settings,
    saveSettings: async (s) => {
      settings = s
    },
    signIn: async () => {
      throw new Error('Live sign-in is only available in the desktop app')
    },
    signOut: async () => undefined,
    listTemplates: async () => templates,
    saveTemplate: async (t) => {
      templates = [...templates.filter((x) => x.id !== t.id), t]
    },
    deleteTemplate: async (id) => {
      templates = templates.filter((x) => x.id !== id)
    },
    runOnboarding: async (req) => {
      const t = templates.find((x) => x.id === req.templateId)
      if (!t) throw new Error('Template not found')
      return runOnboarding(p, t, req, emit)
    },
    runOffboarding: (opts) => runOffboarding(p, opts, settings.disabledOu, emit),
    onWorkflowProgress: (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    }
  }
}

/** Electron prefixes IPC errors with "Error invoking remote method ...". Strip it. */
function cleanErrors(api: BarkerApi): BarkerApi {
  return new Proxy(api, {
    get(target, key) {
      const v = (target as any)[key]
      if (typeof v !== 'function' || key === 'onWorkflowProgress') return v
      return async (...args: unknown[]) => {
        try {
          return await v(...args)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          throw new Error(msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
        }
      }
    }
  })
}

export const isDesktop = typeof window !== 'undefined' && !!window.barkerbot
export const api: BarkerApi = cleanErrors(window.barkerbot ?? browserDemoApi())

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
