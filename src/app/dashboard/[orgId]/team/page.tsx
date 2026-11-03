import { inviteMember, revokeInvitation, updateMember } from '@/app/actions/org'
import { ConfirmButton } from '@/components/Modal'
import { Badge, Flash, PageHeader } from '@/components/ui'
import { requireOrgAccess } from '@/lib/auth'
import { query } from '@/lib/db'
import { formatDate } from '@/lib/format'
import { ROLE_LABELS, type OrgRole } from '@/lib/permissions'

const ROLE_HELP: Record<string, string> = {
  admin: 'Everything, including team and bank settings',
  organizer: 'Create events, manage tickets, review payments, scan',
  scanner: 'Gate check-in only',
}

export default async function TeamPage({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<Record<string, string>> }) {
  const { orgId } = await params
  const { org, role, user } = await requireOrgAccess(orgId, 'team.manage')
  const [members, invites] = await Promise.all([
    query<{ user_id: string; role: OrgRole; full_name: string; email: string; created_at: Date }>(
      `select m.user_id, m.role, u.full_name, u.email, m.created_at from organization_members m join users u on u.id = m.user_id
       where m.org_id = $1 order by array_position(array['owner','admin','organizer','scanner'], m.role), u.full_name`,
      [org.id],
    ),
    query<{ id: string; email: string; role: string; created_at: Date }>('select id, email, role, created_at from invitations where org_id = $1 and accepted_at is null order by created_at desc', [org.id]),
  ])
  const hidden = <input type="hidden" name="org_id" value={org.id} />

  return (
    <>
      <PageHeader eyebrow="Team" title="Team & roles" description="Give gate staff the Gate scanner role so they can only check tickets in." />
      <Flash searchParams={await searchParams} />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>Member</th><th>Role</th><th>Since</th><th></th></tr></thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.user_id}>
                  <td data-label="Member"><p className="font-medium">{member.full_name || member.email}</p><p className="text-xs text-slate-500">{member.email}</p></td>
                  <td data-label="Role"><Badge status={member.role === 'owner' ? 'active' : 'draft'} label={ROLE_LABELS[member.role]} /></td>
                  <td data-label="Since">{formatDate(member.created_at)}</td>
                  <td data-label="" className="text-right">
                    {member.role !== 'owner' && member.user_id !== user.id && (role === 'owner' || member.role !== 'admin') && (
                      <form action={updateMember} className="flex justify-end gap-1">
                        {hidden}<input type="hidden" name="user_id" value={member.user_id} />
                        <select name="role" defaultValue={member.role} className="input w-36 py-1.5 text-xs">
                          {role === 'owner' && <option value="admin">Admin</option>}
                          <option value="organizer">Organizer</option>
                          <option value="scanner">Gate scanner</option>
                          <option value="remove">Remove from team</option>
                        </select>
                        <button className="btn-secondary btn-sm">Apply</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              {invites.map((invite) => (
                <tr key={invite.id} className="bg-amber-50/40">
                  <td data-label="Member"><p className="font-medium">{invite.email}</p><p className="text-xs text-slate-500">Invited — gets access on sign-up</p></td>
                  <td data-label="Role"><Badge status="pending" label={ROLE_LABELS[invite.role as OrgRole]} /></td>
                  <td data-label="Since">{formatDate(invite.created_at)}</td>
                  <td data-label="" className="text-right"><form action={revokeInvitation}>{hidden}<input type="hidden" name="invitation_id" value={invite.id} /><ConfirmButton title="Revoke this invitation?" message={<>{invite.email} will no longer get access when they sign up.</>} confirmLabel="Revoke">Revoke</ConfirmButton></form></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={inviteMember} className="card grid gap-3 self-start p-5">
          {hidden}
          <h3 className="font-semibold">Add a team member</h3>
          <label className="field">Email<input name="email" type="email" required className="input" /></label>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium text-slate-700">Role</legend>
            {(role === 'owner' ? ['admin', 'organizer', 'scanner'] : ['organizer', 'scanner']).map((value) => (
              <label key={value} className="flex items-start gap-2 rounded-lg border border-slate-200 p-2.5 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                <input type="radio" name="role" value={value} defaultChecked={value === 'scanner'} className="mt-0.5 accent-brand-600" />
                <span><span className="font-medium">{ROLE_LABELS[value as OrgRole]}</span><span className="block text-xs text-slate-500">{ROLE_HELP[value]}</span></span>
              </label>
            ))}
          </fieldset>
          <button className="btn-primary">Add member</button>
        </form>
      </div>
    </>
  )
}
