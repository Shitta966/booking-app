import 'server-only'
import crypto from 'node:crypto'
import { audit } from '../audit'
import { query, queryOne, transaction } from '../db'
import { notify, orgStaff, superAdmins } from '../notify'
import { settleOnlineOrder, type OnlineSettlement } from '../orders'
import { sendRewardNotices, type RewardNotice } from '../rewards'
import { getSettings } from '../settings'
import { getPaymentConfig, PROVIDER_LABELS, type Provider } from './config'
import { startFlutterwaveCheckout, verifyFlutterwavePayment } from './flutterwave'
import { startStripeCheckout, verifyStripePayment } from './stripe'
import { GatewayError, type VerifiedPayment } from './types'

export { GatewayError }

/** Starts an online payment for one of the user's unpaid orders and returns the gateway page to send them to. */
export async function startOnlineCheckout(input: { userId: string; email: string; name: string; orderId: string; provider: Provider; baseUrl: string }) {
  const config = await getPaymentConfig()
  const gateway = config[input.provider]
  if (!gateway.enabled) throw new GatewayError(`${PROVIDER_LABELS[input.provider]} payments are not available.`)

  const order = await queryOne<{ id: string; reference: string; status: string; total_minor: number; expires_at: Date | null; title: string }>(
    `select o.id, o.reference, o.status, o.total_minor, o.expires_at, e.title
     from orders o join events e on e.id = o.event_id where o.id = $1 and o.user_id = $2`,
    [input.orderId, input.userId],
  )
  if (!order) throw new GatewayError('Order not found.')
  if (order.status !== 'pending_payment') throw new GatewayError('This order is not waiting for payment.')
  if (order.expires_at && new Date(order.expires_at) <= new Date()) throw new GatewayError('This reservation has expired. Book again.')
  if (Number(order.total_minor) <= 0) throw new GatewayError('Nothing to pay on this order.')

  // Keep the seats held while the buyer is on the payment page.
  await query(`update orders set expires_at = greatest(expires_at, now() + interval '35 minutes'), updated_at = now() where id = $1`, [order.id])

  const attemptRef = `FTK-${order.reference}-${crypto.randomBytes(4).toString('hex')}`
  const request = {
    orderId: order.id,
    orderReference: order.reference,
    attemptRef,
    amountMinor: Number(order.total_minor),
    currency: 'NGN' as const,
    description: `${order.title} — order ${order.reference}`,
    customer: { email: input.email, name: input.name || input.email },
    returnUrl: `${input.baseUrl}/api/payments/return?provider=${input.provider}`,
    cancelUrl: `${input.baseUrl}/orders/${order.id}?error=${encodeURIComponent('Payment was cancelled. Your seats are still held for a short while.')}`,
  }
  const started = input.provider === 'stripe'
    ? await startStripeCheckout(gateway.secretKey, request)
    : await startFlutterwaveCheckout(gateway.secretKey, request)
  await query(
    `insert into payments (order_id, provider, provider_ref, amount_minor, currency) values ($1, $2, $3, $4, 'NGN')`,
    [order.id, input.provider, started.providerRef, Number(order.total_minor)],
  )
  await audit({ actorId: input.userId, action: 'payment.started', entityType: 'order', entityId: order.id, metadata: { provider: input.provider } })
  return started.url
}

export type FinalizeOutcome =
  | { kind: 'unknown' }
  | { kind: 'not_paid'; orderId: string }
  | { kind: 'paid'; orderId: string; settlement: OnlineSettlement }
  | { kind: 'refund_needed'; orderId: string; reason: string }

async function verify(provider: Provider, secretKey: string, providerRef: string): Promise<VerifiedPayment> {
  return provider === 'stripe' ? verifyStripePayment(secretKey, providerRef) : verifyFlutterwavePayment(secretKey, providerRef)
}

/**
 * Confirms a payment with the gateway (server to server) and settles the order. Safe to call more than
 * once for the same payment — from the return page and from webhooks — only the first call settles it.
 */
