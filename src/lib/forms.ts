import 'server-only'
import { redirect } from 'next/navigation'

export function text(form: FormData, key: string, max = 500) {
  return String(form.get(key) ?? '').trim().slice(0, max)
}

export function back(path: string, params: { error?: string; ok?: string }): never {
  const url = new URL(path, 'http://futick.local')
  if (params.error) url.searchParams.set('error', params.error)
  if (params.ok) url.searchParams.set('ok', params.ok)
  redirect(`${url.pathname}${url.search}${url.hash}`)
}

/** Only allow same-site relative redirects after sign-in. */
export function safeNext(value: string) {
  return value.startsWith('/') && !value.startsWith('//') ? value : '/tickets'
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong.'
}
