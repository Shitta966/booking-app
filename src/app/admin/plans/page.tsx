import { savePlan } from '@/app/actions/admin'
import { Flash, PageHeader } from '@/components/ui'
import { query } from '@/lib/db'

type Plan = { id: string; name: string; description: string; price_minor: number; billing_period: string; max_events: number | null; max_tickets_per_event: number | null; max_team_members: number | null; ticket_fee_percent: number; features: string[]; is_active: boolean; sort_order: number; orgs: number }

function PlanForm({ plan }: { plan?: Plan }) {
  return (
    <form action={savePlan} className="card grid gap-3 p-5 md:grid-cols-4">
      <label className="field">Plan id<input name="id" required defaultValue={plan?.id} readOnly={Boolean(plan)} className="input read-only:bg-slate-50" placeholder="e.g. faculty" /></label>
      <label className="field">Name<input name="name" required defaultValue={plan?.name} className="input" /></label>
      <label className="field">Price (₦)<input name="price" inputMode="decimal" defaultValue={plan ? plan.price_minor / 100 : 0} className="input" /></label>
      <label className="field">Billed per
        <select name="billing_period" defaultValue={plan?.billing_period ?? 'month'} className="input"><option value="month">Month</option><option value="year">Year</option><option value="event">Event</option></select>
      </label>
      <label className="field">Max active events<input name="max_events" type="number" min={1} defaultValue={plan?.max_events ?? ''} placeholder="Unlimited" className="input" /></label>
      <label className="field">Max tickets / event<input name="max_tickets_per_event" type="number" min={1} defaultValue={plan?.max_tickets_per_event ?? ''} placeholder="Unlimited" className="input" /></label>
      <label className="field">Max team members<input name="max_team_members" type="number" min={1} defaultValue={plan?.max_team_members ?? ''} placeholder="Unlimited" className="input" /></label>
      <label className="field">Fee on paid tickets (%)<input name="ticket_fee_percent" inputMode="decimal" defaultValue={plan?.ticket_fee_percent ?? 0} className="input" /></label>
      <label className="field md:col-span-2">Description<input name="description" defaultValue={plan?.description} className="input" /></label>
      <label className="field md:col-span-2">Features (one per line)<textarea name="features" rows={3} defaultValue={plan?.features.join('\n')} className="input" /></label>
      <label className="field">Sort order<input name="sort_order" type="number" defaultValue={plan?.sort_order ?? 9} className="input" /></label>
      <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" name="is_active" defaultChecked={plan?.is_active ?? true} className="accent-brand-600" /> Shown on pricing page</label>
      <div className="flex items-end justify-between gap-2 md:col-span-2">
        {plan && <span className="text-xs text-slate-500">{plan.orgs} organisation{plan.orgs === 1 ? '' : 's'} on this plan</span>}
        <button className="btn-primary ml-auto">{plan ? 'Save plan' : 'Create plan'}</button>
      </div>
    </form>
  )
}

export default async function AdminPlans({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const plans = await query<Plan>('select p.*, (select count(*) from organizations where plan_id = p.id) as orgs from plans p order by sort_order, id')
  return (
    <>
      <PageHeader eyebrow="Monetisation" title="Plans & pricing" description="Limits are enforced when organisers create events, add ticket capacity and invite team members." />
      <Flash searchParams={await searchParams} />
      <div className="space-y-4">{plans.map((plan) => <PlanForm key={plan.id} plan={plan} />)}</div>
      <h2 className="mb-3 mt-8 font-semibold">New plan</h2>
      <PlanForm />
    </>
  )
}
