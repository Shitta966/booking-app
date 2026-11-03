import Link from 'next/link'
import { notFound } from 'next/navigation'
import { TicketQR } from '@/components/TicketQR'
import { Badge } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { queryOne } from '@/lib/db'
import { formatDate, formatDateTime, formatTime } from '@/lib/format'
import { getSecret } from '@/lib/secrets'
import { createTicketPayload, formatTicketCode } from '@/lib/tickets'

export const metadata = { title: 'Ticket' }

type TicketDetail = {
  id: string; code: string; status: string; attendee_name: string; checked_in_at: Date | null; ticket_type: string
  title: string; venue: string; start_time: Date; end_time: Date; event_status: string; org_name: string; reference: string
}

export default async function TicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params
  const user = await requireUser(`/tickets/${ticketId}`)
  if (!/^[0-9a-f-]{36}$/i.test(ticketId)) notFound()
  const ticket = await queryOne<TicketDetail>(
    `select t.id, t.code, t.status, t.attendee_name, t.checked_in_at, tt.name as ticket_type, e.title, e.venue, e.start_time, e.end_time,
            e.status as event_status, org.name as org_name, o.reference
     from tickets t join ticket_types tt on tt.id = t.ticket_type_id join events e on e.id = t.event_id
     join organizations org on org.id = e.org_id join orders o on o.id = t.order_id
     where t.id = $1 and t.user_id = $2`,
    [ticketId, user.id],
  )
  if (!ticket) notFound()
  const payload = createTicketPayload(ticket.id, getSecret('TICKET_SIGNING_SECRET'))

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <Link href="/tickets" className="text-sm text-slate-500 hover:text-brand-600">← My tickets</Link>
      <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-200">
        <div className="bg-brand-900 p-5 text-white">
          <p className="text-xs font-semibold uppercase tracking-widest text-gold-400">{ticket.org_name}</p>
          <h1 className="mt-1 text-xl font-bold">{ticket.title}</h1>
          <p className="mt-1 text-sm text-white/75">{formatDate(ticket.start_time)} · {formatTime(ticket.start_time)} – {formatTime(ticket.end_time)}</p>
          <p className="text-sm text-white/75">{ticket.venue}</p>
        </div>
        <div className="flex flex-col items-center gap-3 border-b border-dashed border-slate-300 p-6">
          {ticket.status === 'valid' && ticket.event_status !== 'cancelled' ? (
            <TicketQR payload={payload} />
          ) : (
            <p className="py-10 text-center text-sm text-slate-500">
              {ticket.status === 'checked_in' ? `Checked in ${ticket.checked_in_at ? formatDateTime(ticket.checked_in_at) : ''}` : 'This ticket is no longer valid.'}
            </p>
          )}
          <p className="font-mono text-2xl font-bold tracking-[0.3em]">{formatTicketCode(ticket.code)}</p>
          <Badge status={ticket.event_status === 'cancelled' ? 'cancelled' : ticket.status} label={ticket.event_status === 'cancelled' ? 'Event cancelled' : undefined} />
        </div>
        <dl className="grid grid-cols-2 gap-3 p-5 text-sm">
          <div><dt className="text-xs text-slate-500">Name</dt><dd className="font-medium">{ticket.attendee_name}</dd></div>
          <div><dt className="text-xs text-slate-500">Ticket</dt><dd className="font-medium">{ticket.ticket_type}</dd></div>
          <div><dt className="text-xs text-slate-500">Order</dt><dd className="font-mono font-medium">{ticket.reference}</dd></div>
          <div><dt className="text-xs text-slate-500">Holder</dt><dd className="truncate font-medium">{user.email}</dd></div>
        </dl>
      </div>
      <p className="mt-4 text-center text-xs text-slate-500">Turn your screen brightness up at the gate. Do not share screenshots — the first scan wins.</p>
    </main>
  )
}
