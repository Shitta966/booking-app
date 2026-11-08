export type CheckoutRequest = {
  orderId: string
  orderReference: string
  /** Unique per attempt: Stripe uses it as an idempotency key, Flutterwave as tx_ref. */
  attemptRef: string
  amountMinor: number
  currency: 'NGN'
  description: string
  customer: { email: string; name: string }
  returnUrl: string
  cancelUrl: string
}

export type CheckoutStart = { url: string; providerRef: string }

/** The gateway's own record of a payment, fetched server-to-server (never trusted from the browser). */
export type VerifiedPayment = {
  paid: boolean
  amountMinor: number
  currency: string
  orderId: string | null
  providerRef: string
  providerTxnId: string | null
}

export class GatewayError extends Error {}
