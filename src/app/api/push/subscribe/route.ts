import { NextResponse } from 'next/server'
import { apiUser } from '@/lib/apiAuth'
import { query } from '@/lib/db'
import { getVapidKeys } from '@/lib/push'
import { hit } from '@/lib/rateLimit'

export async function GET(request: Request) {
  const auth = await apiUser(request)
  if ('error' in auth) return auth.error
  const keys = getVapidKeys()
  return NextResponse.json({ enabled: Boolean(keys), publicKey: keys?.publicKey ?? null })
}

export async function POST(request: Request) {
  const auth = await apiUser(request)
  if ('error' in auth) return auth.error
  if (!(await hit(`push:${auth.user.id}`, 20, 3600))) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  const body = (await request.json().catch(() => null)) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | null
  const endpoint = body?.endpoint
  if (!endpoint || !/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !body?.keys?.p256dh || !body.keys.auth) {
    return NextResponse.json({ error: 'Invalid subscription.' }, { status: 400 })
  }
  await query(
    `insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) values ($1, $2, $3, $4, $5)
     on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent`,
    [auth.user.id, endpoint, body.keys.p256dh.slice(0, 200), body.keys.auth.slice(0, 100), request.headers.get('user-agent')?.slice(0, 300) ?? null],
  )
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const auth = await apiUser(request)
  if ('error' in auth) return auth.error
  const body = (await request.json().catch(() => null)) as { endpoint?: string } | null
  if (body?.endpoint) await query('delete from push_subscriptions where user_id = $1 and endpoint = $2', [auth.user.id, body.endpoint])
  return NextResponse.json({ ok: true })
}
