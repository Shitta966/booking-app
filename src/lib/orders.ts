import 'server-only'
import { audit } from './audit'
import { transaction, type Queryable } from './db'
import { onOrderPaid, releaseCoupon, reverseCoupon, type RewardNotice } from './rewards'
import { getSettings, type ReferralSettings } from './settings'
import { generateOrderReference, generateTicketCode } from './tickets'

export class OrderError extends Error {}

type LockedOrder = {
  id: string
  reference: string
  org_id: string
  event_id: string
  user_id: string
  status: string
  expires_at: Date | null
  coupon_id: string | null
  discount_minor: number
}

/** Releases inventory held by unpaid orders whose reservation window has passed. */
export async function expireStaleOrders(db: Queryable) {
  const stale = await db.query<{ id: string }>(
    `select id from orders where status = 'pending_payment' and expires_at <= now() for update skip locked`,
  )
  for (const order of stale) {
    await releaseReservation(db, order.id)
    await releaseCoupon(db, order.id)
    await db.query(`update orders set status = 'expired', updated_at = now() where id = $1`, [order.id])
  }
  return stale.length
}

async function releaseReservation(db: Queryable, orderId: string) {
  await db.query(
    `update ticket_types t set quantity_reserved = greatest(0, t.quantity_reserved - i.quantity)
     from order_items i where i.order_id = $1 and i.ticket_type_id = t.id`,
    [orderId],
  )
}

async function issueTickets(db: Queryable, order: LockedOrder, holderName: string) {
  const items = await db.query<{ ticket_type_id: string; quantity: number }>(
    'select ticket_type_id, quantity from order_items where order_id = $1',
    [order.id],
  )
  for (const item of items) {
    for (let index = 0; index < item.quantity; index += 1) {
      const name = index === 0 ? holderName : `${holderName} · guest ${index}`
      await db.query(
        `insert into tickets (code, order_id, event_id, ticket_type_id, user_id, attendee_name) values ($1, $2, $3, $4, $5, $6)`,
        [generateTicketCode(), order.id, order.event_id, item.ticket_type_id, order.user_id, name],
      )
    }
  }
}

