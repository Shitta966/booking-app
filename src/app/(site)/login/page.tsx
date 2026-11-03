import Link from 'next/link'
import { redirect } from 'next/navigation'
import { login } from '@/app/actions/auth'
import { AuthFrame } from '@/components/AuthFrame'
import { Flash } from '@/components/ui'
import { getCurrentUser } from '@/lib/auth'

export const metadata = { title: 'Log in' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  if (await getCurrentUser()) redirect(params.next?.startsWith('/') ? params.next : '/tickets')
  return (
    <AuthFrame eyebrow="Welcome back" title="Log in to FUTICK" subtitle="See your tickets or manage your events."
      footer={<>New to FUTICK? <Link href={`/signup${params.next ? `?next=${encodeURIComponent(params.next)}` : ''}`} className="font-medium text-moss-950 underline underline-offset-4">Create an account</Link></>}>
      <Flash searchParams={params} />
      <form action={login} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={params.next ?? ''} />
        <label className="field">Email<input name="email" type="email" autoComplete="email" required className="input" /></label>
        <label className="field">Password<input name="password" type="password" autoComplete="current-password" required className="input" /></label>
        <button className="btn-primary mt-2 py-3">Log in</button>
      </form>
    </AuthFrame>
  )
}
