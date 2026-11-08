import Link from 'next/link'
import { ArrowRight, Building2, Crown, Gift, Ticket, UserPlus, Users } from 'lucide-react'
import { EventCard } from '@/components/EventCard'
import { ShareInvite } from '@/components/ShareInvite'
import { getCurrentUser } from '@/lib/auth'
import { query } from '@/lib/db'
import { listPublicEvents } from '@/lib/events'
import { formatDate, formatMoney } from '@/lib/format'
import { ensureReferralCode, shortName } from '@/lib/rewards'
import { getSettings } from '@/lib/settings'
import { siteUrl } from '@/lib/siteUrl'

export const metadata = { title: 'Refer & earn' }

/** Gold progress ring for "N of 5 friends". */
function ProgressRing({ value, total }: { value: number; total: number }) {
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const share = total ? Math.min(1, value / total) : 0
  return (
    <div className="relative size-40 shrink-0">
      <svg viewBox="0 0 128 128" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="64" cy="64" r={radius} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="12" />
        <circle cx="64" cy="64" r={radius} fill="none" stroke="#ffc93c" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${share * circumference} ${circumference}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
        <span className="text-4xl font-semibold">{value}<span className="text-xl text-white/50">/{total}</span></span>
        <span className="text-[11px] uppercase tracking-widest text-white/60">friends</span>
      </div>
    </div>
  )
}

const STEPS = [
  { icon: UserPlus, title: 'Share your link', body: 'Send it to classmates, colleagues and your group chats.' },
  { icon: Ticket, title: 'Friends book a ticket', body: 'A friend counts once they sign up with your link and book their first ticket — free or paid.' },
  { icon: Gift, title: 'You get a ticket free', body: 'Every five friends earns a reward that covers a ticket at events that accept FUTICK rewards.' },
]