export async function createOrder(input: { userId: string; holderName: string; ticketTypeId: string; quantity: number; couponId?: string | null }) {
  const { features, referrals } = await getSettings()
  const notices: RewardNotice[] = []
  return transaction(async (db) => {
    await expireStaleOrders(db)
    const [ticket] = await db.query<{
      id: string; event_id: string; price_minor: number; quantity_total: number; quantity_sold: number; quantity_reserved: number
      max_per_order: number; sales_end: Date | null; is_active: boolean
    }>('select * from ticket_types where id = $1 for update', [input.ticketTypeId])
    if (!ticket || !ticket.is_active) throw new OrderError('This ticket type is not on sale.')

    const [event] = await db.query<{ id: string; org_id: string; status: string; end_time: Date; org_status: string; account_number: string | null; ticket_fee_percent: number; accepts_reward_coupons: boolean }>(
      `select e.id, e.org_id, e.status, e.end_time, e.accepts_reward_coupons, o.status as org_status, o.account_number, p.ticket_fee_percent
       from events e join organizations o on o.id = e.org_id join plans p on p.id = o.plan_id where e.id = $1`,
      [ticket.event_id],
    )
    if (!event || event.status !== 'published' || event.org_status !== 'active') throw new OrderError('This event is not open for booking.')
    if (new Date(event.end_time) <= new Date()) throw new OrderError('This event has ended.')
    if (ticket.sales_end && new Date(ticket.sales_end) <= new Date()) throw new OrderError('Sales for this ticket have closed.')
    if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > ticket.max_per_order) {
      throw new OrderError(`Choose between 1 and ${ticket.max_per_order} tickets.`)
    }
    if (ticket.quantity_total - ticket.quantity_sold - ticket.quantity_reserved < input.quantity) {
      throw new OrderError('Not enough tickets remain.')
    }

    // A reward coupon covers one ticket, up to its value cap.
    let discount = 0
    let couponId: string | null = null
    if (input.couponId) {
      if (!referrals.enabled) throw new OrderError('Rewards are paused at the moment.')
      if (!event.accepts_reward_coupons) throw new OrderError('This event does not accept FUTICK reward tickets.')
      if (ticket.price_minor === 0) throw new OrderError('This ticket is already free — keep your reward for a paid ticket.')
      const [coupon] = await db.query<{ id: string; status: string; expires_at: Date; value_cap_minor: number }>(
        'select id, status, expires_at, value_cap_minor from reward_coupons where id = $1 and user_id = $2 for update',
        [input.couponId, input.userId],
      )
      if (!coupon || coupon.status !== 'available') throw new OrderError('That reward has already been used.')
      if (new Date(coupon.expires_at) <= new Date()) throw new OrderError('That reward has expired.')
      couponId = coupon.id
      discount = Math.min(ticket.price_minor, Number(coupon.value_cap_minor))
    }

    const total = ticket.price_minor * input.quantity - discount
    const isFree = total === 0
    if (!isFree && !event.account_number) throw new OrderError('The organiser has not set up payment details yet.')
    const fee = Math.round((total * Number(event.ticket_fee_percent)) / 100)

    const [order] = await db.query<LockedOrder>(
      `insert into orders (reference, org_id, event_id, user_id, status, total_minor, platform_fee_minor, expires_at, coupon_id, discount_minor)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning *`,
      [generateOrderReference(), event.org_id, event.id, input.userId, isFree ? 'paid' : 'pending_payment', total, fee,
        isFree ? null : new Date(Date.now() + features.reservationMinutes * 60_000), couponId, discount],
    )
    if (couponId) await db.query(`update reward_coupons set status = 'reserved', order_id = $2 where id = $1`, [couponId, order.id])
    await db.query('insert into order_items (order_id, ticket_type_id, quantity, unit_price_minor) values ($1, $2, $3, $4)',
      [order.id, ticket.id, input.quantity, ticket.price_minor])

    if (isFree) {
      await db.query('update ticket_types set quantity_sold = quantity_sold + $2 where id = $1', [ticket.id, input.quantity])
      await issueTickets(db, order, input.holderName)
      await onOrderPaid(db, order, referrals, notices)
    } else {
      await db.query('update ticket_types set quantity_reserved = quantity_reserved + $2 where id = $1', [ticket.id, input.quantity])
    }
    await audit({ actorId: input.userId, orgId: event.org_id, action: 'order.created', entityType: 'order', entityId: order.id, metadata: { reference: order.reference, total, discount } }, db)
    return { ...order, notices }
  })
}

export async function submitPaymentReference(userId: string, orderId: string, reference: string) {
  const cleaned = reference.trim().slice(0, 120)
  if (cleaned.length < 4) throw new OrderError('Enter the transfer reference from your bank receipt.')
  return transaction(async (db) => {
    await expireStaleOrders(db)
    const [order] = await db.query<LockedOrder>('select * from orders where id = $1 and user_id = $2 for update', [orderId, userId])
    if (!order) throw new OrderError('Order not found.')
    if (order.status !== 'pending_payment') throw new OrderError('This order is no longer waiting for payment.')
    // The reservation is held while the organiser reviews the transfer.
    await db.query(
      `update orders set status = 'awaiting_review', payment_reference = $2, review_note = null, expires_at = null, updated_at = now() where id = $1`,
      [order.id, cleaned],
    )
    await audit({ actorId: userId, orgId: order.org_id, action: 'order.payment_submitted', entityType: 'order', entityId: order.id }, db)
    return order
  })
}

export async function cancelOwnOrder(userId: string, orderId: string) {
  return transaction(async (db) => {
    const [order] = await db.query<LockedOrder>('select * from orders where id = $1 and user_id = $2 for update', [orderId, userId])
    if (!order || !['pending_payment', 'awaiting_review'].includes(order.status)) throw new OrderError('This order cannot be cancelled.')
    await releaseReservation(db, order.id)
    await releaseCoupon(db, order.id)
    await db.query(`update orders set status = 'cancelled', updated_at = now() where id = $1`, [order.id])
    await audit({ actorId: userId, orgId: order.org_id, action: 'order.cancelled_by_attendee', entityType: 'order', entityId: order.id }, db)
  })
}

