import 'server-only'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { dataDir } from './dataDir'

type SecretName = 'SESSION_SECRET' | 'TICKET_SIGNING_SECRET'

const cache = new Map<SecretName, Uint8Array>()

/**
 * Reads a signing secret from the environment. Production refuses to start without it.
 * In development a random secret is generated once and kept in ~/.futick/.secrets.json.
 */
export function getSecret(name: SecretName): Uint8Array {
  const cached = cache.get(name)
  if (cached) return cached

  const fromEnv = process.env[name]?.trim()
  let secret: string
  if (fromEnv) {
    if (fromEnv.length < 32) throw new Error(`${name} must be at least 32 characters long.`)
    secret = fromEnv
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} must be set in production.`)
  } else {
    const file = path.join(dataDir(), '.secrets.json')
    const stored: Partial<Record<SecretName, string>> = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, 'utf8'))
      : {}
    if (!stored[name]) {
      stored[name] = crypto.randomBytes(48).toString('base64url')
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, JSON.stringify(stored, null, 2), { mode: 0o600 })
    }
    secret = stored[name]!
  }

  const key = new TextEncoder().encode(secret)
  cache.set(name, key)
  return key
}
