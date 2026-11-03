import Link from 'next/link'
import { ConfirmButton } from '@/components/Modal'
import { notFound } from 'next/navigation'
import { deleteOrganization, setOrganizationStatus, transferOwnership, updateOrganizationPlan } from '@/app/actions/admin'
import { Badge, Flash, PageHeader } from '@/components/ui'
import type { Organization } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'
import { formatDate, formatDateTime, formatMoney } from '@/lib/format'
import { ROLE_LABELS, type OrgRole } from '@/lib/permissions'

export default async function AdminOrganization({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<Record<string, string>> }) {
  const { orgId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) notFound()
  const org = await queryOne<Organization>('select * from organizations where id = $1', [orgId])
  if (!org) notFound()
  const [members, events, plans, [money]] = await Promise.all([
    query<{ user_id: string; role: OrgRole; email: string; full_name: string }>(
      'select m.user_id, m.role, u.email, u.full_name from organization_members m join users u on u.id = m.user_id where m.org_id = $1 order by m.role, u.email', [org.id]),
    query<{ id: string; title: string; status: string; start_time: Date; tickets: number }>(
      `select e.id, e.title, e.status, e.start_time, (select count(*) from tickets where event_id = e.id and status <> 'cancelled') as tickets
       from events e where e.org_id = $1 order by e.start_time desc`, [org.id]),
    query<{ id: string; name: string }>('select id, name from plans order by sort_order'),
    query<{ gmv: number; fees: number }>(`select coalesce(sum(total_minor), 0) as gmv, coalesce(sum(platform_fee_minor), 0) as fees from orders where org_id = $1 and status = 'paid'`, [org.id]),
  ])
  const hidden = <input type="hidden" name="org_id" value={org.id} />

  return (
    <>
      <Link href="/admin/organizations" className="text-sm text-slate-500 hover:text-brand-600">← Organisations</Link>
      <PageHeader eyebrow={org.kind.replace('_', ' ')} title={org.name} description={org.description || undefined}
        actions={<Link href={`/dashboard/${org.id}`} className="btn-primary">Open dashboard as super admin</Link>} />
      <Flash searchParams={await searchParams} />

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="card p-5 text-sm">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Status</h2><Badge status={org.status} /></div>
          <dl className="mt-4 space-y-2 text-slate-600">
            <div className="flex justify-between"><dt>Created</dt><dd>{formatDate(org.created_at)}</dd></div>
            <div className="flex justify-between"><dt>Contact</dt><dd>{org.contact_email ?? '—'} {org.contact_phone ?? ''}</dd></div>
            <div className="flex justify-between"><dt>Bank details</dt><dd>{org.account_number ? `${org.bank_name} · ${org.account_number}` : 'Not set'}</dd></div>
            <div className="flex justify-between"><dt>Ticket sales</dt><dd>{money.gmv ? formatMoney(money.gmv) : '₦0'}</dd></div>
            <div className="flex justify-between"><dt>Platform fees</dt><dd>{money.fees ? formatMoney(money.fees) : '₦0'}</dd></div>
          </dl>
          <form action={setOrganizationStatus} className="mt-5 flex flex-wrap gap-2">
            {hidden}
            {org.status !== 'active' && <button name="status" value="active" className="btn-primary btn-sm">{org.status === 'pending' ? 'Approve' : 'Reactivate'}</button>}
            {org.status !== 'suspended' && <ConfirmButton name="status" value="suspended" className="btn-danger btn-sm" title="Suspend this organisation?" message="Its events will be hidden and its team cannot make changes until you reactivate it." confirmLabel="Suspend">Suspend</ConfirmButton>}
            {org.status !== 'pending' && <button name="status" value="pending" className="btn-secondary btn-sm">Back to pending</button>}
          </form>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold">Plan</h2>
          <form action={updateOrganizationPlan} className="mt-4 grid gap-3">
            {hidden}
            <label className="field">Plan<select name="plan_id" defaultValue={org.plan_id} className="input">{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
            <label className="field">Paid until (optional)<input type="date" name="subscription_ends_at" defaultValue={org.subscription_ends_at ? new Date(org.subscription_ends_at).toISOString().slice(0, 10) : ''} className="input" /></label>
            <button className="btn-primary">Update plan</button>
          </form>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold">Transfer ownership</h2>
          <p className="mt-1 text-xs text-slate-500">The new owner must already have an account. The current owner becomes an admin.</p>
          <form action={transferOwnership} className="mt-4 grid gap-3">
            {hidden}
            <label className="field">New owner email<input name="email" type="email" required className="input" /></label>
            <button className="btn-secondary">Transfer</button>
          </form>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="card overflow-x-auto">
          <h2 className="border-b border-slate-100 p-4 font-semibold">Members</h2>
          <table className="data-table"><tbody>
            {members.map((member) => (
              <tr key={member.user_id}><td><p className="font-medium">{member.full_name || member.email}</p><p className="text-xs text-slate-500">{member.email}</p></td><td>{ROLE_LABELS[member.role]}</td></tr>
            ))}
          </tbody></table>
        </section>
        <section className="card overflow-x-auto">
          <h2 className="border-b border-slate-100 p-4 font-semibold">Events</h2>
          <table className="data-table"><tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td><Link href={`/dashboard/${org.id}/events/${event.id}`} className="font-medium text-brand-700 hover:underline">{event.title}</Link><p className="text-xs text-slate-500">{formatDateTime(event.start_time)}</p></td>
                <td><Badge status={event.status} /></td><td>{event.tickets} tickets</td>
              </tr>
            ))}
            {events.length === 0 && <tr><td className="py-6 text-center text-slate-500">No events.</td></tr>}
          </tbody></table>
        </section>
      </div>

      <section className="card mt-6 border-rose-200 p-5">
        <h2 className="font-semibold text-rose-700">Delete organisation</h2>
        <p className="mt-1 text-sm text-slate-600">Permanently removes the organisation, its events, orders and tickets. Not allowed once it has paid orders — suspend it instead.</p>
        <form action={deleteOrganization} className="mt-4 flex flex-wrap gap-2">
          {hidden}
          <input name="confirm_name" placeholder={`Type “${org.name}” to confirm`} className="input max-w-sm" />
          <ConfirmButton className="btn-danger" title="Delete permanently?" message="The organisation, its events, orders, tickets and uploads are removed. This cannot be undone." confirmLabel="Delete forever">Delete permanently</ConfirmButton>
        </form>
      </section>
    </>
  )
}
