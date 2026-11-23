import type { BarkerApi } from '../shared/types'

declare global {
  interface Window {
    barkerbot?: BarkerApi
  }
}
