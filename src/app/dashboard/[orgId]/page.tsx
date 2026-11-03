import Link from 'next/link'
import { BarChart3, ScanLine, TrendingUp } from 'lucide-react'
import { CardTitle, HighlightCard, LineChart, Ring, TrendingList } from '@/components/charts'
import { Badge, PageHeader } from '@/components/ui'
import { requireOrgAccess } from '@/lib/auth'
import { query } from '@/lib/db'
import { formatDateTime, formatMoney } from '@/lib/format'
import { can } from '@/lib/permissions'

const naira = (value: number) => (value ? formatMoney(value) : '₦0')

export default async function OrgOverview({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  const { org, role } = await requireOrgAccess(orgId)
  const [[stats], daily, ranked, upcoming] = await Promise.all([
    query<{ tickets: number; checked_in: number; revenue: number; awaiting: number }>(
      `select
         (select count(*) from tickets t join events e on e.id = t.event_id where e.org_id = $1 and t.status <> 'cancelled') as tickets,
         (select count(*) from tickets t join events e on e.id = t.event_id where e.org_id = $1 and t.status = 'checked_in') as checked_in,
         (select coalesce(sum(total_minor), 0) from orders where org_id = $1 and status = 'paid') as revenue,
         (select count(*) from orders where org_id = $1 and status = 'awaiting_review') as awaiting`,
      [org.id],
    ),
    query<{ day: string; tickets: number }>(
      `select to_char(d, 'DD Mon') as day,
              (select count(*) from tickets t join events e on e.id = t.event_id
               where e.org_id = $1 and t.status <> 'cancelled' and (t.issued_at at time zone 'Africa/Lagos')::date = d::date) as tickets
       from generate_series((now() at time zone 'Africa/Lagos')::date - 13, (now() at time zone 'Africa/Lagos')::date, interval '1 day') d
       order by d`,
      [org.id],
    ),
    query<{ id: string; title: string; sold: number; recent: number }>(
      `select e.id, e.title, count(t.id) as sold, count(t.id) filter (where t.issued_at > now() - interval '7 days') as recent
       from events e left join tickets t on t.event_id = e.id and t.status <> 'cancelled'
       where e.org_id = $1 and e.status in ('published', 'completed')
       group by e.id order by sold desc, e.start_time limit 5`,
      [org.id],
    ),
    query<{ id: string; title: string; start_time: Date; status: string; sold: number; capacity: number; checked_in: number }>(
      `select e.id, e.title, e.start_time, e.status,
              coalesce((select sum(quantity_sold) from ticket_types where event_id = e.id), 0) as sold,
              coalesce((select sum(quantity_total) from ticket_types where event_id = e.id), 0) as capacity,
              (select count(*) from tickets where event_id = e.id and status = 'checked_in') as checked_in
       from events e where e.org_id = $1 and e.end_time > now() and e.status in ('draft', 'published') order by e.start_time limit 8`,
      [org.id],
    ),
  ])
  const live = upcoming.filter((event) => event.status === 'published')
  const totalCapacity = live.reduce((sum, event) => sum + event.capacity, 0)
  const totalSold = live.reduce((sum, event) => sum + event.sold, 0)
  const checkInRate = stats.tickets ? Math.round((stats.checked_in / stats.tickets) * 100) : 0

  return (
    <>
      <PageHeader eyebrow="Analytics" title={org.name}
        actions={can(role, 'checkin.scan') ? <Link href={`/dashboard/${org.id}/scan`} className="btn-soft"><ScanLine size={16} /> Open scanner</Link> : undefined} />

      <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr_0.85fr]">
        <section className="card p-6">
          <CardTitle>Top events</CardTitle>
          <TrendingList items={ranked.map((event) => ({ href: `/dashboard/${org.id}/events/${event.id}`, title: event.title, value: event.sold, unit: 'Tickets', up: event.recent > 0 }))} />
        </section>

        <section className="card p-6">
          <CardTitle>Ticket sales</CardTitle>
          <p className="-mt-3 mb-2 text-xs text-slate-400">Tickets issued per day, last 14 days</p>
          <LineChart points={daily.map((row) => ({ label: row.day, value: row.tickets }))} format={(value) => Math.round(value).toLocaleString()} />
        </section>

        <div className="grid gap-6">
          <div className="card flex items-center gap-5 p-6">
            <BarChart3 size={34} strokeWidth={2.4} className="text-brand-600" />
            <div><p className="text-xs text-slate-400">Income</p><p className="text-2xl font-semibold text-slate-900">{naira(stats.revenue)}</p></div>
          </div>
          <div className="card flex items-center gap-5 p-6">
            <TrendingUp size={34} strokeWidth={2.4} className="text-brand-600" />
            <div><p className="text-xs text-slate-400">Tickets issued</p><p className="text-2xl font-semibold text-slate-900">{stats.tickets.toLocaleString()}</p></div>
          </div>
          <div className="card flex items-center gap-5 p-6">
            <Ring percent={checkInRate} size={40} />
            <div><p className="text-xs text-slate-400">Checked in</p><p className="text-2xl font-semibold text-slate-900">{checkInRate}%</p></div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.6fr]">
        <HighlightCard
          value={`${totalCapacity ? Math.round((totalSold / totalCapacity) * 100) : 0}%`}
          title="Capacity sold"
          subtitle={`${totalSold.toLocaleString()} of ${totalCapacity.toLocaleString()} seats`}
          bars={live.length ? live.map((event) => (event.capacity ? event.sold / event.capacity : 0)) : [0, 0, 0, 0, 0, 0]}
        />
        <section className="card overflow-x-auto">
          <div className="flex items-center justify-between px-6 pt-6">
            <CardTitle>Upcoming events</CardTitle>
            {stats.awaiting > 0 && <Link href={`/dashboard/${org.id}/orders`} className="mb-4 text-xs font-semibold text-brand-600">{stats.awaiting} payments to review →</Link>}
          </div>
          <table className="data-table">
            <thead><tr><th>Event</th><th>Date</th><th>Status</th><th>Sold</th><th>Checked in</th></tr></thead>
            <tbody>
              {upcoming.map((event) => (
                <tr key={event.id}>
                  <td data-label="Event"><Link href={`/dashboard/${org.id}/events/${event.id}`} className="font-medium text-slate-800 hover:text-brand-700">{event.title}</Link></td>
                  <td data-label="Date">{formatDateTime(event.start_time)}</td>
                  <td data-label="Status"><Badge status={event.status} /></td>
                  <td data-label="Sold">{event.sold} / {event.capacity}</td>
                  <td data-label="Checked in">{event.checked_in}</td>
                </tr>
              ))}
              {upcoming.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-slate-400">No upcoming events yet.</td></tr>}
            </tbody>
          </table>
        </section>
      </div>
    </>
  )
}
