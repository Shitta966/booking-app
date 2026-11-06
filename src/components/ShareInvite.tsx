'use client'

import { useState } from 'react'
import { Check, Copy, Mail, Share2 } from 'lucide-react'
import { useToast } from './Toaster'

/** The invite link with copy, native share, WhatsApp, X and email buttons. */
export function ShareInvite({ url, code, message }: { url: string; code: string; message: string }) {
  const [copied, setCopied] = useState(false)
  const { show } = useToast()
  const full = `${message} ${url}`

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      show({ tone: 'success', title: `${label} copied`, body: 'Paste it into any chat or post.' })
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      show({ tone: 'error', title: 'Could not copy', body: 'Select the link and copy it manually.' })
    }
  }

  async function nativeShare() {
    if (navigator.share) {
      await navigator.share({ title: 'Join me on FUTICK', text: message, url }).catch(() => undefined)
    } else {
      await copy(full, 'Invite message')
    }
  }

  const button = 'flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition'
  return (
    <div>
      <div className="flex items-center gap-2 rounded-full bg-white p-1.5 pl-5 ring-1 ring-moss-200">
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-moss-900">{url}</span>
        <button type="button" onClick={() => void copy(url, 'Invite link')} className={`${button} bg-moss-900 text-white hover:bg-moss-800`}>
          {copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mt-2 text-xs text-moss-800/60">Or share your code: <button type="button" onClick={() => void copy(code, 'Code')} className="font-mono font-semibold text-moss-900 underline-offset-2 hover:underline">{code}</button></p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <a href={`https://wa.me/?text=${encodeURIComponent(full)}`} target="_blank" rel="noopener noreferrer" className={`${button} bg-[#25D366] text-white hover:brightness-95`}>WhatsApp</a>
        <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}&url=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer" className={`${button} bg-black text-white hover:bg-slate-800`}>Post on X</a>
        <a href={`mailto:?subject=${encodeURIComponent('Join me on FUTICK')}&body=${encodeURIComponent(full)}`} className={`${button} bg-white text-moss-900 ring-1 ring-moss-200 hover:bg-moss-50`}><Mail size={15} />Email</a>
        <button type="button" onClick={() => void nativeShare()} className={`${button} bg-white text-moss-900 ring-1 ring-moss-200 hover:bg-moss-50`}><Share2 size={15} />More</button>
      </div>
    </div>
  )
}
