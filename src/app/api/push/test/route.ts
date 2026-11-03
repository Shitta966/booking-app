import { NextResponse } from 'next/server'
import { apiUser } from '@/lib/apiAuth'
import { sendPush } from '@/lib/push'
import { hit } from '@/lib/rateLimit'

/** Sends a test alert to every device the signed-in user has turned push on for. */
export async function POST(request: Request) {
  const auth = await apiUser(request)
  if ('error' in auth) return auth.error
  if (!(await hit(`push-test:${auth.user.id}`, 5, 600))) return NextResponse.json({ error: 'Too many test alerts. Wait a few minutes.' }, { status: 429 })
  const result = await sendPush([auth.user.id], {
    title: 'FUTICK test alert',
    body: 'Push alerts are working on this device.',
    href: '/notifications',
    tag: 'push-test',
  })
  return NextResponse.json(result)
}
