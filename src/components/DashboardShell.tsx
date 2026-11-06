'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import clsx from 'clsx'
import {
  BarChart3, Building2, CalendarDays, ChevronsLeft, ChevronsRight, Ellipsis, ClipboardList, CreditCard, Globe, HelpCircle, LayoutDashboard, LogOut, Menu, Plus, ScanLine,
  Gift, ScrollText, Settings, ShieldCheck, Ticket, Users, X, type LucideIcon,
} from 'lucide-react'
import { NotificationBell } from './NotificationBell'
import { LogoMark } from './ui'

const ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard, events: CalendarDays, orders: CreditCard, scan: ScanLine, team: Users, settings: Settings,
  organizations: Building2, users: Users, plans: ClipboardList, audit: ScrollText, stats: BarChart3, tickets: Ticket, admin: ShieldCheck,
  help: HelpCircle, site: Globe, rewards: Gift,
}

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; exact?: boolean; badge?: number; badgeTone?: 'gold' | 'red' }

type Props = {
  title: string
  subtitle: string
  nav: NavItem[]
  bottomNav?: NavItem[]
  user: { name: string; email: string }
  cta?: { href: string; label: string }
  switcher?: React.ReactNode
  banner?: React.ReactNode
  logout: React.ReactNode
  /** Desktop sidebar state from the futick_sidebar cookie, so the first render matches the saved choice. */
  defaultCollapsed?: boolean
  children: React.ReactNode
}

