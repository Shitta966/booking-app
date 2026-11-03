import Link from 'next/link'
import { updateOrgSettings } from '@/app/actions/org'
import { Badge, Flash, PageHeader } from '@/components/ui'
import { requireOrgAccess } from '@/lib/auth'
import { queryOne } from '@/lib/db'
import { formatDate, formatMoney } from '@/lib/format'

export default async function OrgSettingsPage({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<Record<string, string>> }) {
  const { orgId } = await params
  const { org } = await requireOrgAccess(orgId, 'org.settings')
  const plan = await queryOne<{ name: string; price_minor: number; billing_period: string; ticket_fee_percent: number; max_events: number | null; max_tickets_per_event: number | null; max_team_members: number | null }>(
    'select * from plans where id = $1', [org.plan_id],
  )

  return (
    <>
      <PageHeader eyebrow="Settings" title="Organisation settings" />
      <Flash searchParams={await searchParams} />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <form action={updateOrgSettings} className="card grid gap-4 p-6 md:grid-cols-2">
          <input type="hidden" name="org_id" value={org.id} />
          <h3 className="font-semibold md:col-span-2">Profile</h3>
          <label className="field md:col-span-2">Name<input name="name" required defaultValue={org.name} className="input" /></label>
          <label className="field md:col-span-2">About<textarea name="description" rows={3} defaultValue={org.description} className="input" /></label>
          <label className="field">Contact email<input name="contact_email" type="email" defaultValue={org.contact_email ?? ''} className="input" /></label>
          <label className="field">Contact phone<input name="contact_phone" defaultValue={org.contact_phone ?? ''} className="input" /></label>
          <h3 className="mt-2 font-semibold md:col-span-2">Bank transfer details for paid tickets</h3>
          <p className="-mt-2 text-xs text-slate-500 md:col-span-2">Shown only to attendees with an unpaid order for your events.</p>
          <label className="field">Bank<input name="bank_name" defaultValue={org.bank_name ?? ''} className="input" /></label>
          <label className="field">Account name<input name="account_name" defaultValue={org.account_name ?? ''} className="input" /></label>
          <label className="field">Account number (NUBAN)<input name="account_number" inputMode="numeric" pattern="\d{10}" defaultValue={org.account_number ?? ''} className="input font-mono" /></label>
          <label className="field">Extra payment instructions<input name="payment_instructions" defaultValue={org.payment_instructions ?? ''} className="input" /></label>
          <div className="md:col-span-2"><button className="btn-primary">Save settings</button></div>
        </form>
        <div className="card self-start p-5 text-sm">
          <div className="flex items-center justify-between"><h3 className="font-semibold">Subscription</h3><Badge status={org.status} /></div>
          <p className="mt-3 text-2xl font-bold">{plan?.name}</p>
          <p className="text-slate-500">{plan?.price_minor ? `${formatMoney(plan.price_minor)} / ${plan.billing_period}` : 'Free'} · {plan?.ticket_fee_percent}% fee on paid tickets</p>
          <ul className="mt-4 space-y-1 text-slate-600">
            <li>Active events: {plan?.max_events ?? 'unlimited'}</li>
            <li>Tickets per event: {plan?.max_tickets_per_event?.toLocaleString() ?? 'unlimited'}</li>
            <li>Team members: {plan?.max_team_members ?? 'unlimited'}</li>
          </ul>
          {org.subscription_ends_at && <p className="mt-3 text-xs text-slate-500">Renews / ends {formatDate(org.subscription_ends_at)}</p>}
          <p className="mt-4 text-xs text-slate-500">To change plan, contact the FUTICK team. Online plan billing is on the roadmap.</p>
          <Link href="/pricing" className="btn-secondary btn-sm mt-3">Compare plans</Link>
        </div>
      </div>
    </>
  )
}
