import { NextResponse } from 'next/server'
import { unstable_rethrow } from 'next/navigation'
import { isSameOrigin } from '@/lib/apiAuth'
import { requireOrgAccess } from '@/lib/auth'
import { checkInTicket } from '@/lib/checkin'
import { query } from '@/lib/db'
import { hit } from '@/lib/rateLimit'

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Cross-site request blocked.' }, { status: 403 })
  const body = await request.json().catch(() => null) as { orgId?: string; eventId?: string; payload?: string } | null
  if (!body?.orgId || !body.eventId || typeof body.payload !== 'string' || body.payload.length > 300) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  let userId: string
  try {
    const access = await requireOrgAccess(body.orgId, 'checkin.scan')
    if (access.org.status === 'suspended' && !access.viaSuperAdmin) return NextResponse.json({ error: 'Organisation suspended.' }, { status: 403 })
    userId = access.user.id
  } catch (error) {
    unstable_rethrow(error)
    return NextResponse.json({ error: 'You do not have scanner access for this organisation.' }, { status: 403 })
  }
  // A busy gate scans a few tickets a minute; this stops scripted guessing of ticket codes.
  if (!(await hit(`checkin:${userId}`, 120, 60))) return NextResponse.json({ error: 'Scanning too fast. Wait a moment.' }, { status: 429 })
  const result = await checkInTicket({ orgId: body.orgId, eventId: body.eventId, scannedBy: userId, payload: body.payload })
  const [counts] = await query<{ issued: number; checked_in: number }>(
    `select count(*) filter (where status <> 'cancelled') as issued, count(*) filter (where status = 'checked_in') as checked_in
     from tickets where event_id = $1`,
    [body.eventId],
  )
  return NextResponse.json({ ...result, counts })
}
