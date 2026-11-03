'use client'

import { useEffect, useRef, useState } from 'react'
import { ImageUp, Trash2 } from 'lucide-react'

const MAX_BYTES = 4 * 1024 * 1024

/** Poster picker with a live preview. The file is uploaded with the event form and checked again on the server. */
export function PosterInput({ current }: { current: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [remove, setRemove] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  function choose(file: File | undefined) {
    setError('')
    if (!file) return setPreview(null)
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPG, PNG or WebP image.')
      if (inputRef.current) inputRef.current.value = ''
      return setPreview(null)
    }
    if (file.size > MAX_BYTES) {
      setError(`That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 4 MB.`)
      if (inputRef.current) inputRef.current.value = ''
      return setPreview(null)
    }
    setRemove(false)
    setPreview(URL.createObjectURL(file))
  }

  const shown = preview ?? (remove ? null : current)

  return (
    <div className="field md:col-span-2">
      <span>Poster image</span>
      <label className="group relative flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center hover:border-brand-500 hover:bg-brand-50/50">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="Poster preview" className="absolute inset-0 size-full object-cover" />
        ) : (
          <>
            <span className="grid size-11 place-items-center rounded-full bg-white text-brand-600 shadow-sm"><ImageUp size={20} /></span>
            <span className="text-sm font-medium text-slate-700">Click to upload a poster</span>
            <span className="text-xs font-normal text-slate-400">JPG, PNG or WebP · up to 4 MB · landscape works best</span>
          </>
        )}
        {shown && <span className="absolute bottom-3 right-3 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">Change image</span>}
        <input ref={inputRef} type="file" name="poster" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => choose(event.target.files?.[0])} />
      </label>
      {error && <span className="text-xs font-normal text-rose-600">{error}</span>}
      {current && !preview && (
        <label className="flex items-center gap-2 text-xs font-normal text-slate-500">
          <input type="checkbox" name="remove_poster" checked={remove} onChange={(event) => setRemove(event.target.checked)} className="accent-brand-600" />
          <Trash2 size={13} /> Remove the current poster
        </label>
      )}
    </div>
  )
}
