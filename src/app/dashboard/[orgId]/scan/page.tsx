import Link from 'next/link'
import { ScanLine } from 'lucide-react'
import { Scanner } from '@/components/Scanner'
import { EmptyState, PageHeader } from '@/components/ui'
import { requireOrgAccess } from '@/lib/auth'
import { query } from '@/lib/db'
import { formatDateTime } from '@/lib/format'

export default async function ScanPage({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<Record<string, string>> }) {
  const { orgId } = await params
  const { event: selected } = await searchParams
  const { org } = await requireOrgAccess(orgId, 'checkin.scan')
  const events = await query<{ id: string; title: string; start_time: Date; venue: string; issued: number; checked_in: number }>(
    `select e.id, e.title, e.start_time, e.venue,
            (select count(*) from tickets where event_id = e.id and status <> 'cancelled') as issued,
            (select count(*) from tickets where event_id = e.id and status = 'checked_in') as checked_in
     from events e where e.org_id = $1 and e.status in ('published', 'completed') and e.end_time > now() - interval '1 day'
     order by e.start_time`,
    [org.id],
  )
  const event = events.find((item) => item.id === selected) ?? (events.length === 1 ? events[0] : undefined)

  return (
    <>
      <PageHeader eyebrow="Gate check-in" title={event ? event.title : 'Choose an event to scan'}
        description={event ? `${formatDateTime(event.start_time)} · ${event.venue}. Each ticket can be admitted once; every scan is logged.` : 'Pick the event you are working at. You can switch at any time.'}
        actions={event && events.length > 1 ? <Link href={`/dashboard/${org.id}/scan`} className="btn-secondary btn-sm">Switch event</Link> : undefined} />
      {event ? (
        <Scanner key={event.id} orgId={org.id} eventId={event.id} initialCounts={{ issued: event.issued, checked_in: event.checked_in }} />
      ) : events.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {events.map((item) => (
            <Link key={item.id} href={`/dashboard/${org.id}/scan?event=${item.id}`} className="card flex items-center gap-4 p-4 hover:ring-1 hover:ring-brand-500">
              <span className="grid size-11 place-items-center rounded-lg bg-brand-50 text-brand-600"><ScanLine size={20} /></span>
              <span><span className="block font-semibold">{item.title}</span><span className="text-xs text-slate-500">{formatDateTime(item.start_time)} · {item.checked_in}/{item.issued} in</span></span>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState icon={ScanLine} title="No events to check in" body="Published events appear here from the day before they start until a day after they end." />
      )}
    </>
  )
}
