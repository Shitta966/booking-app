'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import clsx from 'clsx'
import { Menu, X } from 'lucide-react'

/** `more` links appear only in the phone menu (on wider screens they sit in the header). */
export function SiteNav({ links, more = [] }: { links: Array<{ href: string; label: string }>; more?: Array<{ href: string; label: string }> }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const active = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`))

  return (
    <>
      <nav className="hidden items-center gap-1 rounded-full border border-white/60 bg-white/45 p-1 text-[13px] shadow-[0_4px_20px_rgba(31,38,18,0.06)] backdrop-blur-md md:flex">
        {links.map((link) => (
          <Link key={link.href} href={link.href}
            className={clsx('rounded-full px-5 py-2 font-medium transition', active(link.href) ? 'bg-white text-moss-950 shadow-sm' : 'text-moss-800/80 hover:text-moss-950')}>
            {link.label}
          </Link>
        ))}
      </nav>
      <button className="grid size-10 place-items-center rounded-full bg-white/60 text-moss-900 backdrop-blur md:hidden" onClick={() => setOpen(!open)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>
      {open && (
        <div className="absolute inset-x-4 top-[72px] z-50 rounded-3xl bg-white p-2 shadow-xl md:hidden">
          {[...links, ...more].map((link) => (
            <Link key={link.href} href={link.href} onClick={() => setOpen(false)}
              className={clsx('block rounded-2xl px-4 py-3 text-sm font-medium', active(link.href) ? 'bg-moss-100 text-moss-950' : 'text-moss-800')}>
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