export async function confirmOrder(orgId: string, reviewerId: string, orderId: string, rules?: ReferralSettings): Promise<RewardNotice[]> {
  const referrals = rules ?? (await getSettings()).referrals
  const notices: RewardNotice[] = []
  return transaction(async (db) => {
    const [order] = await db.query<LockedOrder>('select * from orders where id = $1 and org_id = $2 for update', [orderId, orgId])
    if (!order) throw new OrderError('Order not found.')
    if (order.status === 'paid') return notices
    if (!['pending_payment', 'awaiting_review'].includes(order.status)) throw new OrderError('Only unpaid orders can be confirmed.')
    if (order.status === 'pending_payment' && order.expires_at && new Date(order.expires_at) <= new Date()) {
      throw new OrderError('The reservation expired before payment was confirmed.')
    }
    const items = await db.query<{ ticket_type_id: string; quantity: number }>('select ticket_type_id, quantity from order_items where order_id = $1', [order.id])
    for (const item of items) {
      const updated = await db.query(
        `update ticket_types set quantity_reserved = quantity_reserved - $2, quantity_sold = quantity_sold + $2
         where id = $1 and quantity_reserved >= $2 returning id`,
        [item.ticket_type_id, item.quantity],
      )
      if (!updated.length) throw new OrderError('The reserved tickets are no longer held for this order.')
    }
    const [holder] = await db.query<{ full_name: string; email: string }>('select full_name, email from users where id = $1', [order.user_id])
    await issueTickets(db, order, holder?.full_name || holder?.email || 'Attendee')
    await db.query(
      `update orders set status = 'paid', reviewed_by = $2, reviewed_at = now(), expires_at = null, updated_at = now() where id = $1`,
      [order.id, reviewerId],
    )
    await onOrderPaid(db, order, referrals, notices)
    await audit({ actorId: reviewerId, orgId, action: 'order.confirmed', entityType: 'order', entityId: order.id }, db)
    return notices
  })
}

export async function rejectPayment(orgId: string, reviewerId: string, orderId: string, note: string) {
  const { features } = await getSettings()
  return transaction(async (db) => {
    const [order] = await db.query<LockedOrder>('select * from orders where id = $1 and org_id = $2 for update', [orderId, orgId])
    if (!order || order.status !== 'awaiting_review') throw new OrderError('Only orders awaiting review can be rejected.')
    await db.query(
      `update orders set status = 'pending_payment', review_note = $2, reviewed_by = $3, reviewed_at = now(),
         expires_at = $4, updated_at = now() where id = $1`,
      [order.id, note.trim().slice(0, 300) || 'Payment could not be verified.', reviewerId, new Date(Date.now() + features.reservationMinutes * 60_000)],
    )
    await audit({ actorId: reviewerId, orgId, action: 'order.payment_rejected', entityType: 'order', entityId: order.id }, db)
  })
}

/** Cancels an order from the organiser side, voiding any issued tickets and returning inventory. */
export async function cancelOrderAsOrganizer(orgId: string, actorId: string, orderId: string) {
  return transaction(async (db) => {
    const [order] = await db.query<LockedOrder>('select * from orders where id = $1 and org_id = $2 for update', [orderId, orgId])
    if (!order || ['cancelled', 'expired'].includes(order.status)) throw new OrderError('This order cannot be cancelled.')
    if (order.status === 'paid') {
      const used = await db.query(`select 1 from tickets where order_id = $1 and status = 'checked_in' limit 1`, [order.id])
      if (used.length) throw new OrderError('A ticket on this order has already been checked in.')
      await db.query(
        `update ticket_types t set quantity_sold = greatest(0, t.quantity_sold - i.quantity)
         from order_items i where i.order_id = $1 and i.ticket_type_id = t.id`,
        [order.id],
      )
      await db.query(`update tickets set status = 'cancelled' where order_id = $1`, [order.id])
      await reverseCoupon(db, order.id)
    } else {
      await releaseReservation(db, order.id)
      await releaseCoupon(db, order.id)
    }
    await db.query(`update orders set status = 'cancelled', reviewed_by = $2, reviewed_at = now(), updated_at = now() where id = $1`, [order.id, actorId])
    await audit({ actorId, orgId, action: 'order.cancelled_by_organizer', entityType: 'order', entityId: order.id }, db)
  })
}
