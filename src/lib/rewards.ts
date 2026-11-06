import 'server-only'
import crypto from 'node:crypto'
import type { Queryable } from './db'
import { query } from './db'
import { notify, orgStaff, type NotificationKind } from './notify'
import type { ReferralSettings } from './settings'

/**
 * Refer & earn.
 *
 * Attendees share a referral link. A referred friend "qualifies" when their first order is paid (free
 * tickets count). Every `friendsPerReward` qualified friends earns the referrer a free-ticket coupon that
 * covers one ticket up to `couponCapMinor` at events that accept rewards. When a coupon pays for a ticket,
 * the organiser earns that amount as credit; `proThresholdMinor` of credit unlocks months of FUTICK Pro.
 *
 * Functions that take `db` run inside the caller's transaction and must not call query() themselves.
 * They collect notices, which the caller sends with sendRewardNotices() after the transaction commits.
 */

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function randomCode(length: number) {
  return [...crypto.randomBytes(length)].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('')
}

export const generateReferralCode = () => randomCode(8)
export const generateCouponCode = () => `FREE-${randomCode(4)}-${randomCode(4)}`

export type RewardNotice = {
  userIds?: string[]
  /** Send to the organisation's owners, admins and organisers. */
  orgId?: string
  kind: NotificationKind
  title: string
  body: string
  href: string
}

export async function sendRewardNotices(notices: RewardNotice[]) {
  for (const notice of notices) {
    const recipients = notice.orgId ? await orgStaff(notice.orgId) : notice.userIds ?? []
    await notify(recipients, { kind: notice.kind, title: notice.title, body: notice.body, href: notice.href })
  }
}

/** Returns the user's referral code, creating one the first time it is needed. */
export async function ensureReferralCode(userId: string) {
  const [row] = await query<{ referral_code: string | null }>('select referral_code from users where id = $1', [userId])
  if (row?.referral_code) return row.referral_code
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateReferralCode()
    const updated = await query<{ referral_code: string }>(
      `update users set referral_code = $2 where id = $1 and referral_code is null
       and not exists (select 1 from users where referral_code = $2) returning referral_code`,
      [userId, code],
    )
    if (updated.length) return updated[0].referral_code
    const [again] = await query<{ referral_code: string | null }>('select referral_code from users where id = $1', [userId])
    if (again?.referral_code) return again.referral_code
  }
  throw new Error('Could not create a referral code.')
}

export function normalizeReferralCode(value: string | null | undefined) {
  const code = (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return /^[A-Z0-9]{6,12}$/.test(code) ? code : null
}

export async function findReferrer(code: string | null | undefined) {
  const normalized = normalizeReferralCode(code)
  if (!normalized) return null
  const [row] = await query<{ id: string; full_name: string; status: string }>(
    `select id, full_name, status from users where referral_code = $1`,
    [normalized],
  )
  return row && row.status === 'active' ? row : null
}

/** "Chinedu Okafor" → "Chinedu O." — how referrals and leaderboards show people publicly. */
export function shortName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'A friend'
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`
}

/** Issues every coupon the user has earned but not yet received, within the monthly cap. */
async function issueEarnedCoupons(db: Queryable, userId: string, rules: ReferralSettings, notices: RewardNotice[]) {
  await db.query('select id from users where id = $1 for update', [userId])
  const [counts] = await db.query<{ qualified: number; issued: number; this_month: number }>(
    `select (select count(*) from users where referred_by = $1 and referral_qualified_at is not null) as qualified,
            (select count(*) from reward_coupons where user_id = $1 and source = 'referral') as issued,
            (select count(*) from reward_coupons where user_id = $1 and source = 'referral'
               and created_at >= date_trunc('month', now())) as this_month`,
    [userId],
  )
  let issued = counts.issued
  let thisMonth = counts.this_month
  const entitled = Math.floor(counts.qualified / Math.max(1, rules.friendsPerReward))
  while (issued < entitled && thisMonth < rules.maxRewardsPerMonth) {
    const code = generateCouponCode()
    await db.query(
      `insert into reward_coupons (code, user_id, source, value_cap_minor, expires_at)
       values ($1, $2, 'referral', $3, now() + make_interval(days => $4))`,
      [code, userId, rules.couponCapMinor, rules.couponValidDays],
    )
    issued += 1
    thisMonth += 1
    notices.push({
      userIds: [userId], kind: 'reward.earned', title: 'You earned a free ticket!',
      body: `Five friends joined and booked. Use coupon ${code} at any event that accepts FUTICK rewards.`, href: '/rewards',
    })
  }
}

type PaidOrder = { id: string; user_id: string; org_id: string; coupon_id: string | null; discount_minor: number; reference: string }

/**
 * Runs when an order becomes paid: turns its coupon into organiser credit, and qualifies the buyer's
 * referral if this is their first paid order.
 */
export async function onOrderPaid(db: Queryable, order: PaidOrder, rules: ReferralSettings, notices: RewardNotice[]) {
  if (order.coupon_id && order.discount_minor > 0) {
    await db.query(`update reward_coupons set status = 'used', used_at = now(), order_id = $2 where id = $1`, [order.coupon_id, order.id])
    const credited = await db.query(
      `insert into org_reward_credits (org_id, order_id, amount_minor, note) values ($1, $2, $3, 'Reward ticket redeemed')
       on conflict (order_id) do nothing returning id`,
      [order.org_id, order.id, order.discount_minor],
    )
    if (credited.length) {
      notices.push({
        orgId: order.org_id, kind: 'reward.redeemed_at_event', title: 'A reward ticket was redeemed at your event',
        body: `Order ${order.reference} used a FUTICK reward. ₦${(order.discount_minor / 100).toLocaleString('en-NG')} was added to your Pro credit.`,
        href: `/dashboard/${order.org_id}/rewards`,
      })
    }
  }

  const [buyer] = await db.query<{ referred_by: string | null; referral_qualified_at: Date | null; full_name: string }>(
    'select referred_by, referral_qualified_at, full_name from users where id = $1 for update',
    [order.user_id],
  )
  if (!rules.enabled || !buyer?.referred_by || buyer.referral_qualified_at) return
  await db.query('update users set referral_qualified_at = now() where id = $1', [order.user_id])
  const [{ qualified }] = await db.query<{ qualified: number }>(
    'select count(*) as qualified from users where referred_by = $1 and referral_qualified_at is not null',
    [buyer.referred_by],
  )
  const step = Math.max(1, rules.friendsPerReward)
  const progress = qualified % step
  notices.push({
    userIds: [buyer.referred_by], kind: 'referral.qualified', title: `${shortName(buyer.full_name)} booked their first ticket`,
    body: progress === 0 ? 'That completes a set — check your rewards.' : `${progress} of ${step} friends towards your next free ticket.`,
    href: '/rewards',
  })
  await issueEarnedCoupons(db, buyer.referred_by, rules, notices)
}

/** Unpaid order cancelled or expired: the coupon goes back to its owner. */
export async function releaseCoupon(db: Queryable, orderId: string) {
  await db.query(`update reward_coupons set status = 'available', order_id = null where order_id = $1 and status = 'reserved'`, [orderId])
}

/**
 * Paid coupon order cancelled by the organiser: the attendee gets the coupon back, and the organiser loses
 * the credit if it has not been redeemed yet.
 */
export async function reverseCoupon(db: Queryable, orderId: string) {
  await db.query(`update reward_coupons set status = 'available', order_id = null, used_at = null where order_id = $1 and status in ('reserved', 'used')`, [orderId])
  await db.query('delete from org_reward_credits where order_id = $1 and redemption_id is null', [orderId])
}
