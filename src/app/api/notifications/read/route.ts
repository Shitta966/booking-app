import { NextResponse } from 'next/server'
import { apiUser } from '@/lib/apiAuth'
import { query } from '@/lib/db'

export async function POST(request: Request) {
  const auth = await apiUser(request)
  if ('error' in auth) return auth.error
  const body = (await request.json().catch(() => ({}))) as { ids?: unknown }
  const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100) : null
  if (ids) await query('update notifications set read_at = now() where user_id = $1 and id = any($2::uuid[]) and read_at is null', [auth.user.id, ids])
  else await query('update notifications set read_at = now() where user_id = $1 and read_at is null', [auth.user.id])
  return NextResponse.json({ ok: true })
}
