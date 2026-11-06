import Link from 'next/link'
import { Crown, Gift, TicketCheck, TrendingUp } from 'lucide-react'
import { redeemRewardsForPro, toggleEventRewards } from '@/app/actions/org'
import { CardTitle } from '@/components/charts'
import { ConfirmButton } from '@/components/Modal'
import { Badge, Flash, PageHeader } from '@/components/ui'
import { requireOrgAccess } from '@/lib/auth'
import { query } from '@/lib/db'
import { formatDate, formatDateTime, formatMoney } from '@/lib/format'
import { can } from '@/lib/permissions'
import { getSettings } from '@/lib/settings'

const naira = (value: number) => (value ? formatMoney(value) : '₦0')

export default async function OrgRewardsPage({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<Record<string, string>> }) {
  const { orgId } = await params
  const { org, role } = await requireOrgAccess(orgId)
  const { referrals } = await getSettings()
  const threshold = referrals.proThresholdMinor

  const [[totals], events, history] = await Promise.all([
    query<{ balance: number; lifetime: number; redeemed_tickets: number; months: number }>(
      `select coalesce((select sum(amount_minor) from org_reward_credits where org_id = $1 and redemption_id is null), 0) as balance,
              coalesce((select sum(amount_minor) from org_reward_credits where org_id = $1 and order_id is not null), 0) as lifetime,
              (select count(*) from org_reward_credits where org_id = $1 and order_id is not null) as redeemed_tickets,
              coalesce((select sum(months) from org_reward_redemptions where org_id = $1), 0) as months`,
      [org.id],
    ),
    query<{ id: string; title: string; start_time: Date; status: string; accepts_reward_coupons: boolean; reward_orders: number; min_price: number | null }>(
      `select e.id, e.title, e.start_time, e.status, e.accepts_reward_coupons,
              (select count(*) from orders where event_id = e.id and coupon_id is not null and status = 'paid') as reward_orders,
              (select min(price_minor) from ticket_types where event_id = e.id and is_active) as min_price
       from events e where e.org_id = $1 and e.end_time > now() and e.status in ('draft', 'published') order by e.start_time`,
      [org.id],
    ),
    query<{ kind: string; amount: number; created_at: Date; label: string }>(
      `select 'credit' as kind, c.amount_minor as amount, c.created_at, coalesce(e.title, c.note) as label
       from org_reward_credits c left join orders o on o.id = c.order_id left join events e on e.id = o.event_id where c.org_id = $1
       union all
       select 'redemption' as kind, r.credits_minor as amount, r.created_at, r.months || ' month(s) of Pro' as label
       from org_reward_redemptions r where r.org_id = $1
       order by created_at desc limit 20`,
      [org.id],
    ),
  ])
  const balance = Number(totals.balance)
  const share = Math.min(100, Math.round((balance / threshold) * 100))
  const ready = balance >= threshold
  const canRedeem = can(role, 'org.settings') && org.plan_id !== 'enterprise'
  const months = Math.floor(balance / threshold) * referrals.proMonthsPerRedemption
  const proActive = org.plan_id === 'pro' && org.subscription_ends_at && new Date(org.subscription_ends_at) > new Date()

  return (
    <>
      <PageHeader eyebrow="Refer & earn" title="Rewards"
        description="Attendees earn free tickets by inviting friends to FUTICK. When they use one at your event, FUTICK pays you back in Pro credit — seats filled by motivated people, at no cost to you." />
      <Flash searchParams={await searchParams} />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="relative overflow-hidden rounded-2xl bg-brand-600 p-7 text-white shadow-[0_10px_30px_rgba(43,63,217,0.3)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/70"><Crown size={14} className="text-gold-400" /> Pro credit</p>
              <p className="mt-2 text-4xl font-semibold">{naira(balance)}</p>
              <p className="mt-1 text-sm text-white/70">of {naira(threshold)} unlocks {referrals.proMonthsPerRedemption} month{referrals.proMonthsPerRedemption === 1 ? '' : 's'} of Pro</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3 text-right text-sm">
              <p className="text-white/60">Current plan</p>
              <p className="font-semibold capitalize">{org.plan_id}{org.plan_source === 'reward' ? ' (rewards)' : ''}</p>
              {proActive && <p className="text-xs text-white/60">until {formatDate(org.subscription_ends_at!)}</p>}
            </div>
          </div>
          <div className="mt-6 h-3 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-gold-400 transition-all" style={{ width: `${share}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-white/60"><span>{share}%</span><span>{ready ? 'Ready to redeem' : `${naira(threshold - balance)} to go`}</span></div>
          <form action={redeemRewardsForPro} className="mt-6">
            <input type="hidden" name="org_id" value={org.id} />
            {canRedeem ? (
              ready ? (
                <ConfirmButton className="btn bg-gold-400 text-brand-950 hover:bg-gold-500" tone="primary" title="Unlock FUTICK Pro?"
                  message={<>This spends {naira(Math.floor(balance / threshold) * threshold)} of reward credit on <b>{months} month{months === 1 ? '' : 's'} of Pro</b>{proActive ? ', added after your current Pro period' : ''}. Any remainder stays as credit.</>}
                  confirmLabel="Unlock Pro">
                  <Crown size={16} /> Redeem for {months} month{months === 1 ? '' : 's'} of Pro
                </ConfirmButton>
              ) : <button disabled className="btn bg-white/15 text-white/70">Keep accepting rewards to unlock Pro</button>
            ) : <p className="text-sm text-white/70">{org.plan_id === 'enterprise' ? 'Enterprise already includes everything in Pro.' : 'Only owners and admins can redeem credit.'}</p>}
          </form>
        </section>

        <div className="grid gap-6">
          <div className="card flex items-center gap-5 p-6">
            <TicketCheck size={34} strokeWidth={2.2} className="text-brand-600" />
            <div><p className="text-xs text-slate-400">Reward tickets at your events</p><p className="text-2xl font-semibold text-slate-900">{totals.redeemed_tickets}</p></div>
          </div>
          <div className="card flex items-center gap-5 p-6">
            <TrendingUp size={34} strokeWidth={2.2} className="text-brand-600" />
            <div><p className="text-xs text-slate-400">Value covered by FUTICK</p><p className="text-2xl font-semibold text-slate-900">{naira(Number(totals.lifetime))}</p></div>
          </div>
          <div className="card flex items-center gap-5 p-6">
            <Crown size={34} strokeWidth={2.2} className="text-gold-500" />
            <div><p className="text-xs text-slate-400">Months of Pro earned</p><p className="text-2xl font-semibold text-slate-900">{totals.months}</p></div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="card overflow-x-auto">
          <div className="px-6 pt-6"><CardTitle>Accept rewards at your events</CardTitle></div>
          <table className="data-table">
            <thead><tr><th>Event</th><th>Date</th><th>Reward orders</th><th>Rewards</th></tr></thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td data-label="Event"><Link href={`/dashboard/${org.id}/events/${event.id}`} className="font-medium text-slate-800 hover:text-brand-700">{event.title}</Link>{event.status === 'draft' && <span className="ml-2"><Badge status="draft" /></span>}</td>
                  <td data-label="Date">{formatDateTime(event.start_time)}</td>
                  <td data-label="Reward orders">{event.reward_orders}</td>
                  <td data-label="Rewards">
                    {event.min_price === 0 || event.min_price === null ? <span className="text-xs text-slate-400">Free event</span> : can(role, 'events.manage') ? (
                      <form action={toggleEventRewards}>
                        <input type="hidden" name="org_id" value={org.id} />
                        <input type="hidden" name="event_id" value={event.id} />
                        {!event.accepts_reward_coupons && <input type="hidden" name="accept" value="on" />}
                        <button className={event.accepts_reward_coupons ? 'btn-sm btn bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'btn-secondary btn-sm'}>
                          <Gift size={13} />{event.accepts_reward_coupons ? 'Accepting · switch off' : 'Off · switch on'}
                        </button>
                      </form>
                    ) : <Badge status={event.accepts_reward_coupons ? 'active' : 'draft'} label={event.accepts_reward_coupons ? 'accepting' : 'off'} />}
                  </td>
                </tr>
              ))}
              {events.length === 0 && <tr><td colSpan={4} className="py-10 text-center text-slate-400">No upcoming events.</td></tr>}
            </tbody>
          </table>
        </section>

        <section className="card p-6">
          <CardTitle>Credit history</CardTitle>
          <ul className="divide-y divide-slate-100">
            {history.map((row, index) => (
              <li key={index} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-800">{row.kind === 'credit' ? row.label : `Redeemed for ${row.label}`}</span>
                  <span className="text-xs text-slate-400">{formatDateTime(row.created_at)}</span>
                </span>
                <span className={row.kind === 'credit' ? 'font-semibold text-emerald-600' : 'font-semibold text-slate-500'}>{row.kind === 'credit' ? '+' : '−'}{naira(Number(row.amount))}</span>
              </li>
            ))}
            {history.length === 0 && <li className="py-8 text-center text-sm text-slate-400">Credit appears here when attendees use reward tickets at your events.</li>}
          </ul>
        </section>
      </div>
    </>
  )
}
