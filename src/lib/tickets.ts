import crypto from 'node:crypto'

/**
 * Ticket QR payloads are `FTK1.<ticket id>.<signature>`. The signature is an HMAC of the ticket id,
 * so a QR code cannot be forged or edited without the server secret, and nothing secret is stored
 * in the database. Each ticket also has a short human-readable code for manual entry at the gate.
 */
const PREFIX = 'FTK1'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function sign(ticketId: string, secret: Uint8Array) {
  return crypto.createHmac('sha256', secret).update(`${PREFIX}.${ticketId}`).digest('base64url').slice(0, 27)
}

export function createTicketPayload(ticketId: string, secret: Uint8Array) {
  return `${PREFIX}.${ticketId}.${sign(ticketId, secret)}`
}

export type ParsedScan =
  | { kind: 'qr'; ticketId: string }
  | { kind: 'code'; code: string }
  | { kind: 'invalid' }

export function parseScan(input: string, secret: Uint8Array): ParsedScan {
  const value = input.trim()
  if (value.startsWith(`${PREFIX}.`)) {
    const [, ticketId, signature] = value.split('.')
    if (!ticketId || !signature || !UUID.test(ticketId)) return { kind: 'invalid' }
    const expected = Buffer.from(sign(ticketId, secret))
    const actual = Buffer.from(signature)
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return { kind: 'invalid' }
    return { kind: 'qr', ticketId: ticketId.toLowerCase() }
  }
  const code = normalizeTicketCode(value)
  return code ? { kind: 'code', code } : { kind: 'invalid' }
}

export function normalizeTicketCode(value: string) {
  const code = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return code.length === 8 && [...code].every((char) => CODE_ALPHABET.includes(char)) ? code : null
}

export function generateTicketCode() {
  const bytes = crypto.randomBytes(8)
  return [...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('')
}

export function formatTicketCode(code: string) {
  return `${code.slice(0, 4)}-${code.slice(4)}`
}

export function generateOrderReference() {
  return `FT-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
}
