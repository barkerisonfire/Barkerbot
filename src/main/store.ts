// Small JSON stores in the user's app-data folder.
import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { defaultSettings, type OnboardingTemplate, type Settings } from '@shared/types'
import { demoTemplates } from '@shared/mockData'

function file(name: string): string {
  return join(app.getPath('userData'), name)
}

function read<T>(name: string, fallback: T): T {
  try {
    if (existsSync(file(name))) return JSON.parse(readFileSync(file(name), 'utf8')) as T
  } catch {
    /* fall through */
  }
  return fallback
}

function write(name: string, data: unknown): void {
  writeFileSync(file(name), JSON.stringify(data, null, 2))
}

export const settingsStore = {
  get: (): Settings => ({ ...defaultSettings, ...read<Partial<Settings>>('settings.json', {}) }),
  set: (s: Settings) => write('settings.json', s)
}

export const templateStore = {
  list: (): OnboardingTemplate[] => read('templates.json', demoTemplates),
  save(t: OnboardingTemplate) {
    const all = templateStore.list().filter((x) => x.id !== t.id)
    write('templates.json', [...all, t])
  },
  remove(id: string) {
    write('templates.json', templateStore.list().filter((x) => x.id !== id))
  }
}