export default async function RewardsPage() {
  const [user, { referrals }] = await Promise.all([getCurrentUser(), getSettings()])
  const step = Math.max(1, referrals.friendsPerReward)
  const cap = formatMoney(referrals.couponCapMinor)
  const rewardEvents = await listPublicEvents({ rewardsOnly: true, limit: 3 })

  if (!referrals.enabled) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-20 text-center">
        <h1 className="text-3xl font-medium tracking-tight text-moss-950">Refer & earn is taking a short break</h1>
        <p className="mt-3 text-moss-800/70">Rewards you have already earned still work. Check back soon.</p>
      </main>
    )
  }

  const leaderboard = await query<{ full_name: string; friends: number }>(
    `select r.full_name, count(*) as friends from users f join users r on r.id = f.referred_by
     where f.referral_qualified_at >= date_trunc('month', now()) group by r.id, r.full_name order by friends desc, min(f.referral_qualified_at) limit 5`,
  )

  if (!user) {
    return (
      <main>
        <section className="mx-auto max-w-5xl px-5 pb-6 pt-12 text-center">
          <p className="inline-flex items-center gap-2 rounded-full bg-gold-400/25 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-moss-900"><Gift size={14} /> Refer & earn</p>
          <h1 className="mx-auto mt-5 max-w-3xl text-balance text-5xl font-medium leading-[1.05] tracking-[-0.035em] text-moss-950 md:text-6xl">Bring {step} friends. Your next ticket is on us.</h1>
          <p className="mx-auto mt-5 max-w-xl text-moss-800/75">Every {step} friends who join FUTICK with your link and book a ticket earns you a free ticket worth up to {cap} — at conferences, career fairs, dinners and more around FUT Minna.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/signup?next=/rewards" className="rounded-full bg-moss-900 px-7 py-3.5 text-sm font-medium text-white hover:bg-moss-800">Get my invite link</Link>
            <Link href="/login?next=/rewards" className="rounded-full border border-moss-200 bg-white px-7 py-3.5 text-sm font-medium text-moss-900">I have an account</Link>
          </div>
        </section>
        <HowItWorks />
        <RewardEvents events={rewardEvents} />
      </main>
    )
  }

  const code = await ensureReferralCode(user.id)
  const url = `${await siteUrl()}/signup?ref=${code}`
  const [[stats], friends, coupons] = await Promise.all([
    query<{ joined: number; qualified: number; earned: number }>(
      `select (select count(*) from users where referred_by = $1) as joined,
              (select count(*) from users where referred_by = $1 and referral_qualified_at is not null) as qualified,
              (select count(*) from reward_coupons where user_id = $1) as earned`,
      [user.id],
    ),
    query<{ full_name: string; created_at: Date; referral_qualified_at: Date | null }>(
      'select full_name, created_at, referral_qualified_at from users where referred_by = $1 order by created_at desc limit 50',
      [user.id],
    ),
    query<{ code: string; value_cap_minor: number; status: string; expires_at: Date; used_at: Date | null; event_title: string | null }>(
      `select c.code, c.value_cap_minor, c.status, c.expires_at, c.used_at, e.title as event_title
       from reward_coupons c left join orders o on o.id = c.order_id left join events e on e.id = o.event_id
       where c.user_id = $1 order by (c.status = 'available' and c.expires_at > now()) desc, c.created_at desc`,
      [user.id],
    ),
  ])
  const progress = stats.qualified % step
  const toGo = step - progress
  const firstName = (user.full_name || 'there').split(' ')[0]
  const message = `I use FUTICK for events at FUT Minna. Join with my link, book a ticket, and we both get closer to free tickets:`

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <section className="relative overflow-hidden rounded-[2.5rem] bg-moss-950 p-7 text-white md:p-12">
        <div className="relative grid items-center gap-10 md:grid-cols-[1fr_auto]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-gold-400 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-moss-950"><Gift size={13} /> Refer & earn</p>
            <h1 className="mt-5 text-balance text-4xl font-medium leading-[1.08] tracking-[-0.03em] md:text-5xl">
              {progress === 0 && stats.qualified > 0 ? `Nice work, ${firstName}. Start your next ${step}.` : `${firstName}, you’re ${toGo} friend${toGo === 1 ? '' : 's'} from a free ticket.`}
            </h1>
            <p className="mt-4 max-w-lg text-white/70">Every {step} friends who join with your link and book a ticket earns you a ticket worth up to {cap}. No limit on how many sets you complete{referrals.maxRewardsPerMonth ? ` (up to ${referrals.maxRewardsPerMonth} rewards a month)` : ''}.</p>
            <div className="mt-7 grid max-w-md grid-cols-3 gap-3">
              {[['Joined', stats.joined], ['Booked', stats.qualified], ['Tickets earned', stats.earned]].map(([label, value]) => (
                <div key={label as string} className="rounded-2xl bg-white/[0.06] p-4">
                  <p className="text-2xl font-semibold">{value}</p>
                  <p className="text-[11px] text-white/60">{label}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-center gap-3">
            <ProgressRing value={progress} total={step} />
            <p className="text-xs text-white/60">towards your next free ticket</p>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_8px_30px_rgba(31,38,18,0.05)] md:p-8">
          <h2 className="text-xl font-medium tracking-tight text-moss-950">Your invite link</h2>
          <p className="mt-1 mb-5 text-sm text-moss-800/70">Friends who open it get a welcome from you when they sign up.</p>
          <ShareInvite url={url} code={code} message={message} />
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_8px_30px_rgba(31,38,18,0.05)] md:p-8">
          <h2 className="flex items-center gap-2 text-xl font-medium tracking-tight text-moss-950"><Crown size={19} className="text-gold-500" /> Top inviters this month</h2>
          <ol className="mt-4 space-y-2">
            {leaderboard.map((row, index) => (
              <li key={`${row.full_name}-${index}`} className="flex items-center gap-3 rounded-2xl bg-moss-50 px-4 py-2.5 text-sm">
                <span className={`grid size-7 place-items-center rounded-full text-xs font-bold ${index === 0 ? 'bg-gold-400 text-moss-950' : 'bg-white text-moss-800'}`}>{index + 1}</span>
                <span className="flex-1 font-medium text-moss-950">{shortName(row.full_name)}</span>
                <span className="text-moss-800/70">{row.friends} friend{row.friends === 1 ? '' : 's'}</span>
              </li>
            ))}
            {leaderboard.length === 0 && <li className="rounded-2xl bg-moss-50 px-4 py-6 text-center text-sm text-moss-800/70">Nobody yet this month — the top spot is yours to take.</li>}
          </ol>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-xl font-medium tracking-tight text-moss-950">Your free tickets</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {coupons.map((coupon) => {
            const expired = coupon.status === 'available' && new Date(coupon.expires_at) <= new Date()
            const usable = coupon.status === 'available' && !expired
            return (
              <div key={coupon.code} className={`flex overflow-hidden rounded-3xl shadow-[0_8px_30px_rgba(31,38,18,0.06)] ${usable ? 'bg-gold-400' : 'bg-moss-100 opacity-70'}`}>
                <div className="flex-1 p-5">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-moss-900/70">Free ticket</p>
                  <p className="mt-1 font-mono text-lg font-bold tracking-wider text-moss-950">{coupon.code}</p>
                  <p className="mt-1 text-xs text-moss-900/80">Covers one ticket up to {formatMoney(Number(coupon.value_cap_minor))}</p>
                </div>
                <div className="flex w-32 flex-col justify-center border-l-2 border-dashed border-moss-950/20 p-4 text-right text-xs text-moss-900">
                  {usable && <>Use by<br /><b>{formatDate(coupon.expires_at)}</b></>}
                  {coupon.status === 'reserved' && <>Held for<br /><b>{coupon.event_title ?? 'an order'}</b></>}
                  {coupon.status === 'used' && <>Used at<br /><b>{coupon.event_title ?? 'an event'}</b></>}
                  {(expired || coupon.status === 'revoked') && <b>{expired ? 'Expired' : 'Revoked'}</b>}
                </div>
              </div>
            )
          })}
          {coupons.length === 0 && (
            <div className="rounded-3xl border-2 border-dashed border-moss-200 p-6 text-sm text-moss-800/70 md:col-span-2 lg:col-span-3">
              Your rewards will appear here. {toGo} more friend{toGo === 1 ? '' : 's'} to go — share your link above.
            </div>
          )}
        </div>
        {coupons.some((coupon) => coupon.status === 'available') && (
          <p className="mt-3 text-sm text-moss-800/70">To use one, open an event with the <span className="rounded-full bg-gold-400 px-2 py-0.5 text-xs font-semibold text-moss-950">Rewards</span> badge and pick your reward at checkout.</p>
        )}
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_8px_30px_rgba(31,38,18,0.05)]">
          <h2 className="flex items-center gap-2 text-xl font-medium tracking-tight text-moss-950"><Users size={19} /> Your friends</h2>
          <ul className="mt-4 divide-y divide-moss-100">
            {friends.map((friend, index) => (
              <li key={index} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="font-medium text-moss-950">{shortName(friend.full_name)}</span>
                {friend.referral_qualified_at
                  ? <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Booked ✓</span>
                  : <span className="rounded-full bg-moss-100 px-2.5 py-0.5 text-xs text-moss-800">Joined — waiting for first booking</span>}
              </li>
            ))}
            {friends.length === 0 && <li className="py-6 text-center text-sm text-moss-800/60">No one yet. Your first friend is one message away.</li>}
          </ul>
        </div>
        <HowItWorks compact />
      </section>

      <RewardEvents events={rewardEvents} />

      <section className="mt-12 flex flex-col items-start justify-between gap-5 rounded-[2rem] bg-moss-100 p-7 md:flex-row md:items-center md:p-10">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-moss-700"><Building2 size={14} /> For organisers</p>
          <h2 className="mt-2 text-2xl font-medium tracking-tight text-moss-950">Run events? Rewards pay you back in Pro.</h2>
          <p className="mt-1 max-w-xl text-sm text-moss-800/75">Every reward ticket used at your event adds its value to your Pro credit. Each {formatMoney(referrals.proThresholdMinor)} of credit unlocks {referrals.proMonthsPerRedemption} month{referrals.proMonthsPerRedemption === 1 ? '' : 's'} of FUTICK Pro.</p>
        </div>
        <Link href="/pricing" className="inline-flex shrink-0 items-center gap-2 rounded-full bg-moss-900 px-6 py-3 text-sm font-medium text-white">See Pro <ArrowRight size={15} /></Link>
      </section>
    </main>
  )
}

