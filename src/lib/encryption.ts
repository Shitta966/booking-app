import crypto from 'node:crypto'

/**
 * Authenticated encryption (AES-256-GCM) for credentials stored in the database, such as payment gateway
 * secret keys. The key is derived from a server secret with HKDF, so the database alone cannot reveal them.
 * Format: v1.<iv>.<auth tag>.<ciphertext>, base64url.
 */
function deriveKey(secret: Uint8Array) {
  return Buffer.from(crypto.hkdfSync('sha256', secret, Buffer.from('futick'), Buffer.from('stored-credentials-v1'), 32))
}

export function encryptText(plain: string, secret: Uint8Array) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(secret), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.')
}

/** Returns null when the value was not produced with this secret or was tampered with. */
export function decryptText(stored: string, secret: Uint8Array): string | null {
  const [version, iv, tag, data] = stored.split('.')
  if (version !== 'v1' || !iv || !tag || data === undefined) return null
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(secret), Buffer.from(iv, 'base64url'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