/** Hidden when the desktop sidebar is collapsed to its icon rail (the drawer on phones never collapses). */
const LABEL = 'group-data-[collapsed=true]/side:sr-only'

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`)
}

function NavLink({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate: () => void }) {
  const Icon = ICONS[item.icon]
  const active = isActive(pathname, item)
  const external = item.href.startsWith('mailto:')
  const className = clsx(
    'relative flex items-center gap-3.5 rounded-full py-1.5 pl-1.5 pr-4 text-[13px] font-medium transition group-data-[collapsed=true]/side:w-12 group-data-[collapsed=true]/side:pr-1.5',
    active ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white',
  )
  const content = (
    <>
      <span className={clsx('grid size-9 shrink-0 place-items-center rounded-full transition', active ? 'bg-white text-brand-600 shadow-sm' : 'text-white/85')}>
        <Icon size={18} strokeWidth={2} />
      </span>
      <span className={clsx('flex-1 truncate', LABEL)}>{item.label}</span>
      {item.badge ? (
        <span className={clsx('grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-bold group-data-[collapsed=true]/side:absolute group-data-[collapsed=true]/side:-right-1 group-data-[collapsed=true]/side:-top-1', item.badgeTone === 'red' ? 'bg-rose-500 text-white' : 'bg-gold-400 text-brand-950')}>
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      ) : null}
    </>
  )
  return external
    ? <a href={item.href} className={className} title={item.label}>{content}</a>
    : <Link href={item.href} onClick={onNavigate} className={className} title={item.label} aria-current={active ? 'page' : undefined}>{content}</Link>
}

export function DashboardShell({ title, subtitle, nav, bottomNav = [], user, cta, switcher, banner, logout, defaultCollapsed = false, children }: Props) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const close = () => setOpen(false)
  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    document.cookie = `futick_sidebar=${next ? 'collapsed' : 'open'}; path=/; max-age=31536000; samesite=lax`
  }
  const current = [...nav, ...bottomNav].filter((item) => isActive(pathname, item)).sort((a, b) => b.href.length - a.href.length)[0]
  const initials = (user.name || user.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join('')

  const sidebar = (isCollapsed: boolean) => (
    <div data-collapsed={isCollapsed} className="group/side flex h-full flex-col bg-brand-600 pt-[env(safe-area-inset-top)] text-white">
      <div className="flex h-20 shrink-0 items-center justify-between px-7 group-data-[collapsed=true]/side:justify-center group-data-[collapsed=true]/side:px-0">
        <Link href="/" className="flex items-center gap-2.5 text-xl font-semibold tracking-tight" title="FUTICK home">
          <LogoMark className="h-7 w-9" /><span className={LABEL}>FUTICK<span className="text-gold-400">.</span></span>
        </Link>
        <button className="grid size-9 place-items-center rounded-full hover:bg-white/10 md:hidden" onClick={close} aria-label="Close menu"><X size={20} /></button>
      </div>
      <div className="mx-5 mb-5 rounded-2xl bg-white/10 px-4 py-3 group-data-[collapsed=true]/side:mx-auto group-data-[collapsed=true]/side:grid group-data-[collapsed=true]/side:size-12 group-data-[collapsed=true]/side:place-items-center group-data-[collapsed=true]/side:p-0" title={title}>
        {isCollapsed ? <span className="text-sm font-semibold">{title.slice(0, 2).toUpperCase()}</span> : (
          <>
            <p className="truncate text-sm font-semibold">{title}</p>
            <p className="truncate text-[11px] text-white/60">{subtitle}</p>
            {switcher && <div className="mt-2">{switcher}</div>}
          </>
        )}
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-5 group-data-[collapsed=true]/side:px-0 group-data-[collapsed=true]/side:[&>*]:mx-auto">
        {nav.map((item) => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={close} />)}
      </nav>
      <div className="space-y-1 border-t border-white/10 px-5 pt-4 group-data-[collapsed=true]/side:px-0 group-data-[collapsed=true]/side:[&>*]:mx-auto">
        {bottomNav.map((item) => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={close} />)}
        {logout}
      </div>
      <div className={clsx('px-7 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-5 text-[10px] leading-relaxed text-white/50', LABEL)}>
        <p className="font-semibold text-white/80">FUTICK Event & Ticketing Dashboard</p>
        <p>© {new Date().getFullYear()} Federal University of Technology, Minna</p>
      </div>
      <button onClick={toggleCollapsed} className="mx-auto mb-5 hidden size-9 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white md:grid" aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
        {isCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
      </button>
    </div>
  )
  // Phones get an app-style tab bar with the four main destinations; everything else lives in the drawer.
  const tabs = nav.slice(0, 4)

  return (
    <div className="flex h-screen overflow-hidden bg-[#f5f6fb]">
      <aside className={clsx('hidden shrink-0 transition-[width] duration-200 md:block', collapsed ? 'w-[88px]' : 'w-[260px]')}>{sidebar(collapsed)}</aside>
      {open && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="w-[min(280px,85vw)]">{sidebar(false)}</div>
          <button className="flex-1 bg-slate-900/40" aria-label="Close menu" onClick={close} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-3 bg-white px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] md:h-20 md:gap-4 md:px-8 md:py-0">
          <button className="grid size-10 place-items-center rounded-full text-slate-700 hover:bg-slate-100 md:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={22} /></button>
          <button className="hidden size-10 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 md:grid" onClick={toggleCollapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-pressed={collapsed}><Menu size={20} /></button>
          <h2 className="min-w-0 truncate text-base font-semibold text-slate-900 md:text-lg">{current?.label ?? title}</h2>
          <div className="ml-auto flex shrink-0 items-center gap-2 md:gap-3">
            <NotificationBell />
            <Link href="/account" title={`${user.email} — account settings`} className="grid size-10 place-items-center rounded-full bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700">{initials}</Link>
            {cta && (
              <Link href={cta.href} className="hidden items-center gap-2 rounded-full border border-brand-200 px-4 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50 sm:inline-flex">
                <Plus size={14} />{cta.label}
              </Link>
            )}
          </div>
        </header>
        {banner}
        <main className="flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] pt-5 md:px-8 md:py-7">{children}</main>
      </div>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {tabs.map((item) => {
          const Icon = ICONS[item.icon]
          const active = isActive(pathname, item)
          return (
            <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}
              className={clsx('relative flex min-h-16 flex-col items-center justify-center gap-1 text-[10px] font-medium', active ? 'text-brand-600' : 'text-slate-400')}>
              <Icon size={21} strokeWidth={active ? 2.4 : 2} />
              <span className="max-w-full truncate px-1">{item.label}</span>
              {item.badge ? <span className="absolute right-[calc(50%-18px)] top-2 grid h-4 min-w-4 place-items-center rounded-full bg-gold-400 px-1 text-[9px] font-bold text-brand-950">{item.badge}</span> : null}
            </Link>
          )
        })}
        <button onClick={() => setOpen(true)} className="flex min-h-16 flex-col items-center justify-center gap-1 text-[10px] font-medium text-slate-400">
          <Ellipsis size={21} /><span>More</span>
        </button>
      </nav>
    </div>
  )
}

/** Sidebar-styled log-out button; the form action is passed in by the server layout. */
export function SidebarLogout({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <button title="Logout" className="flex w-full items-center gap-3.5 rounded-full py-1.5 pl-1.5 pr-4 text-[13px] font-medium text-white/75 transition hover:bg-white/10 hover:text-white group-data-[collapsed=true]/side:mx-auto group-data-[collapsed=true]/side:w-12 group-data-[collapsed=true]/side:pr-1.5">
        <span className="grid size-9 shrink-0 place-items-center"><LogOut size={18} /></span><span className={LABEL}>Logout</span>
      </button>
    </form>
  )
}
