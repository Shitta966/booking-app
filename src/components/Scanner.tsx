'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Camera, CameraOff, CheckCircle2, Keyboard, XCircle, AlertTriangle } from 'lucide-react'
import type QrScannerType from 'qr-scanner'

type Result = {
  result: 'admitted' | 'already_used' | 'cancelled' | 'wrong_event' | 'invalid'
  message: string
  ticket?: { code: string; attendeeName: string; ticketType: string; holderEmail: string; checkedInAt: string | null; eventTitle: string }
  counts?: { issued: number; checked_in: number }
  error?: string
}

const STYLES = {
  admitted: { box: 'bg-emerald-600', icon: CheckCircle2, title: 'ADMIT' },
  already_used: { box: 'bg-rose-600', icon: XCircle, title: 'ALREADY USED' },
  cancelled: { box: 'bg-rose-600', icon: XCircle, title: 'CANCELLED' },
  invalid: { box: 'bg-rose-600', icon: XCircle, title: 'INVALID' },
  wrong_event: { box: 'bg-amber-500', icon: AlertTriangle, title: 'WRONG EVENT' },
}

export function Scanner({ orgId, eventId, initialCounts }: { orgId: string; eventId: string; initialCounts: { issued: number; checked_in: number } }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const scannerRef = useRef<QrScannerType | null>(null)
  const busyRef = useRef(false)
  const lastRef = useRef<{ value: string; at: number } | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [counts, setCounts] = useState(initialCounts)
  const [manual, setManual] = useState('')
  const [history, setHistory] = useState<Array<{ at: string; result: Result['result']; label: string }>>([])

  const submit = useCallback(async (payload: string) => {
    const now = Date.now()
    // The camera reports the same code many times per second; ignore repeats for a few seconds.
    if (busyRef.current || (lastRef.current?.value === payload && now - lastRef.current.at < 4000)) return
    busyRef.current = true
    lastRef.current = { value: payload, at: now }
    try {
      const response = await fetch('/api/checkin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orgId, eventId, payload }) })
      const data = (await response.json()) as Result
      if (!response.ok) {
        setResult({ result: 'invalid', message: data.error ?? 'Check-in failed.' })
      } else {
        setResult(data)
        if (data.counts) setCounts(data.counts)
        setHistory((items) => [{ at: new Date().toLocaleTimeString(), result: data.result, label: data.ticket ? `${data.ticket.attendeeName} · ${data.ticket.code}` : data.message }, ...items].slice(0, 15))
        navigator.vibrate?.(data.result === 'admitted' ? 120 : [80, 60, 80, 60, 80])
      }
    } catch {
      setResult({ result: 'invalid', message: 'Network error. Check the connection and scan again.' })
    } finally {
      busyRef.current = false
    }
  }, [orgId, eventId])

  async function startCamera() {
    setCameraError('')
    try {
      const { default: QrScanner } = await import('qr-scanner')
      if (!videoRef.current) return
      if (!scannerRef.current) {
        scannerRef.current = new QrScanner(videoRef.current, (scan) => void submit(scan.data), {
          preferredCamera: 'environment', highlightScanRegion: true, highlightCodeOutline: true, maxScansPerSecond: 8,
        })
      }
      await scannerRef.current.start()
      setCameraOn(true)
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : 'Camera unavailable. Allow camera access or type the ticket code instead.')
    }
  }

  function stopCamera() {
    scannerRef.current?.stop()
    setCameraOn(false)
  }

  useEffect(() => () => { scannerRef.current?.destroy(); scannerRef.current = null }, [])

  const style = result ? STYLES[result.result] : null

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <div className="card overflow-hidden">
          <div className="relative aspect-[4/3] max-h-[60vh] w-full bg-brand-950">
            <video ref={videoRef} className="size-full object-cover" muted playsInline />
            {!cameraOn && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
                <Camera size={40} className="text-white/60" />
                <p className="text-sm text-white/70">Point the camera at the attendee’s ticket QR code.</p>
                <button onClick={() => void startCamera()} className="btn-gold">Start camera</button>
                {cameraError && <p className="max-w-sm text-xs text-rose-300">{cameraError}</p>}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 p-3">
            <p className="text-sm text-slate-600"><b className="text-lg text-slate-900">{counts.checked_in}</b> / {counts.issued} checked in</p>
            {cameraOn && <button onClick={stopCamera} className="btn-secondary btn-sm"><CameraOff size={14} /> Stop camera</button>}
          </div>
        </div>

        <form className="card flex gap-2 p-3" onSubmit={(event) => { event.preventDefault(); lastRef.current = null; void submit(manual); setManual('') }}>
          <label className="relative flex-1">
            <Keyboard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={manual} onChange={(event) => setManual(event.target.value)} placeholder="Type ticket code, e.g. K7QD-M2XP" className="input pl-9 font-mono uppercase" autoCapitalize="characters" />
          </label>
          <button className="btn-primary" disabled={manual.trim().length < 8}>Verify</button>
        </form>
      </div>

      <div className="space-y-4">
        <div aria-live="assertive" className={clsx('rounded-xl p-6 text-white shadow-sm transition', style ? style.box : 'bg-slate-200 text-slate-500')}>
          {style && result ? (
            <>
              <div className="flex items-center gap-3"><style.icon size={36} /><p className="text-3xl font-black tracking-tight">{style.title}</p></div>
              <p className="mt-2 text-sm font-medium text-white/90">{result.message}</p>
              {result.ticket && (
                <dl className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-black/15 p-3 text-sm">
                  <div className="col-span-2"><dt className="text-xs text-white/70">Attendee</dt><dd className="text-lg font-bold">{result.ticket.attendeeName}</dd></div>
                  <div><dt className="text-xs text-white/70">Ticket</dt><dd className="font-semibold">{result.ticket.ticketType}</dd></div>
                  <div><dt className="text-xs text-white/70">Code</dt><dd className="font-mono font-semibold">{result.ticket.code}</dd></div>
                  {result.ticket.checkedInAt && <div className="col-span-2"><dt className="text-xs text-white/70">Checked in at</dt><dd className="font-semibold">{new Date(result.ticket.checkedInAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })}</dd></div>}
                </dl>
              )}
            </>
          ) : <p className="py-6 text-center text-sm">Waiting for a scan…</p>}
        </div>
        <div className="card">
          <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Recent scans on this device</p>
          <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto text-sm">
            {history.map((item, index) => (
              <li key={index} className="flex items-center justify-between gap-2 px-4 py-2">
                <span className="truncate">{item.label}</span>
                <span className={clsx('shrink-0 text-xs font-semibold', item.result === 'admitted' ? 'text-emerald-600' : 'text-rose-600')}>{item.at}</span>
              </li>
            ))}
            {history.length === 0 && <li className="px-4 py-6 text-center text-slate-400">No scans yet.</li>}
          </ul>
        </div>
      </div>
    </div>
  )
}
