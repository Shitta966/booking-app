import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Building2, CalendarDays, Clock3, Gift, MapPin } from 'lucide-react'
import { bookTickets } from '@/app/actions/attendee'
import { Flash } from '@/components/ui'
import { getCurrentUser } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'
import { formatDate, formatMoney, formatTime } from '@/lib/format'
import { getSettings } from '@/lib/settings'

type EventDetail = {
  id: string; title: string; summary: string; description: string; category: string; venue: string
  start_time: Date; end_time: Date; poster_url: string | null; status: string; org_name: string; org_status: string; org_description: string
  accepts_reward_coupons: boolean
}
type TicketOption = { id: string; name: string; description: string; price_minor: number; remaining: number; max_per_order: number; on_sale: boolean }

export default async function EventPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<Record<string, string>> }) {
  const { eventId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) notFound()
  const event = await queryOne<EventDetail>(
    `select e.*, o.name as org_name, o.status as org_status, o.description as org_description
     from events e join organizations o on o.id = e.org_id where e.id = $1`,
    [eventId],
  )
  // Draft events are only visible in the organiser dashboard. Unlisted events are reachable by link.
  if (!event || event.status === 'draft' || event.org_status === 'suspended') notFound()
  const [tickets, user] = await Promise.all([
    query<TicketOption>(
      `select id, name, description, price_minor, max_per_order,
              quantity_total - quantity_sold - quantity_reserved as remaining,
              (sales_end is null or sales_end > now()) as on_sale
       from ticket_types where event_id = $1 and is_active order by sort_order, price_minor`,
      [eventId],
    ),
    getCurrentUser(),
  ])
  const { referrals } = await getSettings()
  const rewardsAccepted = referrals.enabled && event.accepts_reward_coupons
  const hasPaidTickets = tickets.some((ticket) => ticket.price_minor > 0)
  const coupons = user && rewardsAccepted && hasPaidTickets
    ? await query<{ id: string; code: string; value_cap_minor: number; expires_at: Date }>(
      `select id, code, value_cap_minor, expires_at from reward_coupons
       where user_id = $1 and status = 'available' and expires_at > now() order by expires_at`,
      [user.id],
    )
    : []
  const bookable = event.status === 'published' && event.org_status === 'active' && new Date(event.end_time) > new Date()

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/events" className="text-sm text-slate-500 hover:text-brand-600">← All events</Link>
      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_380px]">
        <article>
          <div className="aspect-[16/8] overflow-hidden rounded-2xl bg-brand-900">
            {event.poster_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={event.poster_url} alt="" className="size-full object-cover" />
            )}
          </div>
          <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-brand-600">{event.category}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">{event.title}</h1>
          {rewardsAccepted && (
            <Link href="/rewards" className="mt-3 inline-flex items-center gap-2 rounded-full bg-gold-400/25 px-3 py-1.5 text-xs font-semibold text-moss-900 hover:bg-gold-400/40">
              <Gift size={14} /> Accepts FUTICK reward tickets
            </Link>
          )}
          {event.status === 'cancelled' && <p className="mt-3 rounded-lg bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700">This event has been cancelled.</p>}
          <div className="mt-5 grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
            <p className="flex items-center gap-2"><CalendarDays size={16} className="text-brand-600" />{formatDate(event.start_time)}</p>
            <p className="flex items-center gap-2"><Clock3 size={16} className="text-brand-600" />{formatTime(event.start_time)} – {formatTime(event.end_time)}</p>
            <p className="flex items-center gap-2"><MapPin size={16} className="text-brand-600" />{event.venue}</p>
          </div>
          <div className="mt-8 whitespace-pre-line leading-relaxed text-slate-700">{event.description || event.summary}</div>
          <div className="card mt-8 flex items-start gap-3 p-4">
            <span className="grid size-10 place-items-center rounded-lg bg-brand-50 text-brand-600"><Building2 size={18} /></span>
            <div><p className="text-xs uppercase tracking-wide text-slate-500">Hosted by</p><p className="font-semibold">{event.org_name}</p><p className="text-sm text-slate-500">{event.org_description}</p></div>
          </div>
        </article>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="card p-5">
            <h2 className="text-lg font-bold">Get tickets</h2>
            <Flash searchParams={await searchParams} />
            {tickets.length === 0 && <p className="mt-3 text-sm text-slate-500">Ticket types will be announced soon.</p>}
            <form action={bookTickets} className="mt-4 flex flex-col gap-3">
              <input type="hidden" name="event_id" value={event.id} />
              {tickets.map((ticket, index) => {
                const available = ticket.on_sale && ticket.remaining > 0
                return (
                  <label key={ticket.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                    <input type="radio" name="ticket_type_id" value={ticket.id} defaultChecked={index === 0 && available} disabled={!available} required className="mt-1 accent-brand-600" />
                    <span className="flex-1">
                      <span className="flex justify-between gap-2 font-semibold"><span>{ticket.name}</span><span>{formatMoney(ticket.price_minor)}</span></span>
                      {ticket.description && <span className="block text-xs text-slate-500">{ticket.description}</span>}
                      <span className="block text-xs text-slate-500">{!ticket.on_sale ? 'Sales closed' : ticket.remaining > 0 ? `${ticket.remaining} left · max ${ticket.max_per_order} per order` : 'Sold out'}</span>
                    </span>
                  </label>
                )
              })}
              {tickets.length > 0 && (
                <>
                  <label className="field">Quantity
                    <input type="number" name="quantity" min={1} max={50} defaultValue={1} className="input" />
                  </label>
                  {coupons.length > 0 && (
                    <fieldset className="rounded-2xl bg-gold-400/15 p-3">
                      <legend className="sr-only">Use a reward</legend>
                      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-moss-900"><Gift size={15} /> You have {coupons.length} free-ticket reward{coupons.length === 1 ? '' : 's'}</p>
                      <label className="flex items-center gap-2 py-1 text-sm"><input type="radio" name="coupon_id" value="" defaultChecked className="accent-brand-600" /> Don’t use a reward</label>
                      {coupons.map((coupon) => (
                        <label key={coupon.id} className="flex items-center gap-2 py-1 text-sm">
                          <input type="radio" name="coupon_id" value={coupon.id} className="accent-brand-600" />
                          <span><span className="font-mono font-semibold">{coupon.code}</span> <span className="text-xs text-moss-800/70">covers one ticket up to {formatMoney(Number(coupon.value_cap_minor))} · expires {formatDate(coupon.expires_at)}</span></span>
                        </label>
                      ))}
                    </fieldset>
                  )}
                  {user && rewardsAccepted && hasPaidTickets && coupons.length === 0 && (
                    <p className="text-xs text-moss-800/70"><Gift size={12} className="mr-1 inline" />Invite {referrals.friendsPerReward} friends and get a ticket like this free. <Link href="/rewards" className="font-semibold underline">Get your invite link</Link></p>
                  )}
                  {bookable ? (
                    user ? <button className="btn-primary w-full">Reserve tickets</button>
                      : <Link href={`/login?next=/events/${event.id}`} className="btn-primary w-full">Log in to book</Link>
                  ) : <button disabled className="btn-secondary w-full">Booking closed</button>}
                  <p className="text-xs text-slate-500">Free tickets are issued instantly. Paid tickets are held while you pay by bank transfer and are issued once the organiser confirms payment.</p>
                </>
              )}
            </form>
          </div>
        </aside>
      </div>
    </main>
  )
}
