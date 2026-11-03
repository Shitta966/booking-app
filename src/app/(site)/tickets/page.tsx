import Link from 'next/link'
import { CalendarDays, MapPin, QrCode, Ticket } from 'lucide-react'
import { Badge, EmptyState, Flash } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { formatTicketCode } from '@/lib/tickets'
import { query } from '@/lib/db'
import { formatDateTime, formatMoney } from '@/lib/format'

export const metadata = { title: 'My tickets' }

type TicketRow = { id: string; code: string; status: string; attendee_name: string; ticket_type: string; event_id: string; title: string; venue: string; start_time: Date }
type OrderRow = { id: string; reference: string; status: string; total_minor: number; title: string; created_at: Date; expires_at: Date | null }

export default async function MyTicketsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser('/tickets')
  const [tickets, orders] = await Promise.all([
    query<TicketRow>(
      `select t.id, t.code, t.status, t.attendee_name, tt.name as ticket_type, e.id as event_id, e.title, e.venue, e.start_time
       from tickets t join ticket_types tt on tt.id = t.ticket_type_id join events e on e.id = t.event_id
       where t.user_id = $1 order by (e.end_time < now()), e.start_time`,
      [user.id],
    ),
    query<OrderRow>(
      `select o.id, o.reference, o.status, o.total_minor, e.title, o.created_at, o.expires_at
       from orders o join events e on e.id = o.event_id
       where o.user_id = $1 and o.status in ('pending_payment', 'awaiting_review') order by o.created_at desc`,
      [user.id],
    ),
  ])

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">My tickets</h1>
      <p className="mt-1 text-slate-500">Show the QR code at the entrance. Each ticket admits one person once.</p>
      <div className="mt-6"><Flash searchParams={await searchParams} /></div>

      {orders.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Awaiting payment</h2>
          <div className="grid gap-3">
            {orders.map((order) => (
              <Link key={order.id} href={`/orders/${order.id}`} className="card flex flex-wrap items-center justify-between gap-3 p-4 hover:ring-1 hover:ring-brand-500">
                <div><p className="font-semibold">{order.title}</p><p className="text-xs text-slate-500">Order {order.reference} · {formatMoney(order.total_minor)}</p></div>
                <Badge status={order.status} />
              </Link>
            ))}
          </div>
        </section>
      )}

      {tickets.length === 0 ? (
        <EmptyState icon={Ticket} title="No tickets yet" body="Tickets you book will appear here." action={<Link href="/events" className="btn-primary">Browse events</Link>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {tickets.map((ticket) => (
            <Link key={ticket.id} href={`/tickets/${ticket.id}`} className="card flex gap-4 p-4 hover:ring-1 hover:ring-brand-500">
              <span className="grid size-16 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><QrCode size={34} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2"><p className="font-semibold leading-snug">{ticket.title}</p><Badge status={ticket.status} /></div>
                <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><CalendarDays size={12} />{formatDateTime(ticket.start_time)}</p>
                <p className="flex items-center gap-1 text-xs text-slate-500"><MapPin size={12} />{ticket.venue}</p>
                <p className="mt-2 text-xs text-slate-600">{ticket.ticket_type} · {ticket.attendee_name} · <span className="font-mono">{formatTicketCode(ticket.code)}</span></p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
