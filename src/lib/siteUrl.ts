import 'server-only'
import { headers } from 'next/headers'

/** Public base URL for links that leave the site (invites, payment return pages). */
export async function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '')
  if (configured && !configured.includes('localhost')) return configured
  const list = await headers()
  const host = list.get('x-forwarded-host') ?? list.get('host') ?? 'localhost:3000'
  const protocol = list.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${protocol}://${host}`
}
