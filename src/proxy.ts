import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED = ['/dashboard', '/admin', '/tickets', '/orders', '/organizers', '/account', '/notifications']

function contentSecurityPolicy(nonce: string) {
  const isDev = process.env.NODE_ENV === 'development'
  return [
    `default-src 'self'`,
    // Scripts only run with this request's nonce; 'strict-dynamic' lets those scripts load Next's chunks.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? ` 'unsafe-eval'` : ''}`,
    // Inline styles stay allowed: charts and the brand colour use style attributes.
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' https://fonts.gstatic.com`,
    `img-src 'self' data: blob: https://images.unsplash.com`,
    `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
    `media-src 'self' blob: mediastream:`,
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    // Pay-online buttons redirect to the gateways' hosted checkout pages.
    `form-action 'self' https://checkout.stripe.com https://checkout.flutterwave.com`,
    `frame-ancestors 'none'`,
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ')
}

/**
 * Runs before every page: sends signed-out visitors on protected pages to log in, and adds security
 * headers. Real authorisation (signature, session version, role, tenant) happens in each page and action.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  if (PROTECTED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) && !request.cookies.has('futick_session')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = `?next=${encodeURIComponent(pathname + search)}`
    return NextResponse.redirect(url)
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = contentSecurityPolicy(nonce)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  // Remember who invited this visitor (?ref=CODE) so the referral still counts if they sign up later.
  const ref = request.nextUrl.searchParams.get('ref')
  if (ref && /^[A-Za-z0-9]{6,12}$/.test(ref) && !request.cookies.has('futick_session')) {
    response.cookies.set('futick_ref', ref.toUpperCase(), {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30,
    })
  }
  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=()')
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  if (process.env.NODE_ENV === 'production') response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains')
  return response
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico|favicon.svg|sw.js|manifest.webmanifest|icons/|api/health|api/uploads).*)',
      missing: [{ type: 'header', key: 'next-router-prefetch' }, { type: 'header', key: 'purpose', value: 'prefetch' }],
    },
  ],
}
