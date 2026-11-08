import 'server-only'
import crypto from 'node:crypto'
import { GatewayError, type CheckoutRequest, type CheckoutStart, type VerifiedPayment } from './types'

const API = 'https://api.flutterwave.com/v3'

async function call<T>(secretKey: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${secretKey}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
    cache: 'no-store',
  })
  const body = (await response.json().catch(() => ({}))) as { status?: string; message?: string; data?: T }
  if (!response.ok || body.status !== 'success') {
    throw new GatewayError(`Flutterwave: ${body.message ?? `request failed (${response.status})`}`)
  }
  return body.data as T
}

/** Starts Flutterwave Standard: the buyer pays by card, bank transfer or USSD on Flutterwave's page. */
export async function startFlutterwaveCheckout(secretKey: string, request: CheckoutRequest): Promise<CheckoutStart> {
  const data = await call<{ link: string }>(secretKey, '/payments', {
    method: 'POST',
    body: JSON.stringify({
      tx_ref: request.attemptRef,
      amount: (request.amountMinor / 100).toFixed(2),
      currency: request.currency,
      redirect_url: request.returnUrl,
      customer: { email: request.customer.email, name: request.customer.name },
      customizations: { title: 'FUTICK', description: request.description },
      meta: { orderId: request.orderId, orderReference: request.orderReference },
    }),
  })
  if (!data?.link) throw new GatewayError('Flutterwave did not return a checkout page.')
  return { url: data.link, providerRef: request.attemptRef }
}

export async function verifyFlutterwavePayment(secretKey: string, txRef: string): Promise<VerifiedPayment> {
  const data = await call<{ id: number; status: string; amount: number; currency: string; tx_ref: string; meta?: { orderId?: string } }>(
    secretKey, `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`,
  )
  return {
    paid: data.status === 'successful',
    amountMinor: Math.round(Number(data.amount) * 100),
    currency: String(data.currency ?? '').toUpperCase(),
    orderId: data.meta?.orderId ?? null,
    providerRef: data.tx_ref,
    providerTxnId: data.id ? String(data.id) : null,
  }
}

/** Flutterwave signs webhooks by sending the dashboard "secret hash" in the verif-hash header. */
export function flutterwaveSignatureValid(webhookHash: string, header: string | null) {
  if (!webhookHash || !header) return false
  const expected = Buffer.from(webhookHash)
  const actual = Buffer.from(header)
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}

export async function testFlutterwave(secretKey: string) {
  const balances = await call<Array<{ currency: string }>>(secretKey, '/balances')
  return `Connected. Wallets: ${balances.map((entry) => entry.currency).join(', ') || 'none yet'}.`
}
