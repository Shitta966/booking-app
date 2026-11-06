import 'server-only'
import { query } from './db'
import { sendPush } from './push'

export type NotificationKind =
  | 'payment.submitted' | 'order.paid' | 'payment.rejected' | 'order.cancelled' | 'event.cancelled'
  | 'organization.applied' | 'organization.approved' | 'organization.suspended' | 'team.added' | 'security.password_changed'
  | 'referral.joined' | 'referral.qualified' | 'reward.earned' | 'reward.redeemed_at_event' | 'organization.pro_unlocked'

type Message = { kind: NotificationKind; title: string; body?: string; href?: string | null }

/**
 * Records an in-app notification for each user (shown in the bell) and sends a browser push to
 * their subscribed devices. Failures are logged but never undo the action that triggered them.
 */
export async function notify(userIds: Array<string | null | undefined>, message: Message) {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))]
  if (!ids.length) return
  try {
    await query(
      `insert into notifications (user_id, kind, title, body, href)
       select unnest($1::uuid[]), $2, $3, $4, $5`,
      [ids, message.kind, message.title, message.body ?? '', message.href ?? null],
    )
    await sendPush(ids, { title: message.title, body: message.body ?? '', href: message.href, tag: message.kind })
  } catch (error) {
    console.error('Notification failed', error)
  }
}

export async function orgStaff(orgId: string, roles = ['owner', 'admin', 'organizer']) {
  const rows = await query<{ user_id: string }>('select user_id from organization_members where org_id = $1 and role = any($2::text[])', [orgId, roles])
  return rows.map((row) => row.user_id)
}

export async function superAdmins() {
  const rows = await query<{ id: string }>(`select id from users where is_super_admin and status = 'active'`)
  return rows.map((row) => row.id)
}

/** Tells every holder of a valid ticket that the event is off. */
export async function notifyEventCancelled(eventId: string, title: string, orgName: string) {
  const holders = await query<{ user_id: string }>(`select distinct user_id from tickets where event_id = $1 and status = 'valid'`, [eventId])
  await notify(holders.map((row) => row.user_id), { kind: 'event.cancelled', title: `${title} has been cancelled`, body: `${orgName} cancelled this event. Contact them about refunds.`, href: '/tickets' })
}
