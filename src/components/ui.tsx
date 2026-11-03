import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import clsx from 'clsx'

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: string; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="mb-2 text-xs font-medium text-slate-400">
          <span className="text-brand-600">Dashboard</span>{eyebrow && <> <span className="mx-1">/</span> {eyebrow}</>}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

const STAT_COLORS = {
  brand: 'text-brand-600',
  gold: 'text-gold-500',
  blue: 'text-brand-500',
  rose: 'text-rose-500',
  slate: 'text-slate-500',
}

export function StatCard({ label, value, hint, icon: Icon, color = 'brand' }: { label: string; value: ReactNode; hint?: string; icon: LucideIcon; color?: keyof typeof STAT_COLORS }) {
  return (
    <div className="card flex items-center gap-5 p-6">
      <Icon size={34} strokeWidth={2.2} className={clsx('shrink-0', STAT_COLORS[color])} />
      <div className="min-w-0">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="mt-0.5 truncate text-2xl font-semibold text-slate-900">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      </div>
    </div>
  )
}

const BADGE_COLORS: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  published: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  paid: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  valid: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  admitted: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  done: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  checked_in: 'bg-sky-50 text-sky-700 ring-sky-200',
  doing: 'bg-sky-50 text-sky-700 ring-sky-200',
  completed: 'bg-sky-50 text-sky-700 ring-sky-200',
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  pending_payment: 'bg-amber-50 text-amber-700 ring-amber-200',
  awaiting_review: 'bg-violet-50 text-violet-700 ring-violet-200',
  draft: 'bg-slate-100 text-slate-600 ring-slate-200',
  todo: 'bg-slate-100 text-slate-600 ring-slate-200',
  expired: 'bg-slate-100 text-slate-500 ring-slate-200',
  unlisted: 'bg-slate-100 text-slate-600 ring-slate-200',
  suspended: 'bg-rose-50 text-rose-700 ring-rose-200',
  cancelled: 'bg-rose-50 text-rose-700 ring-rose-200',
  already_used: 'bg-rose-50 text-rose-700 ring-rose-200',
  invalid: 'bg-rose-50 text-rose-700 ring-rose-200',
  wrong_event: 'bg-amber-50 text-amber-700 ring-amber-200',
}

export function Badge({ status, label }: { status: string; label?: string }) {
  return (
    <span className={clsx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset', BADGE_COLORS[status] ?? 'bg-slate-100 text-slate-600 ring-slate-200')}>
      {label ?? status.replaceAll('_', ' ')}
    </span>
  )
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-brand-50 text-brand-600"><Icon size={24} /></span>
      <p className="mt-2 font-semibold text-slate-900">{title}</p>
      {body && <p className="max-w-md text-sm text-slate-500">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

/**
 * Shows ?error= / ?ok= messages that server actions pass back through redirects. Both become toasts;
 * errors also stay inline so they remain visible next to the form after the toast fades.
 */
export function Flash({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const error = typeof searchParams.error === 'string' ? searchParams.error : null
  if (!error) return null
  return (
    <div role="alert" className="mb-5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-inset ring-rose-200">{error}</div>
  )
}

/** Ticket outline with side notches and a stub line — the FUTICK mark, drawn by hand rather than taken from an icon set. */
export function LogoMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 32" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 6.5A2.5 2.5 0 0 1 6.5 4h27A2.5 2.5 0 0 1 36 6.5v5.2a4.5 4.5 0 0 0 0 8.6v5.2a2.5 2.5 0 0 1-2.5 2.5h-27A2.5 2.5 0 0 1 4 25.5v-5.2a4.5 4.5 0 0 0 0-8.6V6.5Z"
        stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round"
      />
      <path d="M26 8.5v15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="2.2 3.2" />
      <path d="M11 13h9M11 18.5h6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}

export function Logo({ name = 'FUTICK', tone = 'moss', href = '/' }: { name?: string; tone?: 'moss' | 'light' | 'blue'; href?: string }) {
  const color = tone === 'light' ? 'text-white' : tone === 'blue' ? 'text-brand-700' : 'text-moss-900'
  return (
    <Link href={href} className={clsx('flex items-center gap-2.5 text-xl font-semibold tracking-tight', color)}>
      <LogoMark className="h-7 w-9" />
      <span>{name}<span className={tone === 'light' ? 'text-gold-400' : tone === 'blue' ? 'text-gold-500' : 'text-moss-400'}>.</span></span>
    </Link>
  )
}

export function SubmitButton({ children, className = 'btn-primary', name, value, formAction }: { children: ReactNode; className?: string; name?: string; value?: string; formAction?: (formData: FormData) => void | Promise<void> }) {
  return <button type="submit" className={className} name={name} value={value} formAction={formAction}>{children}</button>
}
