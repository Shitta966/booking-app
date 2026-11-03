import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTicketPayload, generateTicketCode, normalizeTicketCode, parseScan } from '../src/lib/tickets'

const secret = new TextEncoder().encode('test-secret-that-is-at-least-32-characters-long')
const otherSecret = new TextEncoder().encode('another-secret-that-is-at-least-32-characters')
const ticketId = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'

test('a signed QR payload round-trips to its ticket id', () => {
  assert.deepEqual(parseScan(createTicketPayload(ticketId, secret), secret), { kind: 'qr', ticketId })
})

test('a QR payload signed with another secret is rejected', () => {
  assert.deepEqual(parseScan(createTicketPayload(ticketId, otherSecret), secret), { kind: 'invalid' })
})

test('editing the ticket id inside a QR payload invalidates it', () => {
  const payload = createTicketPayload(ticketId, secret).replace('6f1c', '6f1d')
  assert.deepEqual(parseScan(payload, secret), { kind: 'invalid' })
})

test('typed ticket codes are normalised', () => {
  const code = generateTicketCode()
  assert.equal(code.length, 8)
  assert.deepEqual(parseScan(`${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`, secret), { kind: 'code', code })
  assert.equal(normalizeTicketCode('ABC'), null)
  assert.equal(normalizeTicketCode('ABCD-EFG0'), null) // 0 is not in the alphabet
})

test('random text is invalid', () => {
  assert.deepEqual(parseScan('https://example.com/ticket', secret), { kind: 'invalid' })
})
