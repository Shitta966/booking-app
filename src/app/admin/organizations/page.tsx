import Link from 'next/link'
import { ConfirmButton } from '@/components/Modal'
import clsx from 'clsx'
import { setOrganizationStatus } from '@/app/actions/admin'
import { Badge, Flash, PageHeader } from '@/components/ui'
import { query } from '@/lib/db'
import { formatDate } from '@/lib/format'

const FILTERS = ['all', 'pending', 'active', 'suspended']

export default async function AdminOrganizations({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const search = await searchParams
  const status = FILTERS.includes(search.status) ? search.status : 'all'
  const q = (search.q ?? '').trim().slice(0, 80)
  const orgs = await query<{ id: string; name: string; kind: string; status: string; plan_id: string; created_at: Date; members: number; events: number; owner: string | null }>(
    `select o.id, o.name, o.kind, o.status, o.plan_id, o.created_at,
            (select count(*) from organization_members where org_id = o.id) as members,
            (select count(*) from events where org_id = o.id) as events,
            (select u.email from organization_members m join users u on u.id = m.user_id where m.org_id = o.id and m.role = 'owner' limit 1) as owner
     from organizations o
     where ($1 = 'all' or o.status = $1) and ($2 = '' or o.name ilike '%' || $2 || '%' or o.contact_email ilike '%' || $2 || '%')
     order by o.status = 'pending' desc, o.created_at desc limit 500`,
    [status, q],
  )
  const path = `/admin/organizations?status=${status}${q ? `&q=${encodeURIComponent(q)}` : ''}`

  return (
    <>
      <PageHeader eyebrow="Tenants" title="Organisations" description="Approve applications, change plans, suspend tenants or open any organisation’s dashboard." />
      <Flash searchParams={search} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((item) => (
          <Link key={item} href={`/admin/organizations?status=${item}`} className={clsx('rounded-full px-3 py-1.5 text-xs font-semibold capitalize ring-1 ring-inset', item === status ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200')}>{item}</Link>
        ))}
        <form className="ml-auto flex gap-2"><input type="hidden" name="status" value={status} /><input name="q" defaultValue={q} placeholder="Search name or email" className="input w-56 py-1.5" /><button className="btn-secondary btn-sm">Search</button></form>
      </div>
      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>Organisation</th><th>Owner</th><th>Plan</th><th>Status</th><th>Members</th><th>Events</th><th>Created</th><th></th></tr></thead>
          <tbody>
            {orgs.map((org) => (
              <tr key={org.id}>
                <td data-label="Organisation"><Link href={`/admin/organizations/${org.id}`} className="font-medium text-brand-700 hover:underline">{org.name}</Link><p className="text-xs capitalize text-slate-500">{org.kind.replace('_', ' ')}</p></td>
                <td data-label="Owner" className="text-xs">{org.owner ?? '—'}</td>
                <td data-label="Plan" className="capitalize">{org.plan_id}</td>
                <td data-label="Status"><Badge status={org.status} /></td>
                <td data-label="Members">{org.members}</td>
                <td data-label="Events">{org.events}</td>
                <td data-label="Created">{formatDate(org.created_at)}</td>
                <td data-label="">
                  <form action={setOrganizationStatus} className="flex justify-end gap-1">
                    <input type="hidden" name="org_id" value={org.id} /><input type="hidden" name="return_to" value={path} />
                    {org.status !== 'active' && <button name="status" value="active" className="btn-primary btn-sm">{org.status === 'pending' ? 'Approve' : 'Reactivate'}</button>}
                    {org.status !== 'suspended' && <ConfirmButton name="status" value="suspended" title="Suspend this organisation?" message={<>{org.name}’s events will be hidden and its team cannot make changes until you reactivate it.</>} confirmLabel="Suspend">Suspend</ConfirmButton>}
                    <Link href={`/dashboard/${org.id}`} className="btn-secondary btn-sm">Open</Link>
                  </form>
                </td>
              </tr>
            ))}
            {orgs.length === 0 && <tr><td colSpan={8} className="py-10 text-center text-slate-500">No organisations match.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
