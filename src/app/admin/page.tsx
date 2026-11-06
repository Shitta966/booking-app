import Link from 'next/link'
import { ConfirmButton } from '@/components/Modal'
import { BarChart3, Users } from 'lucide-react'
import { CardTitle, HighlightCard, LineChart, Ring, TrendingList } from '@/components/charts'
import { setOrganizationStatus } from '@/app/actions/admin'
import { Flash, PageHeader } from '@/components/ui'
import { query } from '@/lib/db'
import { formatDate, formatDateTime, formatMoney } from '@/lib/format'

export default async function AdminOverview({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const [[stats], pending, recent, daily, topOrgs, checkins] = await Promise.all([
    query<{ orgs: number; pending_orgs: number; users: number; live_events: number; tickets: number; checked_in: number; gmv: number; fees: number }>(
      `select (select count(*) from organizations where status = 'active') as orgs,
              (select count(*) from organizations where status = 'pending') as pending_orgs,
              (select count(*) from users) as users,
              (select count(*) from events where status = 'published' and end_time > now()) as live_events,
              (select count(*) from tickets where status <> 'cancelled') as tickets,
              (select count(*) from tickets where status = 'checked_in') as checked_in,
              (select coalesce(sum(total_minor), 0) from orders where status = 'paid') as gmv,
              (select coalesce(sum(platform_fee_minor), 0) from orders where status = 'paid') as fees`,
    ),
    query<{ id: string; name: string; kind: string; contact_email: string | null; created_at: Date; owner: string | null }>(
      `select o.id, o.name, o.kind, o.contact_email, o.created_at,
              (select u.email from organization_members m join users u on u.id = m.user_id where m.org_id = o.id and m.role = 'owner' limit 1) as owner
       from organizations o where o.status = 'pending' order by o.created_at limit 20`,
    ),
    query<{ id: string; action: string; created_at: Date; actor: string | null; org: string | null }>(
      `select a.id, a.action, a.created_at, u.email as actor, o.name as org from audit_logs a
       left join users u on u.id = a.actor_id left join organizations o on o.id = a.org_id order by a.created_at desc limit 12`,
    ),
    query<{ day: string; gmv: number }>(
      `select to_char(d, 'DD Mon') as day,
              (select coalesce(sum(total_minor), 0) from orders where status = 'paid' and (updated_at at time zone 'Africa/Lagos')::date = d::date) as gmv
       from generate_series((now() at time zone 'Africa/Lagos')::date - 29, (now() at time zone 'Africa/Lagos')::date, interval '1 day') d order by d`,
    ),
    query<{ id: string; name: string; tickets: number; recent: number }>(
      `select o.id, o.name, count(t.id) as tickets, count(t.id) filter (where t.issued_at > now() - interval '7 days') as recent
       from organizations o left join events e on e.org_id = o.id left join tickets t on t.event_id = e.id and t.status <> 'cancelled'
       where o.status = 'active' group by o.id order by tickets desc limit 5`,
    ),
    query<{ scans: number }>(
      `select (select count(*) from check_ins where result = 'admitted' and (created_at at time zone 'Africa/Lagos')::date = d::date) as scans
       from generate_series((now() at time zone 'Africa/Lagos')::date - 11, (now() at time zone 'Africa/Lagos')::date, interval '1 day') d order by d`,
    ),
  ])
  const [referral] = await query<{ joined: number; qualified: number; issued: number; used: number; pro_months: number }>(
    `select (select count(*) from users where referred_by is not null) as joined,
            (select count(*) from users where referral_qualified_at is not null) as qualified,
            (select count(*) from reward_coupons) as issued,
            (select count(*) from reward_coupons where status = 'used') as used,
            coalesce((select sum(months) from org_reward_redemptions), 0) as pro_months`,
  )
  const checkInRate = stats.tickets ? Math.round((stats.checked_in / stats.tickets) * 100) : 0
  const naira = (value: number) => (value ? formatMoney(value) : '₦0')

  return (
    <>
      <PageHeader eyebrow="Analytics" title="Platform overview" description="Every organisation, event, ticket and setting on FUTICK." />
      <Flash searchParams={await searchParams} />
      <div className="grid gap-6 xl:grid-cols-[1.1fr_1.2fr_0.8fr]">
        <section className="card p-6">
          <CardTitle>Top organisations</CardTitle>
          <TrendingList items={topOrgs.map((org) => ({ href: `/admin/organizations/${org.id}`, title: org.name, value: org.tickets, unit: 'Tickets', up: org.recent > 0 }))} />
        </section>
        <section className="card p-6">
          <CardTitle>Revenue</CardTitle>
          <p className="-mt-3 mb-2 text-xs text-slate-400">Paid ticket sales per day, last 30 days</p>
          <LineChart points={daily.map((row) => ({ label: row.day, value: row.gmv }))} format={(value) => (value >= 100000 ? `₦${Math.round(value / 100000)}k` : `₦${Math.round(value / 100)}`)} />
        </section>
        <div className="grid gap-6">
          <div className="card flex items-center gap-5 p-6">
            <BarChart3 size={34} strokeWidth={2.4} className="text-brand-600" />
            <div><p className="text-xs text-slate-400">Platform fees</p><p className="text-2xl font-semibold text-slate-900">{naira(stats.fees)}</p><p className="text-[11px] text-slate-400">on {naira(stats.gmv)} sales</p></div>
          </div>
          <div className="card flex items-center gap-5 p-6">
            <Users size={34} strokeWidth={2.4} className="text-brand-600" />
            <div><p className="text-xs text-slate-400">Users · organisations</p><p className="text-2xl font-semibold text-slate-900">{stats.users.toLocaleString()} · {stats.orgs}</p><p className="text-[11px] text-slate-400">{stats.live_events} live events</p></div>
          </div>
          <div className="card flex items-center gap-5 p-6">
            <Ring percent={checkInRate} size={40} />
            <div><p className="text-xs text-slate-400">Check-in rate</p><p className="text-2xl font-semibold text-slate-900">{checkInRate}%</p><p className="text-[11px] text-slate-400">{stats.checked_in.toLocaleString()} of {stats.tickets.toLocaleString()} tickets</p></div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Referred sign-ups', referral.joined],
          ['Referrals that booked', referral.qualified],
          ['Free tickets issued', `${referral.issued} (${referral.used} used)`],
          ['Pro months earned by organisers', referral.pro_months],
        ].map(([label, value]) => (
          <div key={label as string} className="card p-5"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-xl font-semibold text-slate-900">{value}</p></div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.8fr_1.2fr_1fr]">
        <HighlightCard value={checkins.reduce((sum, row) => sum + row.scans, 0).toLocaleString()} title="Gate admissions" subtitle="last 12 days" bars={checkins.map((row) => row.scans)} />
        <section className="card">
          <h2 className="px-6 pt-6 text-[15px] font-semibold">Awaiting approval</h2>
          <ul className="divide-y divide-slate-100">
            {pending.map((org) => (
              <li key={org.id} className="flex flex-wrap items-center gap-3 px-6 py-4">
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/organizations/${org.id}`} className="font-medium text-brand-700 hover:underline">{org.name}</Link>
                  <p className="text-xs text-slate-500">{org.kind.replace('_', ' ')} · {org.owner ?? org.contact_email} · applied {formatDate(org.created_at)}</p>
                </div>
                <form action={setOrganizationStatus} className="flex gap-1">
                  <input type="hidden" name="org_id" value={org.id} /><input type="hidden" name="return_to" value="/admin" />
                  <button name="status" value="active" className="btn-primary btn-sm">Approve</button>
                  <ConfirmButton name="status" value="suspended" title="Decline this organisation?" message={<>{org.name} will be suspended and cannot publish events. You can reactivate it later.</>} confirmLabel="Decline">Decline</ConfirmButton>
                </form>
              </li>
            ))}
            {pending.length === 0 && <li className="p-6 text-center text-sm text-slate-500">No applications waiting.</li>}
          </ul>
        </section>
        <section className="card">
          <div className="flex items-center justify-between px-6 pt-6"><h2 className="text-[15px] font-semibold">Recent activity</h2><Link href="/admin/audit" className="text-sm text-brand-600">Audit log →</Link></div>
          <ul className="divide-y divide-slate-100 text-sm">
            {recent.map((entry) => (
              <li key={entry.id} className="px-6 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate font-mono text-xs text-brand-700">{entry.action}</span>
                  <span className="shrink-0 text-[11px] text-slate-400">{formatDateTime(entry.created_at)}</span>
                </div>
                <p className="truncate text-xs text-slate-500">{entry.actor ?? 'system'}{entry.org ? ` · ${entry.org}` : ''}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}
