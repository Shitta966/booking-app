import { NextResponse } from 'next/server'
import { finalizeOnlinePayment } from '@/lib/payments'

/** Where Stripe and Flutterwave send the buyer back after paying. The result is re-checked with the gateway. */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const provider = url.searchParams.get('provider')
  const ref = provider === 'stripe' ? url.searchParams.get('session_id') : provider === 'flutterwave' ? url.searchParams.get('tx_ref') : null
  const to = (path: string, params: Record<string, string>) => {
    const target = new URL(path, url.origin)
    for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value)
    return NextResponse.redirect(target, 303)
  }
  if (!provider || !ref || ref.length > 200) return to('/tickets', { error: 'We could not read the payment result.' })

  try {
    const outcome = await finalizeOnlinePayment(provider as 'stripe' | 'flutterwave', ref)
    if (outcome.kind === 'unknown') return to('/tickets', { error: 'We could not find that payment.' })
    const order = `/orders/${outcome.orderId}`
    if (outcome.kind === 'paid') return to(order, { ok: 'Payment received. Your tickets are ready.' })
    if (outcome.kind === 'refund_needed') return to(order, { error: `Payment received, but tickets could not be issued: ${outcome.reason} You will be refunded.` })
    return to(order, { error: url.searchParams.get('status') === 'cancelled' ? 'Payment was cancelled.' : 'Payment was not completed. You can try again.' })
  } catch (error) {
    console.error('[futick] payment return failed', error)
    return to('/tickets', { error: 'We could not confirm your payment yet. If you were charged, it will be confirmed automatically within a few minutes.' })
  }
}
