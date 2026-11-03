import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { EmptyState } from '@/components/ui'
import { getMemberships, requireUser } from '@/lib/auth'

export default async function DashboardIndex() {
  const user = await requireUser('/dashboard')
  const memberships = await getMemberships(user.id)
  if (memberships.length > 0) redirect(`/dashboard/${memberships[0].org_id}`)
  if (user.is_super_admin) redirect('/admin')
  return (
    <main className="mx-auto max-w-xl px-4 py-20">
      <EmptyState icon={Building2} title="You are not part of an organisation yet"
        body="Register your department, faculty or company to plan events and sell tickets, or ask an organisation admin to invite your email."
        action={<div className="flex gap-2"><Link href="/organizers/new" className="btn-primary">Register an organisation</Link><Link href="/tickets" className="btn-secondary">My tickets</Link></div>} />
    </main>
  )
}
