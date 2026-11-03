'use client'

import { useEffect, useId, useRef, useState } from 'react'
import clsx from 'clsx'
import { AlertTriangle, X } from 'lucide-react'

/** Accessible modal built on <dialog>: focus is trapped, Escape and the backdrop close it. */
export function Modal({ open, onClose, title, children, size = 'md' }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog ref={ref} aria-labelledby={titleId} onClose={onClose}
      onClick={(event) => { if (event.target === ref.current) onClose() }}
      className={clsx('m-auto w-[calc(100%-2rem)] rounded-3xl bg-white p-0 text-left shadow-2xl backdrop:bg-slate-900/45 backdrop:backdrop-blur-[2px]',
        size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-md')}>
      <div className="flex items-start justify-between gap-4 px-6 pt-6">
        <h2 id={titleId} className="text-lg font-semibold text-slate-900">{title}</h2>
        <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close"><X size={17} /></button>
      </div>
      <div className="px-6 pb-6 pt-3">{children}</div>
    </dialog>
  )
}

/**
 * A submit button that asks first. It must sit inside the <form> it submits; on confirm it submits
 * that form with its own name/value, exactly as a normal submit button would.
 */
export function ConfirmButton({
  children, className = 'btn-secondary btn-sm', name, value, title, message, confirmLabel = 'Confirm', tone = 'danger', extra,
}: {
  children: React.ReactNode
  className?: string
  name?: string
  value?: string
  title: string
  message: React.ReactNode
  confirmLabel?: string
  tone?: 'danger' | 'primary'
  /** Extra fields shown inside the modal (e.g. a reason). The dialog sits inside the form, so they submit with it. */
  extra?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const submitRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <button ref={triggerRef} type="button" className={className} onClick={() => setOpen(true)}>{children}</button>
      <button ref={submitRef} type="submit" name={name} value={value} hidden tabIndex={-1} aria-hidden="true" />
      <Modal open={open} onClose={() => setOpen(false)} title={title} size="sm">
        <div className="flex gap-3">
          {tone === 'danger' && <span className="grid size-10 shrink-0 place-items-center rounded-full bg-rose-50 text-rose-600"><AlertTriangle size={19} /></span>}
          <div className="text-sm leading-relaxed text-slate-600">{message}</div>
        </div>
        {extra && <div className="mt-4">{extra}</div>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Go back</button>
          <button type="button" className={tone === 'danger' ? 'btn-danger' : 'btn-primary'}
            onClick={() => { setOpen(false); triggerRef.current?.form?.requestSubmit(submitRef.current) }}>
            {confirmLabel}
          </button>
        </div>
      </Modal>
    </>
  )
}