function HowItWorks({ compact = false }: { compact?: boolean }) {
  return (
    <section className={compact ? 'rounded-[2rem] bg-white p-6 shadow-[0_8px_30px_rgba(31,38,18,0.05)]' : 'mx-auto max-w-5xl px-5 py-10'}>
      {compact && <h2 className="text-xl font-medium tracking-tight text-moss-950">How it works</h2>}
      <ol className={`grid gap-4 ${compact ? 'mt-4' : 'md:grid-cols-3'}`}>
        {STEPS.map((item, index) => (
          <li key={item.title} className={`flex gap-4 ${compact ? '' : 'flex-col rounded-3xl bg-white p-6 shadow-[0_8px_30px_rgba(31,38,18,0.05)]'}`}>
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gold-400 text-moss-950"><item.icon size={20} /></span>
            <span>
              <span className="block text-xs font-semibold text-moss-400">Step {index + 1}</span>
              <span className="block font-medium text-moss-950">{item.title}</span>
              <span className="mt-0.5 block text-sm text-moss-800/70">{item.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function RewardEvents({ events }: { events: Awaited<ReturnType<typeof listPublicEvents>> }) {
  if (!events.length) return null
  return (
    <section className="mx-auto mt-12 max-w-6xl">
      <div className="mb-5 flex items-end justify-between px-5 md:px-0">
        <h2 className="text-2xl font-medium tracking-tight text-moss-950">Where your rewards work</h2>
        <Link href="/events" className="text-sm font-medium text-moss-800 hover:underline">All events →</Link>
      </div>
      <div className="grid gap-6 px-5 sm:grid-cols-2 md:px-0 lg:grid-cols-3">{events.map((event) => <EventCard key={event.id} event={event} />)}</div>
    </section>
  )
}
