'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import clsx from 'clsx'
import { Bell, CheckCheck } from 'lucide-react'
import { PushToggle } from './PushToggle'
import { useToast } from './Toaster'

type Item = { id: string; kind: string; title: string; body: string; href: string | null; read_at: string | null; created_at: string }

const POLL_MS = 20_000

function timeAgo(value: string) {
  const seconds = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(value).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
}

/**
 * The live alert bell. Polls for notifications while the tab is visible, shows a toast when a new one
 * arrives, and lists the latest 20 in a dropdown. Browser push (PushToggle) covers the app being closed.
 */
export function NotificationBell({ tone = 'blue' }: { tone?: 'blue' | 'moss' }) {
  const [items, setItems] = useState<Item[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const seen = useRef<Set<string> | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const { show } = useToast()
  const router = useRouter()

  const load = useCallback(async () => {
    const response = await fetch('/api/notifications', { cache: 'no-store' }).catch(() => null)
    if (!response?.ok) return
    const data = (await response.json()) as { unread: number; items: Item[] }
    if (seen.current) {
      const fresh = data.items.filter((item) => !item.read_at && !seen.current!.has(item.id))
      for (const item of fresh.slice(0, 3).reverse()) show({ tone: 'alert', title: item.title, body: item.body, href: item.href ?? undefined })
      if (fresh.length) router.refresh()
    }
    seen.current = new Set(data.items.map((item) => item.id))
    setItems(data.items)
    setUnread(data.unread)
  }, [show, router])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, POLL_MS)
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [load])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => { if (!panelRef.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape) }
  }, [open])

  async function markRead(ids?: string[]) {
    await fetch('/api/notifications/read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ids ? { ids } : {}) })
    void load()
  }

  return (
    <div ref={panelRef} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={unread ? `${unread} unread notifications` : 'Notifications'}
        className={clsx('relative grid size-10 place-items-center rounded-full transition',
          tone === 'blue' ? 'bg-brand-50 text-brand-600 hover:bg-brand-100' : 'bg-white/60 text-moss-800 backdrop-blur hover:bg-white')}>
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-gold-400 px-1 text-[10px] font-bold text-brand-950 ring-2 ring-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-[72px] z-50 overflow-hidden rounded-3xl bg-white text-left shadow-[0_20px_60px_rgba(15,23,42,0.2)] ring-1 ring-slate-100 sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-96">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <p className="font-semibold text-slate-900">Notifications</p>
            {unread > 0 && <button onClick={() => void markRead()} className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"><CheckCheck size={14} /> Mark all read</button>}
          </div>
          <ul className="max-h-[min(60vh,420px)] divide-y divide-slate-50 overflow-y-auto">
            {items.map((item) => (
              <li key={item.id}>
                <Link href={item.href ?? '/notifications'} onClick={() => { setOpen(false); if (!item.read_at) void markRead([item.id]) }}
                  className={clsx('flex gap-3 px-5 py-3.5 hover:bg-slate-50', !item.read_at && 'bg-brand-50/50')}>
                  <span className={clsx('mt-1.5 size-2 shrink-0 rounded-full', item.read_at ? 'bg-transparent' : 'bg-gold-400')} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-900">{item.title}</span>
                    {item.body && <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">{item.body}</span>}
                    <span className="mt-1 block text-[11px] text-slate-400">{timeAgo(item.created_at)}</span>
                  </span>
                </Link>
              </li>
            ))}
            {items.length === 0 && <li className="px-5 py-10 text-center text-sm text-slate-400">You’re all caught up.</li>}
          </ul>
          <div className="space-y-2 border-t border-slate-100 p-4">
            <PushToggle compact />
            <Link href="/notifications" onClick={() => setOpen(false)} className="block text-center text-xs font-semibold text-slate-500 hover:text-slate-800">See all notifications</Link>
          </div>
        </div>
      )}
    </div>
  )
}
