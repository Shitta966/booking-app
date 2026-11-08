import { cookies } from 'next/headers'
import { logout } from '@/app/actions/auth'
import { DashboardShell, SidebarLogout } from '@/components/DashboardShell'
import { requireSuperAdmin } from '@/lib/auth'
import { query } from '@/lib/db'
import { getSettings } from '@/lib/settings'

export const metadata = { title: 'Super admin' }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [user, { branding }, [{ pending }], [{ refunds }]] = await Promise.all([
    requireSuperAdmin(),
    getSettings(),
    query<{ pending: number }>(`select count(*) as pending from organizations where status = 'pending'`),
    query<{ refunds: number }>(`select count(*) as refunds from payments where status = 'refund_needed'`),
  ])
  return (
    <DashboardShell
      title={`${branding.appName} Super Admin`}
      subtitle="Platform control centre"
      nav={[
        { href: '/admin', label: 'Dashboard', icon: 'overview', exact: true },
        { href: '/admin/organizations', label: 'Organisations', icon: 'organizations', badge: pending },
        { href: '/admin/users', label: 'Users', icon: 'users' },
        { href: '/admin/events', label: 'Events', icon: 'events' },
        { href: '/admin/payments', label: 'Payments', icon: 'payments', badge: refunds, badgeTone: 'red' },
        { href: '/admin/plans', label: 'Plans & pricing', icon: 'plans' },
        { href: '/admin/audit', label: 'Audit log', icon: 'audit' },
      ]}
      bottomNav={[
        { href: '/admin/settings', label: 'Settings', icon: 'settings' },
        { href: '/', label: 'View site', icon: 'site' },
      ]}
      user={{ name: user.full_name, email: user.email }}
      logout={<SidebarLogout action={logout} />}
      defaultCollapsed={(await cookies()).get('futick_sidebar')?.value === 'collapsed'}
    >
      {children}
    </DashboardShell>
  )
}
