import { NextResponse } from 'next/server'
import { apiUser } from '@/lib/apiAuth'
import { query } from '@/lib/db'

export async function GET(request: Request) {
  const auth = await apiUser(request)
  if ('error' in auth) return auth.error
  const [items, [{ unread }]] = await Promise.all([
    query<{ id: string; kind: string; title: string; body: string; href: string | null; read_at: Date | null; created_at: Date }>(
      'select id, kind, title, body, href, read_at, created_at from notifications where user_id = $1 order by created_at desc limit 20',
      [auth.user.id],
    ),
    query<{ unread: number }>('select count(*) as unread from notifications where user_id = $1 and read_at is null', [auth.user.id]),
  ])
  return NextResponse.json({ unread, items }, { headers: { 'cache-control': 'no-store' } })
}
