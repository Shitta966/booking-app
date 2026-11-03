import { cookies } from 'next/headers'
import Link from 'next/link'
import { logout } from '@/app/actions/auth'
import { DashboardShell, SidebarLogout, type NavItem } from '@/components/DashboardShell'
import { getMemberships, requireOrgAccess } from '@/lib/auth'
import { query } from '@/lib/db'
import { can, ROLE_LABELS } from '@/lib/permissions'
import { getSettings } from '@/lib/settings'

export default async function OrgLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  const { org, role, user, viaSuperAdmin } = await requireOrgAccess(orgId)
  const [memberships, [{ awaiting }], { branding }] = await Promise.all([
    getMemberships(user.id),
    query<{ awaiting: number }>(`select count(*) as awaiting from orders where org_id = $1 and status = 'awaiting_review'`, [org.id]),
    getSettings(),
  ])
  const base = `/dashboard/${org.id}`
  const reviewer = can(role, 'orders.review')
  const nav: NavItem[] = [
    { href: base, label: 'Dashboard', icon: 'overview', exact: true },
    { href: `${base}/events`, label: 'Events', icon: 'events' },
    ...(reviewer ? [{ href: `${base}/orders`, label: 'Orders', icon: 'orders', badge: awaiting } as NavItem] : []),
    { href: `${base}/scan`, label: 'Check-in', icon: 'scan', badge: 0 },
    ...(can(role, 'team.manage') ? [{ href: `${base}/team`, label: 'Team', icon: 'team' } as NavItem] : []),
  ]
  const bottomNav: NavItem[] = [
    ...(can(role, 'org.settings') ? [{ href: `${base}/settings`, label: 'Settings', icon: 'settings' } as NavItem] : []),
    { href: '/tickets', label: 'My tickets', icon: 'tickets' },
    ...(user.is_super_admin ? [{ href: '/admin', label: 'Super admin', icon: 'admin' } as NavItem] : []),
    { href: `mailto:${branding.supportEmail}`, label: 'Help', icon: 'help' },
  ]

  const banner = (
    <>
      {viaSuperAdmin && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-brand-950 px-8 py-2.5 text-xs text-white">
          <span>Super admin view of <b>{org.name}</b>. Changes you make are recorded in the audit log.</span>
          <Link href={`/admin/organizations/${org.id}`} className="font-semibold text-gold-400 hover:underline">Back to admin</Link>
        </div>
      )}
      {org.status === 'pending' && <div className="bg-gold-400/25 px-8 py-2.5 text-xs text-amber-900">This organisation is awaiting verification by a FUTICK administrator. You can prepare draft events now; publishing unlocks once it is approved.</div>}
      {org.status === 'suspended' && <div className="bg-rose-100 px-8 py-2.5 text-xs text-rose-900">This organisation is suspended. Its events are hidden and changes are disabled. Contact support.</div>}
    </>
  )

  const switcher = memberships.length > 1 ? (
    <details className="text-[11px]">
      <summary className="cursor-pointer list-none text-white/70 hover:text-white">Switch organisation ▾</summary>
      <div className="mt-1 space-y-0.5">
        {memberships.filter((item) => item.org_id !== org.id).map((item) => (
          <Link key={item.org_id} href={`/dashboard/${item.org_id}`} className="block truncate rounded-lg px-2 py-1 text-white/75 hover:bg-white/10 hover:text-white">{item.name}</Link>
        ))}
      </div>
    </details>
  ) : null

  return (
    <DashboardShell
      title={org.name}
      subtitle={`${ROLE_LABELS[role]}${viaSuperAdmin ? ' (super admin)' : ''} · ${org.plan_id} plan`}
      nav={nav}
      bottomNav={bottomNav}
      user={{ name: user.full_name, email: user.email }}
      cta={can(role, 'events.manage') ? { href: `${base}/events/new`, label: 'New event' } : undefined}
      switcher={switcher}
      banner={banner}
      logout={<SidebarLogout action={logout} />}
      defaultCollapsed={(await cookies()).get('futick_sidebar')?.value === 'collapsed'}
    >
      {children}
    </DashboardShell>
  )
}