export async function finalizeOnlinePayment(provider: Provider, providerRef: string): Promise<FinalizeOutcome> {
  const payment = await queryOne<{ id: string; order_id: string; status: string; amount_minor: number }>(
    'select id, order_id, status, amount_minor from payments where provider = $1 and provider_ref = $2',
    [provider, providerRef],
  )
  // Only payments FUTICK started are accepted.
  if (!payment) return { kind: 'unknown' }
  if (payment.status === 'succeeded') return { kind: 'paid', orderId: payment.order_id, settlement: 'already_paid' }
  if (payment.status === 'refund_needed') return { kind: 'refund_needed', orderId: payment.order_id, reason: 'already flagged' }

  const config = await getPaymentConfig()
  const verified = await verify(provider, config[provider].secretKey, providerRef)
  if (!verified.paid) {
    await query(`update payments set status = 'failed', updated_at = now() where id = $1 and status = 'initiated'`, [payment.id])
    return { kind: 'not_paid', orderId: payment.order_id }
  }

  const { referrals } = await getSettings()
  const notices: RewardNotice[] = []
  const outcome = await transaction(async (db): Promise<FinalizeOutcome> => {
    const [locked] = await db.query<{ status: string }>('select status from payments where id = $1 for update', [payment.id])
    if (locked.status === 'succeeded') return { kind: 'paid', orderId: payment.order_id, settlement: 'already_paid' }
    if (locked.status === 'refund_needed') return { kind: 'refund_needed', orderId: payment.order_id, reason: 'already flagged' }

    const [order] = await db.query<{ total_minor: number }>('select total_minor from orders where id = $1', [payment.order_id])
    const flag = async (reason: string): Promise<FinalizeOutcome> => {
      await db.query(`update payments set status = 'refund_needed', provider_txn_id = $2, note = $3, updated_at = now() where id = $1`, [payment.id, verified.providerTxnId, reason])
      await db.query(`insert into audit_logs (action, entity_type, entity_id, metadata) values ('payment.refund_needed', 'order', $1, $2)`, [payment.order_id, JSON.stringify({ provider, providerRef, reason })])
      return { kind: 'refund_needed', orderId: payment.order_id, reason }
    }
    const amountOk = verified.amountMinor === Number(payment.amount_minor) && verified.amountMinor === Number(order?.total_minor)
    if (!order || !amountOk || verified.currency !== 'NGN' || (verified.orderId && verified.orderId !== payment.order_id)) {
      return flag(`Paid ${verified.currency} ${(verified.amountMinor / 100).toFixed(2)} does not match the order.`)
    }
    const settlement = await settleOnlineOrder(db, payment.order_id, provider, referrals, notices)
    if (settlement === 'already_paid') return flag('The order was already paid another way.')
    if (settlement === 'sold_out') return flag('The reservation expired and the tickets sold out before payment arrived.')
    await db.query(`update payments set status = 'succeeded', provider_txn_id = $2, updated_at = now() where id = $1`, [payment.id, verified.providerTxnId])
    await db.query(`insert into audit_logs (action, entity_type, entity_id, metadata) values ('payment.succeeded', 'order', $1, $2)`, [payment.order_id, JSON.stringify({ provider, providerRef, settlement })])
    return { kind: 'paid', orderId: payment.order_id, settlement }
  })

  if (outcome.kind === 'paid' && outcome.settlement !== 'already_paid') {
    await sendRewardNotices(notices)
    const info = await queryOne<{ user_id: string; org_id: string; reference: string; title: string }>(
      'select o.user_id, o.org_id, o.reference, e.title from orders o join events e on e.id = o.event_id where o.id = $1', [outcome.orderId])
    if (info) {
      await notify([info.user_id], { kind: 'order.paid', title: 'Payment received — your tickets are ready', body: `${info.title} · order ${info.reference}`, href: '/tickets' })
      await notify(await orgStaff(info.org_id), { kind: 'order.paid', title: 'Online payment received', body: `Order ${info.reference} for ${info.title} was paid with ${PROVIDER_LABELS[provider]}. Tickets were issued automatically.`, href: `/dashboard/${info.org_id}/orders?status=paid` })
    }
  }
  if (outcome.kind === 'refund_needed' && outcome.reason !== 'already flagged') {
    const info = await queryOne<{ user_id: string; reference: string }>('select user_id, reference from orders where id = $1', [outcome.orderId])
    await notify(await superAdmins(), { kind: 'payment.refund_needed', title: 'An online payment needs a refund', body: `Order ${info?.reference}: ${outcome.reason}`, href: '/admin/payments' })
    if (info) await notify([info.user_id], { kind: 'payment.refund_needed', title: 'We received your payment but could not issue tickets', body: `${outcome.reason} The FUTICK team will refund you.`, href: `/orders/${outcome.orderId}` })
  }
  return outcome
}
