import 'server-only'
import { NextResponse } from 'next/server'
import { getCurrentUser } from './auth'

/**
 * Rejects state-changing API calls that come from another site. Session cookies are SameSite=Lax,
 * and this Origin check is a second line of defence against cross-site request forgery.
 */
export function isSameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return request.method === 'GET'
  try {
    return new URL(origin).host === request.headers.get('host')
  } catch {
    return false
  }
}

export async function apiUser(request: Request) {
  if (!isSameOrigin(request)) return { error: NextResponse.json({ error: 'Cross-site request blocked.' }, { status: 403 }) } as const
  const user = await getCurrentUser()
  if (!user) return { error: NextResponse.json({ error: 'Sign in required.' }, { status: 401 }) } as const
  return { user } as const
}
