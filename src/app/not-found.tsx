import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">404</p>
      <h1 className="text-2xl font-bold">We couldn’t find that page</h1>
      <p className="text-slate-500">It may have been removed, or you may not have access to it.</p>
      <Link href="/" className="btn-primary mt-2">Back to FUTICK</Link>
    </main>
  )
}
