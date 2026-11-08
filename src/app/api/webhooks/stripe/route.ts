import { NextResponse } from 'next/server'
import { finalizeOnlinePayment } from '@/lib/payments'
import { getPaymentConfig } from '@/lib/payments/config'
import { readStripeWebhook } from '@/lib/payments/stripe'

/** Stripe → FUTICK. Confirms payments even if the buyer closes the tab before returning. */
export async function POST(request: Request) {
  const config = await getPaymentConfig()
  const { secretKey, webhookSecret } = config.stripe
  if (!secretKey || !webhookSecret) return NextResponse.json({ error: 'Stripe webhooks are not configured.' }, { status: 503 })
  const signature = request.headers.get('stripe-signature')
  if (!signature) return NextResponse.json({ error: 'Missing signature.' }, { status: 400 })

  let sessionId: string | null
  try {
    sessionId = readStripeWebhook(secretKey, webhookSecret, await request.text(), signature)
  } catch {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 })
  }
  if (!sessionId) return NextResponse.json({ received: true })
  try {
    const outcome = await finalizeOnlinePayment('stripe', sessionId)
    return NextResponse.json({ received: true, outcome: outcome.kind })
  } catch (error) {
    console.error('[futick] stripe webhook failed', error)
    // A 500 makes Stripe retry later.
    return NextResponse.json({ error: 'Processing failed.' }, { status: 500 })
  }
}
