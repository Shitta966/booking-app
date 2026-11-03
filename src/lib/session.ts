import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { getSecret } from './secrets'

export const SESSION_COOKIE = 'futick_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7

export type SessionClaims = { sub: string; sv: number }

export async function signSession(userId: string, sessionVersion: number) {
  return new SignJWT({ sv: sessionVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret('SESSION_SECRET'))
}

export async function verifySession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, getSecret('SESSION_SECRET'), { algorithms: ['HS256'] })
    if (typeof payload.sub !== 'string' || typeof payload.sv !== 'number') return null
    return { sub: payload.sub, sv: payload.sv }
  } catch {
    return null
  }
}

export async function startSession(userId: string, sessionVersion: number) {
  const token = await signSession(userId, sessionVersion)
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })
}

export async function endSession() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}
