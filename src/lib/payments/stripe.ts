import 'server-only'
import Stripe from 'stripe'
import { GatewayError, type CheckoutRequest, type CheckoutStart, type VerifiedPayment } from './types'

function client(secretKey: string) {
  return new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 20_000 })
}

/** Creates a Stripe Checkout Session for one order. */
export async function startStripeCheckout(secretKey: string, request: CheckoutRequest): Promise<CheckoutStart> {
  try {
    const session = await client(secretKey).checkout.sessions.create({
      mode: 'payment',
      client_reference_id: request.orderId,
      customer_email: request.customer.email,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: request.currency.toLowerCase(),
          unit_amount: request.amountMinor,
          product_data: { name: request.description },
        },
      }],
      metadata: { orderId: request.orderId, orderReference: request.orderReference },
      payment_intent_data: { metadata: { orderId: request.orderId, orderReference: request.orderReference } },
      success_url: `${request.returnUrl}${request.returnUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: request.cancelUrl,
      // Stripe's minimum session lifetime is 30 minutes.
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
    }, { idempotencyKey: request.attemptRef })
    if (!session.url) throw new GatewayError('Stripe did not return a checkout page.')
    return { url: session.url, providerRef: session.id }
  } catch (error) {
    if (error instanceof GatewayError) throw error
    throw new GatewayError(error instanceof Error ? `Stripe: ${error.message}` : 'Stripe checkout failed.')
  }
}

export async function verifyStripePayment(secretKey: string, sessionId: string): Promise<VerifiedPayment> {
  const session = await client(secretKey).checkout.sessions.retrieve(sessionId)
  return {
    paid: session.payment_status === 'paid' && session.status === 'complete',
    amountMinor: session.amount_total ?? 0,
    currency: (session.currency ?? '').toUpperCase(),
    orderId: session.metadata?.orderId ?? session.client_reference_id ?? null,
    providerRef: session.id,
    providerTxnId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
  }
}

/** Verifies a webhook's Stripe-Signature header and returns the Checkout Session id it concerns, if any. */
export function readStripeWebhook(secretKey: string, webhookSecret: string, body: string, signature: string) {
  const event = client(secretKey).webhooks.constructEvent(body, signature, webhookSecret)
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    return (event.data.object as Stripe.Checkout.Session).id
  }
  return null
}

/** Cheap authenticated call used by the admin "Test connection" button. */
export async function testStripe(secretKey: string) {
  const balance = await client(secretKey).balance.retrieve()
  return `Connected. Available balance in ${balance.available.map((entry) => entry.currency.toUpperCase()).join(', ') || 'no currencies yet'}.`
}
