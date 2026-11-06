import Link from 'next/link'
import { LogOut } from 'lucide-react'
import { logout } from '@/app/actions/auth'
import { NotificationBell } from '@/components/NotificationBell'
import { SiteNav } from '@/components/SiteNav'
import { Logo } from '@/components/ui'
import { getCurrentUser, getMemberships } from '@/lib/auth'
import { getSettings } from '@/lib/settings'

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [user, { branding, homepage }] = await Promise.all([getCurrentUser(), getSettings()])
  const memberships = user ? await getMemberships(user.id) : []
  const links = [
    { href: '/', label: 'Home' },
    { href: '/events', label: 'Events' },
    { href: '/pricing', label: 'Pricing' },
    { href: '/rewards', label: 'Earn' },
    { href: user ? '/tickets' : '/login?next=/tickets', label: 'My tickets' },
  ]

  return (
    <div className="site-theme flex min-h-screen flex-col bg-moss-50 text-moss-950">
      {homepage.announcement && <div className="bg-moss-900 px-4 py-2 text-center text-xs font-medium text-moss-100">{homepage.announcement}</div>}
      <header className="relative z-40">
        <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between gap-4 px-5">
          <Logo name={branding.appName} />
          <SiteNav links={links} more={user ? [
            ...(memberships.length ? [{ href: '/dashboard', label: 'Dashboard' }] : []),
            ...(user.is_super_admin ? [{ href: '/admin', label: 'Super admin' }] : []),
            { href: '/notifications', label: 'Notifications' },
            { href: '/account', label: 'Account' },
          ] : [{ href: '/signup', label: 'Sign up' }]} />
          <div className="flex items-center gap-2 text-[13px] font-medium">
            {user ? (
              <>
                {memberships.length > 0 && <Link href="/dashboard" className="hidden rounded-full px-4 py-2 text-moss-800 hover:bg-white/60 sm:block">Dashboard</Link>}
                {user.is_super_admin && <Link href="/admin" className="hidden rounded-full px-4 py-2 text-moss-800 hover:bg-white/60 sm:block">Admin</Link>}
                <NotificationBell tone="moss" />
                <Link href="/account" className="hidden rounded-full px-4 py-2 text-moss-800 hover:bg-white/60 lg:block">Account</Link>
                <form action={logout}>
                  <button className="grid size-10 place-items-center rounded-full bg-white/60 text-moss-800 backdrop-blur hover:bg-white" title={`Log out ${user.email}`}><LogOut size={16} /><span className="sr-only">Log out</span></button>
                </form>
              </>
            ) : (
              <>
                <Link href="/login" className="rounded-full px-4 py-2 text-moss-900 hover:bg-white/60">Login</Link>
                <Link href="/signup" className="hidden rounded-full bg-moss-900 px-5 py-2.5 text-white hover:bg-moss-800 sm:block">Sign up</Link>
              </>
            )}
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="mt-20 rounded-t-[2.5rem] bg-moss-950 text-moss-100">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="text-xl font-semibold text-white">{branding.appName}<span className="text-moss-300">.</span></Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-moss-200/70">{branding.tagline}. Built for the Federal University of Technology, Minna — Gidan Kwano and Bosso campuses.</p>
          </div>
          <div className="space-y-2.5 text-sm"><p className="mb-3 text-xs font-semibold uppercase tracking-widest text-moss-300">Attend</p><Link href="/events" className="block text-moss-200/80 hover:text-white">Browse events</Link><Link href="/tickets" className="block text-moss-200/80 hover:text-white">My tickets</Link></div>
          <div className="space-y-2.5 text-sm"><p className="mb-3 text-xs font-semibold uppercase tracking-widest text-moss-300">Organise</p><Link href="/pricing" className="block text-moss-200/80 hover:text-white">Plans</Link><Link href="/signup?type=organizer" className="block text-moss-200/80 hover:text-white">Apply as organiser</Link></div>
          <div className="space-y-2.5 text-sm"><p className="mb-3 text-xs font-semibold uppercase tracking-widest text-moss-300">Contact</p><a href={`mailto:${branding.supportEmail}`} className="block text-moss-200/80 hover:text-white">{branding.supportEmail}</a><p className="text-moss-200/60">FUT Minna, Niger State</p></div>
        </div>
        <div className="border-t border-white/10 px-6 py-5 text-center text-xs text-moss-200/50">© {new Date().getFullYear()} {branding.appName}. All rights reserved.</div>
      </footer>
    </div>
  )
}
