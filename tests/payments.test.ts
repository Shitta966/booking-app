import assert from 'node:assert/strict'
import { test } from 'node:test'
import Stripe from 'stripe'
import { decryptText, encryptText } from '../src/lib/encryption'
import { flutterwaveSignatureValid } from '../src/lib/payments/flutterwave'
import { readStripeWebhook } from '../src/lib/payments/stripe'

const secret = new TextEncoder().encode('server-secret-that-is-at-least-32-characters')

test('gateway secrets round-trip through encryption', () => {
  const stored = encryptText('sk_test_51abc', secret)
  assert.ok(!stored.includes('sk_test'))
  assert.equal(decryptText(stored, secret), 'sk_test_51abc')
})

test('encrypted secrets cannot be read with another key or after tampering', () => {
  const stored = encryptText('FLWSECK_TEST-123', secret)
  assert.equal(decryptText(stored, new TextEncoder().encode('a-different-secret-that-is-32-chars-long')), null)
  const parts = stored.split('.')
  parts[3] = Buffer.from('tampered').toString('base64url')
  assert.equal(decryptText(parts.join('.'), secret), null)
})

test('Flutterwave webhooks need the exact secret hash', () => {
  assert.equal(flutterwaveSignatureValid('my-hash', 'my-hash'), true)
  assert.equal(flutterwaveSignatureValid('my-hash', 'my-hasH'), false)
  assert.equal(flutterwaveSignatureValid('my-hash', null), false)
  assert.equal(flutterwaveSignatureValid('', ''), false)
})

test('Stripe webhooks are accepted only with a valid signature', () => {
  const webhookSecret = 'whsec_test_secret'
  const payload = JSON.stringify({ id: 'evt_1', object: 'event', type: 'checkout.session.completed', data: { object: { id: 'cs_test_123', object: 'checkout.session' } } })
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret })
  assert.equal(readStripeWebhook('sk_test_dummy', webhookSecret, payload, header), 'cs_test_123')
  assert.throws(() => readStripeWebhook('sk_test_dummy', webhookSecret, payload.replace('cs_test_123', 'cs_test_999'), header))
  assert.throws(() => readStripeWebhook('sk_test_dummy', 'whsec_other', payload, header))
})

test('Stripe events other than completed checkouts are ignored', () => {
  const webhookSecret = 'whsec_test_secret'
  const payload = JSON.stringify({ id: 'evt_2', object: 'event', type: 'charge.refunded', data: { object: { id: 'ch_1' } } })
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret })
  assert.equal(readStripeWebhook('sk_test_dummy', webhookSecret, payload, header), null)
})
