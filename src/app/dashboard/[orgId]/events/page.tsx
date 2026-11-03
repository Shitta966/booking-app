import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import { Badge, EmptyState, Flash, PageHeader } from '@/components/ui'
import { requireOrgAccess } from '@/lib/auth'
import { query } from '@/lib/db'
import { formatDateTime } from '@/lib/format'
import { can } from '@/lib/permissions'

export default async function OrgEvents({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<Record<string, string>> }) {
  const { orgId } = await params
  const { org, role } = await requireOrgAccess(orgId)
  const events = await query<{ id: string; title: string; venue: string; start_time: Date; status: string; visibility: string; sold: number; capacity: number; tasks_open: number }>(
    `select e.id, e.title, e.venue, e.start_time, e.status, e.visibility,
            coalesce((select sum(quantity_sold) from ticket_types where event_id = e.id), 0) as sold,
            coalesce((select sum(quantity_total) from ticket_types where event_id = e.id), 0) as capacity,
            (select count(*) from event_tasks where event_id = e.id and status <> 'done') as tasks_open
     from events e where e.org_id = $1 order by (e.end_time < now()), e.start_time`,
    [org.id],
  )
  return (
    <>
      <PageHeader eyebrow="Events" title="Your events" description="Drafts are private. Published events appear on FUTICK and can sell tickets."
        actions={can(role, 'events.manage') ? <Link href={`/dashboard/${org.id}/events/new`} className="btn-primary">New event</Link> : undefined} />
      <Flash searchParams={await searchParams} />
      {events.length === 0 ? <EmptyState icon={CalendarDays} title="No events yet" body="Create your first event to start planning and selling tickets." /> : (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>Event</th><th>When</th><th>Status</th><th>Tickets sold</th><th>Open tasks</th></tr></thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td data-label="Event"><Link href={`/dashboard/${org.id}/events/${event.id}`} className="font-medium text-brand-700 hover:underline">{event.title}</Link><p className="text-xs text-slate-500">{event.venue}</p></td>
                  <td data-label="When">{formatDateTime(event.start_time)}</td>
                  <td data-label="Status" className="space-x-1"><Badge status={event.status} />{event.visibility === 'unlisted' && <Badge status="unlisted" />}</td>
                  <td data-label="Tickets sold">{event.sold} / {event.capacity}</td>
                  <td data-label="Open tasks">{event.tasks_open}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
