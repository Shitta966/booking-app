'use client'

import { useEffect, useState } from 'react'
import { BellOff, BellRing } from 'lucide-react'
import { useToast } from './Toaster'

type State = 'loading' | 'unsupported' | 'unavailable' | 'denied' | 'blocked' | 'off' | 'on'

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)))
}

/**
 * Returns this site's service worker registration, registering it if needed. Resolves to null instead of
 * waiting forever when the browser refuses service workers (some in-app browsers and private modes do).
 */
async function serviceWorker(): Promise<ServiceWorkerRegistration | null> {
  try {
    const existing = await navigator.serviceWorker.getRegistration('/')
    const registration = existing ?? (await navigator.serviceWorker.register('/sw.js', { scope: '/' }))
    if (registration.active) return registration
    return await Promise.race([navigator.serviceWorker.ready, new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000))])
  } catch {
    return null
  }
}

/** Turns browser push alerts on or off for this device. */
export function PushToggle({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<State>('loading')
  const [busy, setBusy] = useState(false)
  const { show } = useToast()

  useEffect(() => {
    let active = true
    ;(async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return active && setState('unsupported')
      const config = await fetch('/api/push/subscribe').then((response) => response.json()).catch(() => ({ enabled: false }))
      if (!config.enabled) return active && setState('unavailable')
      if (Notification.permission === 'denied') return active && setState('denied')
      const registration = await serviceWorker()
      if (!registration) return active && setState('blocked')
      const subscription = await registration.pushManager.getSubscription()
      if (active) setState(subscription ? 'on' : 'off')
    })()
    return () => { active = false }
  }, [])

  async function enable() {
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off')
        return
      }
      const { publicKey } = await fetch('/api/push/subscribe').then((response) => response.json())
      const registration = await serviceWorker()
      if (!registration) {
        setState('blocked')
        return
      }
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) })
      const response = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(subscription.toJSON()) })
      if (!response.ok) throw new Error('Could not save the subscription.')
      setState('on')
      show({ tone: 'success', title: 'Push alerts are on', body: 'This device will be notified even when FUTICK is closed.' })
    } catch (error) {
      show({ tone: 'error', title: 'Push alerts could not be turned on', body: error instanceof Error ? error.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    const registration = await serviceWorker()
    const subscription = await registration?.pushManager.getSubscription()
    if (subscription) {
      await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: subscription.endpoint }) })
      await subscription.unsubscribe()
    }
    setState('off')
    setBusy(false)
    show({ tone: 'info', title: 'Push alerts are off on this device' })
  }

  async function sendTest() {
    setBusy(true)
    const response = await fetch('/api/push/test', { method: 'POST' })
    const data = (await response.json().catch(() => ({}))) as { devices?: number; delivered?: number; failed?: number; error?: string }
    setBusy(false)
    if (!response.ok) return show({ tone: 'error', title: 'Test alert not sent', body: data.error })
    if (data.delivered) show({ tone: 'success', title: `Test alert sent to ${data.delivered} of ${data.devices} device${data.devices === 1 ? '' : 's'}`, body: 'It should appear as a system notification within a few seconds.' })
    else show({ tone: 'error', title: 'No device accepted the test alert', body: data.devices ? 'The push service rejected it. Turn push off and on again.' : 'Turn on push alerts first.' })
  }

  const note: Partial<Record<State, string>> = {
    unsupported: 'This browser does not support push alerts. On iPhone, add FUTICK to your Home Screen first.',
    unavailable: 'Push alerts are not configured on this server yet.',
    denied: 'Notifications are blocked for this site. Allow them in your browser settings, then reload.',
    blocked: 'This browser would not start the background worker push alerts need. Open FUTICK in Chrome, Edge, Firefox or Safari, or install it to your home screen.',
  }

  if (state === 'loading') return null
  if (note[state]) return <p className="text-xs text-slate-500">{note[state]}</p>

  return (
    <div className={compact ? 'space-y-2' : 'flex flex-wrap gap-2'}>
    <button type="button" disabled={busy} onClick={() => void (state === 'on' ? disable() : enable())}
      className={compact ? 'flex w-full items-center justify-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-60' : state === 'on' ? 'btn-secondary' : 'btn-primary'}>
      {state === 'on' ? <BellOff size={15} /> : <BellRing size={15} />}
      {state === 'on' ? 'Turn off push alerts on this device' : 'Turn on push alerts on this device'}
    </button>
    {state === 'on' && (
      <button type="button" disabled={busy} onClick={() => void sendTest()}
        className={compact ? 'w-full rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60' : 'btn-secondary'}>
        Send test alert
      </button>
    )}
    </div>
  )
}
