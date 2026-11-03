import Link from 'next/link'
import { ConfirmButton } from '@/components/Modal'
import { adminUpdateEvent } from '@/app/actions/admin'
import { Badge, Flash, PageHeader } from '@/components/ui'
import { query } from '@/lib/db'
import { formatDateTime } from '@/lib/format'

export default async function AdminEvents({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const search = await searchParams
  const q = (search.q ?? '').trim().slice(0, 80)
  const events = await query<{ id: string; title: string; status: string; visibility: string; is_featured: boolean; start_time: Date; org_id: string; org_name: string; tickets: number; checked_in: number }>(
    `select e.id, e.title, e.status, e.visibility, e.is_featured, e.start_time, e.org_id, o.name as org_name,
            (select count(*) from tickets where event_id = e.id and status <> 'cancelled') as tickets,
            (select count(*) from tickets where event_id = e.id and status = 'checked_in') as checked_in
     from events e join organizations o on o.id = e.org_id
     where ($1 = '' or e.title ilike '%' || $1 || '%' or o.name ilike '%' || $1 || '%')
     order by (e.end_time < now()), e.start_time limit 500`,
    [q],
  )
  const path = `/admin/events${q ? `?q=${encodeURIComponent(q)}` : ''}`
  return (
    <>
      <PageHeader eyebrow="Content" title="All events" description="Feature events on the homepage, or unpublish and cancel anything that breaks the rules." />
      <Flash searchParams={search} />
      <form className="mb-4 flex gap-2"><input name="q" defaultValue={q} placeholder="Search event or organisation" className="input max-w-sm" /><button className="btn-secondary">Search</button></form>
      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>Event</th><th>Organisation</th><th>Starts</th><th>Status</th><th>Tickets</th><th></th></tr></thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td data-label="Event"><Link href={`/dashboard/${event.org_id}/events/${event.id}`} className="font-medium text-brand-700 hover:underline">{event.title}</Link>{event.is_featured && <span className="ml-2 text-xs font-semibold text-amber-600">★ Featured</span>}</td>
                <td data-label="Organisation">{event.org_name}</td>
                <td data-label="Starts">{formatDateTime(event.start_time)}</td>
                <td data-label="Status" className="space-x-1"><Badge status={event.status} />{event.visibility === 'unlisted' && <Badge status="unlisted" />}</td>
                <td data-label="Tickets">{event.checked_in}/{event.tickets}</td>
                <td data-label="">
                  <form action={adminUpdateEvent} className="flex justify-end gap-1">
                    <input type="hidden" name="event_id" value={event.id} /><input type="hidden" name="return_to" value={path} />
                    <button name="action" value="feature" className="btn-secondary btn-sm">{event.is_featured ? 'Unfeature' : 'Feature'}</button>
                    {event.status === 'published' && <ConfirmButton name="action" value="unpublish" tone="primary" title="Unpublish this event?" message="It disappears from the public site and stops selling tickets. Issued tickets stay valid." confirmLabel="Unpublish">Unpublish</ConfirmButton>}
                    {!['cancelled', 'completed'].includes(event.status) && <ConfirmButton name="action" value="cancel" className="btn-secondary btn-sm text-rose-600" title="Cancel this event?" message="Ticket holders will see it as cancelled and their tickets stop working at the gate." confirmLabel="Cancel event">Cancel</ConfirmButton>}
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
