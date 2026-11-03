import Link from 'next/link'
import { Search } from 'lucide-react'
import clsx from 'clsx'
import { EventCard } from '@/components/EventCard'
import { CAMPUSES, EVENT_CATEGORIES, listPublicEvents } from '@/lib/events'

export const metadata = { title: 'Events' }

export default async function EventsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { q = '', category = '', campus = '', when = '', date = '' } = await searchParams
  const events = await listPublicEvents({
    q: q.trim().slice(0, 80) || undefined, category: category || undefined, campus: CAMPUSES.includes(campus) ? campus : undefined,
    free: when === 'free', thisWeek: when === 'week', date: date || undefined,
  })

  return (
    <main className="mx-auto max-w-6xl px-5 py-12">
      <div className="text-center">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-moss-400">Around FUT Minna</p>
        <h1 className="mt-3 text-4xl font-medium tracking-tight text-moss-950 md:text-5xl">Find your next event</h1>
        <p className="mt-3 text-sm text-moss-800/70">Conferences, career fairs, seminars and corporate programmes.</p>
      </div>
      <form className="mx-auto mt-8 flex max-w-2xl items-center gap-2 rounded-full bg-white p-1.5 shadow-[0_8px_30px_rgba(31,38,18,0.06)]" action="/events">
        <Search size={18} className="ml-4 shrink-0 text-moss-400" />
        <input name="q" defaultValue={q} placeholder="Search by event, venue or organiser" className="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-sm text-moss-950 outline-none placeholder:text-moss-800/40" />
        {category && <input type="hidden" name="category" value={category} />}
        <button className="rounded-full bg-moss-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-moss-800">Search</button>
      </form>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {['', ...EVENT_CATEGORIES].map((item) => (
          <Link
            key={item || 'all'}
            href={{ pathname: '/events', query: { ...(q ? { q } : {}), ...(item ? { category: item } : {}) } }}
            className={clsx('rounded-full px-4 py-2 text-xs font-medium transition', item === category ? 'bg-moss-900 text-white' : 'bg-white text-moss-800 hover:bg-moss-100')}
          >
            {item || 'All'}
          </Link>
        ))}
      </div>
      <p className="mt-10 text-sm text-moss-800/60">{events.length} {events.length === 1 ? 'event' : 'events'}</p>
      <div className="mt-4 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">{events.map((event) => <EventCard key={event.id} event={event} />)}</div>
      {events.length === 0 && <p className="mt-6 rounded-3xl bg-white p-10 text-center text-sm text-moss-800/60">No events match. Try a different search or category.</p>}
    </main>
  )
}
