import { notFound } from 'next/navigation'
import { requireOrgAccess } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'
import { formatTicketCode } from '@/lib/tickets'

function csv(value: unknown) {
  let text = value instanceof Date ? value.toISOString() : String(value ?? '')
  // Neutralise spreadsheet formulas in user-supplied values.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

export async function GET(_request: Request, { params }: { params: Promise<{ orgId: string; eventId: string }> }) {
  const { orgId, eventId } = await params
  const { org } = await requireOrgAccess(orgId, 'events.manage')
  const event = await queryOne<{ title: string }>('select title from events where id = $1 and org_id = $2', [eventId, org.id])
  if (!event) notFound()
  const rows = await query<Record<string, unknown>>(
    `select t.attendee_name, u.email, u.phone, tt.name as ticket_type, t.code, t.status, o.reference as order_reference, t.issued_at, t.checked_in_at
     from tickets t join users u on u.id = t.user_id join ticket_types tt on tt.id = t.ticket_type_id join orders o on o.id = t.order_id
     where t.event_id = $1 order by t.attendee_name`,
    [eventId],
  )
  const header = ['Attendee', 'Email', 'Phone', 'Ticket type', 'Code', 'Status', 'Order', 'Issued at', 'Checked in at']
  const lines = rows.map((row) => [row.attendee_name, row.email, row.phone, row.ticket_type, formatTicketCode(String(row.code)), row.status, row.order_reference, row.issued_at, row.checked_in_at].map(csv).join(','))
  const filename = `${event.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-attendees.csv`
  return new Response([header.map(csv).join(','), ...lines].join('\r\n'), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${filename}"`, 'cache-control': 'no-store' },
  })
}
