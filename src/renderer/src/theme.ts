import { createLightTheme, type BrandVariants, type Theme } from '@fluentui/react-components'

// Admin-center style blue brand ramp.
const brand: BrandVariants = {
  10: '#020305', 20: '#111723', 30: '#16263D', 40: '#193253', 50: '#1B3F6A', 60: '#1B4C82',
  70: '#18599B', 80: '#1267B4', 90: '#0F6CBD', 100: '#2B7FCC', 110: '#4A90D3', 120: '#65A1DA',
  130: '#7FB2E1', 140: '#99C3E8', 150: '#B3D4EF', 160: '#CDE5F6'
}

export const theme: Theme = { ...createLightTheme(brand) }
export const HEADER_BG = '#0f6cbd'
