'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import clsx from 'clsx'
import { AlertTriangle, Bell, CheckCircle2, Info, X } from 'lucide-react'

export type ToastTone = 'success' | 'error' | 'info' | 'alert'
type Toast = { id: number; tone: ToastTone; title: string; body?: string; href?: string }
type ToastApi = { show: (toast: Omit<Toast, 'id'>) => void }

const ToastContext = createContext<ToastApi | null>(null)

export function useToast() {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside <ToastProvider>')
  return api
}

const STYLES: Record<ToastTone, { icon: typeof Info; ring: string; iconColor: string }> = {
  success: { icon: CheckCircle2, ring: 'ring-emerald-200', iconColor: 'text-emerald-600' },
  error: { icon: AlertTriangle, ring: 'ring-rose-200', iconColor: 'text-rose-600' },
  info: { icon: Info, ring: 'ring-slate-200', iconColor: 'text-brand-600' },
  alert: { icon: Bell, ring: 'ring-amber-200', iconColor: 'text-amber-500' },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const dismiss = useCallback((id: number) => setToasts((items) => items.filter((item) => item.id !== id)), [])
  const show = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = nextId.current++
    setToasts((items) => [...items.slice(-3), { ...toast, id }])
    window.setTimeout(() => dismiss(id), toast.tone === 'error' ? 8000 : 5000)
  }, [dismiss])
  const api = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-[100] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-5 sm:top-5 sm:bottom-auto sm:items-end">
        {toasts.map((toast) => {
          const style = STYLES[toast.tone]
          const Icon = style.icon
          return (
            <div key={toast.id} role={toast.tone === 'error' ? 'alert' : 'status'}
              className={clsx('pointer-events-auto flex w-full max-w-sm animate-[toast-in_.2s_ease-out] items-start gap-3 rounded-2xl bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,0.16)] ring-1', style.ring)}>
              <Icon size={20} className={clsx('mt-0.5 shrink-0', style.iconColor)} />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold text-slate-900">{toast.title}</p>
                {toast.body && <p className="mt-0.5 text-slate-500">{toast.body}</p>}
                {toast.href && <a href={toast.href} className="mt-1 inline-block text-xs font-semibold text-brand-600 hover:underline">Open</a>}
              </div>
              <button onClick={() => dismiss(toast.id)} className="grid size-7 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Dismiss"><X size={15} /></button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

/**
 * Turns ?ok= / ?error= messages that server actions send back through redirects into toasts,
 * then removes them from the address bar so a refresh does not repeat them.
 */
export function FlashToast() {
  const params = useSearchParams()
  const pathname = usePathname()
  const { show } = useToast()
  const ok = params.get('ok')
  const error = params.get('error')

  useEffect(() => {
    if (!ok && !error) return
    if (ok) show({ tone: 'success', title: ok })
    if (error) show({ tone: 'error', title: 'Something needs attention', body: error })
    const next = new URLSearchParams(params.toString())
    next.delete('ok')
    next.delete('error')
    const query = next.toString()
    // history.replaceState updates the address bar without re-rendering, so inline errors stay on screen.
    window.history.replaceState(null, '', `${pathname}${query ? `?${query}` : ''}`)
  }, [ok, error, params, pathname, show])

  return null
}
