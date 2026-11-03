import { updateUserAccount } from '@/app/actions/admin'
import { ConfirmButton } from '@/components/Modal'
import { Badge, Flash, PageHeader } from '@/components/ui'
import { requireSuperAdmin } from '@/lib/auth'
import { query } from '@/lib/db'
import { formatDate } from '@/lib/format'

export default async function AdminUsers({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireSuperAdmin()
  const search = await searchParams
  const q = (search.q ?? '').trim().slice(0, 80)
  const users = await query<{ id: string; email: string; full_name: string; phone: string | null; is_super_admin: boolean; status: string; created_at: Date; last_login_at: Date | null; orgs: string | null; tickets: number }>(
    `select u.id, u.email, u.full_name, u.phone, u.is_super_admin, u.status, u.created_at, u.last_login_at,
            (select string_agg(o.name || ' (' || m.role || ')', ', ') from organization_members m join organizations o on o.id = m.org_id where m.user_id = u.id) as orgs,
            (select count(*) from tickets where user_id = u.id) as tickets
     from users u where ($1 = '' or u.email ilike '%' || $1 || '%' or u.full_name ilike '%' || $1 || '%')
     order by u.is_super_admin desc, u.created_at desc limit 300`,
    [q],
  )
  const path = `/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`

  return (
    <>
      <PageHeader eyebrow="Accounts" title="Users" description="Suspend accounts, grant super admin access, reset passwords and sign users out of every device." />
      <Flash searchParams={search} />
      <form className="mb-4 flex gap-2"><input name="q" defaultValue={q} placeholder="Search name or email" className="input max-w-sm" /><button className="btn-secondary">Search</button></form>
      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>User</th><th>Organisations</th><th>Tickets</th><th>Status</th><th>Last login</th><th>Actions</th></tr></thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td data-label="User"><p className="font-medium">{user.full_name || '—'} {user.is_super_admin && <Badge status="awaiting_review" label="super admin" />}</p><p className="text-xs text-slate-500">{user.email}{user.phone ? ` · ${user.phone}` : ''}</p><p className="text-xs text-slate-400">Joined {formatDate(user.created_at)}</p></td>
                <td data-label="Organisations" className="max-w-60 text-xs">{user.orgs ?? '—'}</td>
                <td data-label="Tickets">{user.tickets}</td>
                <td data-label="Status"><Badge status={user.status} /></td>
                <td data-label="Last login" className="text-xs">{user.last_login_at ? formatDate(user.last_login_at) : 'Never'}</td>
                <td data-label="Actions" className="min-w-72">
                  <form action={updateUserAccount} className="flex flex-wrap gap-1">
                    <input type="hidden" name="user_id" value={user.id} /><input type="hidden" name="return_to" value={path} />
                    {user.status === 'active'
                      ? user.id !== me.id && <ConfirmButton name="action" value="suspend" className="btn-secondary btn-sm text-rose-600" title="Suspend this account?" message={<>{user.email} will be signed out on every device and cannot log in until reactivated.</>} confirmLabel="Suspend">Suspend</ConfirmButton>
                      : <button name="action" value="activate" className="btn-secondary btn-sm">Activate</button>}
                    {user.is_super_admin
                      ? user.id !== me.id && <ConfirmButton name="action" value="revoke_admin" title="Remove super admin access?" message={<>{user.email} will lose access to the admin console.</>} confirmLabel="Remove access">Remove admin</ConfirmButton>
                      : <button name="action" value="grant_admin" className="btn-secondary btn-sm">Make super admin</button>}
                    <ConfirmButton name="action" value="sign_out" tone="primary" title="Sign this user out everywhere?" message="Every active session for this account ends immediately." confirmLabel="Sign out">Sign out everywhere</ConfirmButton>
                  </form>
                  <details className="mt-1 text-xs">
                    <summary className="cursor-pointer text-slate-500">Edit profile / set password</summary>
                    <form action={updateUserAccount} className="mt-2 grid gap-2">
                      <input type="hidden" name="user_id" value={user.id} /><input type="hidden" name="return_to" value={path} />
                      <input name="full_name" defaultValue={user.full_name} className="input py-1.5 text-xs" placeholder="Full name" />
                      <input name="phone" defaultValue={user.phone ?? ''} className="input py-1.5 text-xs" placeholder="Phone" />
                      <button name="action" value="update_profile" className="btn-secondary btn-sm">Save profile</button>
                      <input name="password" type="password" minLength={10} autoComplete="new-password" className="input py-1.5 text-xs" placeholder="New password (10+ characters)" />
                      <button name="action" value="set_password" className="btn-secondary btn-sm">Set password</button>
                    </form>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
