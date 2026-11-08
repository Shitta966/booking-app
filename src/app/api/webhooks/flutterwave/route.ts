import { NextResponse } from 'next/server'
import { finalizeOnlinePayment } from '@/lib/payments'
import { getPaymentConfig } from '@/lib/payments/config'
import { flutterwaveSignatureValid } from '@/lib/payments/flutterwave'

/** Flutterwave → FUTICK. The body is only used to find the payment; its status is re-checked with Flutterwave. */
export async function POST(request: Request) {
  const config = await getPaymentConfig()
  if (!config.flutterwave.secretKey || !config.flutterwave.webhookSecret) {
    return NextResponse.json({ error: 'Flutterwave webhooks are not configured.' }, { status: 503 })
  }
  if (!flutterwaveSignatureValid(config.flutterwave.webhookSecret, request.headers.get('verif-hash'))) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 })
  }
  const body = (await request.json().catch(() => null)) as { event?: string; data?: { tx_ref?: string } } | null
  const txRef = body?.data?.tx_ref
  if (!txRef || (body?.event && body.event !== 'charge.completed')) return NextResponse.json({ received: true })
  try {
    const outcome = await finalizeOnlinePayment('flutterwave', txRef)
    return NextResponse.json({ received: true, outcome: outcome.kind })
  } catch (error) {
    console.error('[futick] flutterwave webhook failed', error)
    return NextResponse.json({ error: 'Processing failed.' }, { status: 500 })
  }
}
