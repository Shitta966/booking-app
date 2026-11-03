import 'server-only'
import { cache } from 'react'
import { connection } from 'next/server'
import { query } from './db'

export type Branding = { appName: string; tagline: string; supportEmail: string; primaryColor: string }
export type Homepage = { heroTitle: string; heroSubtitle: string; announcement: string }
export type FeatureSwitches = { signupsOpen: boolean; organizerApplicationsOpen: boolean; reservationMinutes: number }

export type PlatformSettings = { branding: Branding; homepage: Homepage; features: FeatureSwitches }

export const DEFAULT_SETTINGS: PlatformSettings = {
  branding: { appName: 'FUTICK', tagline: 'Corporate events and tickets for FUT Minna', supportEmail: 'support@futick.ng', primaryColor: '#2b3fd9' },
  homepage: { heroTitle: 'Plan it. Ticket it. Check them in.', heroSubtitle: '', announcement: '' },
  features: { signupsOpen: true, organizerApplicationsOpen: true, reservationMinutes: 30 },
}

export const getSettings = cache(async (): Promise<PlatformSettings> => {
  // Every page renders this from the root layout, so this also keeps the database out of build-time prerendering.
  await connection()
  const rows = await query<{ key: keyof PlatformSettings; value: Record<string, unknown> }>('select key, value from platform_settings')
  const settings = structuredClone(DEFAULT_SETTINGS)
  for (const row of rows) {
    if (row.key in settings) Object.assign(settings[row.key], row.value)
  }
  return settings
})
