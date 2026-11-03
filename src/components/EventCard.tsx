import Link from 'next/link'
import { ArrowUpRight, CalendarDays, MapPin } from 'lucide-react'
import type { PublicEvent } from '@/lib/events'
import { formatMoney, formatShortDate, formatTime } from '@/lib/format'

const FALLBACK_POSTER = 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=900&q=80'

export function EventCard({ event }: { event: PublicEvent }) {
  return (
    <Link href={`/events/${event.id}`} className="group block">
      <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-moss-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={event.poster_url ?? FALLBACK_POSTER} alt="" className="size-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
        <span className="absolute left-4 top-4 rounded-full bg-white/85 px-3 py-1 text-[11px] font-medium text-moss-900 backdrop-blur">{event.category}</span>
        <span className="absolute bottom-4 right-4 grid size-10 place-items-center rounded-full bg-white text-moss-900 opacity-0 transition group-hover:opacity-100"><ArrowUpRight size={18} /></span>
      </div>
      <p className="mt-4 flex items-center gap-1.5 text-xs text-moss-800/60"><CalendarDays size={13} />{formatShortDate(event.start_time)} · {formatTime(event.start_time)}</p>
      <h3 className="mt-1.5 text-lg font-medium leading-snug text-moss-950">{event.title}</h3>
      <p className="mt-1 flex items-center justify-between gap-3 text-xs text-moss-800/60">
        <span className="flex min-w-0 items-center gap-1.5"><MapPin size={13} className="shrink-0" /><span className="truncate">{event.venue}</span></span>
        <span className="shrink-0 font-medium text-moss-900">{event.min_price === null ? 'Tickets soon' : event.min_price === 0 ? 'Free' : `From ${formatMoney(event.min_price)}`}</span>
      </p>
      <p className="mt-1 text-[11px] text-moss-800/50">{event.org_name}</p>
    </Link>
  )
}
