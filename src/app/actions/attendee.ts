'use server'

import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { back, errorMessage, text } from '@/lib/forms'
import { queryOne } from '@/lib/db'
import { notify, orgStaff } from '@/lib/notify'
import { hit } from '@/lib/rateLimit'
import { cancelOwnOrder, createOrder, OrderError, submitPaymentReference } from '@/lib/orders'
import { sendRewardNotices } from '@/lib/rewards'

export async function bookTickets(form: FormData) {
  const eventId = text(form, 'event_id', 64)
  const user = await requireUser(`/events/${eventId}`)
  if (!(await hit(`book:${user.id}`, 20, 3600))) back(`/events/${eventId}`, { error: 'Too many bookings in a short time. Try again later.' })
  let orderId: string
  try {
    const order = await createOrder({
      userId: user.id,
      holderName: user.full_name || user.email,
      ticketTypeId: text(form, 'ticket_type_id', 64),
      quantity: Number(form.get('quantity') ?? 1),
      couponId: /^[0-9a-f-]{36}$/i.test(text(form, 'coupon_id', 64)) ? text(form, 'coupon_id', 64) : null,
    })
    orderId = order.id
    await sendRewardNotices(order.notices)
    if (order.status === 'paid') {
      await notify([user.id], { kind: 'order.paid', title: 'Your tickets are ready', body: `Order ${order.reference} is confirmed. Show the QR code at the entrance.`, href: '/tickets' })
    }
  } catch (error) {
    if (error instanceof OrderError) back(`/events/${eventId}`, { error: error.message })
    throw error
  }
  redirect(`/orders/${orderId}`)
}

export async function submitPayment(form: FormData) {
  const orderId = text(form, 'order_id', 64)
  const user = await requireUser(`/orders/${orderId}`)
  if (!(await hit(`payment:${user.id}`, 10, 3600))) back(`/orders/${orderId}`, { error: 'Too many attempts. Try again later.' })
  try {
    const order = await submitPaymentReference(user.id, orderId, text(form, 'payment_reference', 120))
    const event = await queryOne<{ title: string }>('select title from events where id = $1', [order.event_id])
    await notify(await orgStaff(order.org_id), {
      kind: 'payment.submitted', title: 'Payment to review',
      body: `${user.full_name || user.email} says they paid for order ${order.reference} (${event?.title ?? 'event'}).`,
      href: `/dashboard/${order.org_id}/orders?status=awaiting_review`,
    })
  } catch (error) {
    back(`/orders/${orderId}`, { error: errorMessage(error) })
  }
  back(`/orders/${orderId}`, { ok: 'Thanks — the organiser will confirm your transfer and issue your tickets.' })
}

export async function cancelOrder(form: FormData) {
  const orderId = text(form, 'order_id', 64)
  const user = await requireUser(`/orders/${orderId}`)
  try {
    await cancelOwnOrder(user.id, orderId)
  } catch (error) {
    back(`/orders/${orderId}`, { error: errorMessage(error) })
  }
  back('/tickets', { ok: 'Order cancelled.' })
}
