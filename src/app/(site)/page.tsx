import Link from 'next/link'
import {
  ArrowRight, BriefcaseBusiness, ClipboardList, CreditCard, GraduationCap, Hammer, Mic,
  Presentation, QrCode, ScanLine, Ticket, Trophy, Users, UtensilsCrossed, type LucideIcon,
} from 'lucide-react'
import { EventCard } from '@/components/EventCard'
import { query } from '@/lib/db'
import { CAMPUSES, EVENT_CATEGORIES, listPublicEvents } from '@/lib/events'
import { getSettings } from '@/lib/settings'

const HERO_IMAGE = 'https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=2400&q=80'
const BAND_IMAGE = 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=2400&q=80'

const CATEGORY_ICONS: Array<[string, LucideIcon]> = [
  ['Conference', Mic],
  ['Career Fair', BriefcaseBusiness],
  ['Seminar', Presentation],
  ['Convocation', GraduationCap],
  ['Workshop', Hammer],
  ['Corporate Dinner', UtensilsCrossed],
  ['Sports', Trophy],
]

export default async function HomePage() {
  const [{ homepage, branding }, upcoming, [stats]] = await Promise.all([
    getSettings(),
    listPublicEvents({ limit: 3 }),
    query<{ events: number; tickets: number; orgs: number }>(
      `select (select count(*) from events where status in ('published', 'completed')) as events,
              (select count(*) from tickets where status <> 'cancelled') as tickets,
              (select count(*) from organizations where status = 'active') as orgs`,
    ),
  ])

  return (
    <main>
      {/* Hero: green valley under a cream sky, overlapping the header like the reference design. */}
      <section className="relative isolate -mt-[76px] overflow-hidden pb-10 pt-[76px]">
        <div className="absolute inset-0 -z-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={HERO_IMAGE} alt="" className="size-full object-cover object-bottom" />
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,#f5f5ef_0%,rgba(245,245,239,0.92)_22%,rgba(245,245,239,0.35)_46%,rgba(245,245,239,0)_62%)]" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-moss-50 to-transparent" />
        </div>

        <div className="mx-auto max-w-3xl px-5 pt-14 text-center md:pt-16">
          <h1 className="text-[2.6rem] font-medium leading-[1.08] tracking-[-0.035em] text-balance text-moss-950 md:text-[4.25rem]">{homepage.heroTitle}</h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-moss-800/75">{homepage.heroSubtitle}</p>
          <Link href="/events" className="mt-8 inline-flex items-center gap-2 rounded-full bg-moss-900 px-7 py-3.5 text-sm font-medium text-white shadow-[0_10px_30px_rgba(20,26,11,0.25)] hover:bg-moss-800">
            Find tickets now
          </Link>
        </div>

        <div className="mx-auto mt-16 flex max-w-3xl items-center justify-center gap-3 px-5 md:mt-24 md:gap-5">
          {CATEGORY_ICONS.map(([category, Icon], index) => {
            const center = index === 3
            return (
              <Link key={category} href={`/events?category=${encodeURIComponent(category)}`} title={category}
                className={center
                  ? 'grid size-16 shrink-0 place-items-center rounded-full bg-white text-moss-900 shadow-[0_10px_30px_rgba(20,26,11,0.25)] md:size-20'
                  : 'hidden size-12 shrink-0 place-items-center rounded-full border border-white/50 bg-white/25 text-white backdrop-blur-md transition hover:bg-white/40 sm:grid md:size-14'}>
                <Icon size={center ? 28 : 20} strokeWidth={1.8} />
                <span className="sr-only">{category}</span>
              </Link>
            )
          })}
        </div>

        <form action="/events" className="mx-auto mt-8 max-w-4xl rounded-[2rem] border border-white/20 bg-moss-950/45 p-5 text-white shadow-2xl backdrop-blur-xl md:p-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-lg font-medium">Event tickets</p>
              <p className="text-xs text-white/60">Conferences, fairs, dinners and convocations around campus</p>
            </div>
            <div className="flex rounded-full bg-white/10 p-1 text-xs font-medium">
              {[['all', 'All events'], ['free', 'Free'], ['week', 'This week']].map(([value, label], index) => (
                <label key={value} className="cursor-pointer rounded-full px-4 py-2 text-white/70 has-[:checked]:bg-white has-[:checked]:text-moss-950">
                  <input type="radio" name="when" value={value} defaultChecked={index === 0} className="sr-only" />{label}
                </label>
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-4 rounded-3xl bg-white/[0.08] p-5 md:grid-cols-[1fr_auto_1fr] md:items-center">
            <label className="block">
              <span className="text-[11px] uppercase tracking-widest text-white/50">What</span>
              <input name="q" placeholder="Career fair" className="mt-1 w-full bg-transparent text-3xl font-medium tracking-tight text-white outline-none placeholder:text-white/90 md:text-4xl" />
              <span className="mt-1 block text-xs text-white/50">Event, organiser or topic</span>
            </label>
            <span className="hidden size-11 place-items-center rounded-full border border-white/25 text-white/80 md:grid"><ArrowRight size={18} /></span>
            <label className="block md:text-right">
              <span className="text-[11px] uppercase tracking-widest text-white/50">Where</span>
              <select name="campus" defaultValue="" className="mt-1 w-full appearance-none bg-transparent text-3xl font-medium tracking-tight text-white outline-none md:text-right md:text-4xl [&>option]:text-moss-950">
                <option value="">Any campus</option>
                {CAMPUSES.map((campus) => <option key={campus} value={campus}>{campus}</option>)}
              </select>
              <span className="mt-1 block text-xs text-white/50">Gidan Kwano or Bosso</span>
            </label>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="rounded-2xl bg-white/[0.08] px-4 py-3">
              <span className="block text-[11px] uppercase tracking-widest text-white/50">Category</span>
              <select name="category" defaultValue="" className="mt-0.5 w-full bg-transparent text-sm text-white outline-none [&>option]:text-moss-950">
                <option value="">Any category</option>
                {EVENT_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
              </select>
            </label>
            <label className="rounded-2xl bg-white/[0.08] px-4 py-3">
              <span className="block text-[11px] uppercase tracking-widest text-white/50">From date</span>
              <input type="date" name="date" className="mt-0.5 w-full bg-transparent text-sm text-white outline-none [color-scheme:dark]" />
            </label>
            <button className="rounded-2xl bg-moss-100 px-4 py-3 text-sm font-semibold text-moss-950 transition hover:bg-white">Search events</button>
          </div>
        </form>
      </section>

      <section className="mx-auto mt-10 grid max-w-6xl gap-4 px-5 md:grid-cols-3">
        {[
          ['01', stats.events.toLocaleString(), 'Events hosted', 'Conferences, career fairs, dinners and ceremonies run on FUTICK.'],
          ['02', stats.tickets.toLocaleString(), 'Tickets issued', 'Every one carries a signed QR code that can be admitted only once.'],
          ['03', stats.orgs.toLocaleString(), 'Verified organisers', 'Faculties, departments and partner companies checked by our team.'],
        ].map(([index, value, label, body]) => (
          <div key={label} className="rounded-3xl bg-white p-6 shadow-[0_8px_30px_rgba(31,38,18,0.05)]">
            <p className="text-xs font-medium text-moss-400">{index}</p>
            <p className="mt-3 text-4xl font-medium tracking-tight text-moss-950">{value}</p>
            <p className="mt-1 text-sm font-medium text-moss-900">{label}</p>
            <p className="mt-2 text-xs leading-relaxed text-moss-800/60">{body}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto mt-24 max-w-6xl px-5">
        <div className="text-center">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-moss-400">Happening soon</p>
          <h2 className="mt-3 text-3xl font-medium tracking-tight text-moss-950 md:text-4xl">Upcoming on campus</h2>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {upcoming.map((event) => <EventCard key={event.id} event={event} />)}
        </div>
        {upcoming.length === 0 && <p className="mt-10 text-center text-sm text-moss-800/60">No events are published yet. Check back soon.</p>}
        <div className="mt-10 text-center"><Link href="/events" className="inline-flex items-center gap-2 rounded-full border border-moss-200 bg-white px-6 py-3 text-sm font-medium text-moss-900 hover:border-moss-400">See all events <ArrowRight size={15} /></Link></div>
      </section>

      <section className="relative mx-auto mt-28 max-w-5xl px-5 py-16 text-center">
        {([
          [Ticket, 'left-[6%] top-[8%]'], [QrCode, 'right-[8%] top-[4%]'], [ClipboardList, 'left-[16%] bottom-[10%]'],
          [ScanLine, 'right-[14%] bottom-[14%]'], [Users, 'left-[1%] top-[52%]'], [CreditCard, 'right-[2%] top-[48%]'],
        ] as Array<[LucideIcon, string]>).map(([Icon, position], index) => (
          <span key={index} className={`absolute hidden size-12 place-items-center rounded-full bg-white text-moss-600 shadow-[0_8px_24px_rgba(31,38,18,0.08)] md:grid ${position}`}><Icon size={20} strokeWidth={1.8} /></span>
        ))}
        <h2 className="mx-auto max-w-xl text-3xl font-medium leading-tight tracking-tight text-moss-950 md:text-5xl">One place for all your event and ticket needs.</h2>
        <p className="mx-auto mt-5 max-w-lg text-sm leading-relaxed text-moss-800/70">
          Organisers plan with a shared checklist, sell free and paid tickets, confirm payments and check guests in at the gate from any phone. Attendees keep every ticket in one place.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/signup?type=organizer" className="rounded-full bg-moss-900 px-6 py-3 text-sm font-medium text-white hover:bg-moss-800">Host an event</Link>
          <Link href="/pricing" className="rounded-full border border-moss-200 bg-white px-6 py-3 text-sm font-medium text-moss-900 hover:border-moss-400">See plans</Link>
        </div>
      </section>

      <section className="mx-auto mt-16 max-w-7xl px-5">
        <div className="relative h-72 overflow-hidden rounded-[2.5rem] md:h-[26rem]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BAND_IMAGE} alt="" className="size-full object-cover" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-moss-950/60 via-moss-950/10 to-transparent" />
          <div className="absolute bottom-8 left-8 right-8 flex flex-wrap items-end justify-between gap-4 text-white md:bottom-12 md:left-12 md:right-12">
            <p className="max-w-md text-2xl font-medium leading-snug tracking-tight md:text-3xl">Your next good event at {branding.appName === 'FUTICK' ? 'FUT Minna' : branding.appName} starts here.</p>
            <Link href="/signup" className="rounded-full bg-white px-6 py-3 text-sm font-medium text-moss-950 hover:bg-moss-100">Create a free account</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
