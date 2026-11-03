import Link from 'next/link'
import { Check } from 'lucide-react'
import { query } from '@/lib/db'
import { formatMoney } from '@/lib/format'

export const metadata = { title: 'Pricing for organisers' }

type Plan = { id: string; name: string; description: string; price_minor: number; billing_period: string; ticket_fee_percent: number; features: string[] }

export default async function PricingPage() {
  const plans = await query<Plan>('select * from plans where is_active order by sort_order')
  return (
    <main className="mx-auto max-w-6xl px-4 py-14">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">For organisers</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">Plans for every kind of event</h1>
        <p className="mt-3 text-slate-500">Departments, faculties, student bodies and partner companies apply once. The FUTICK team verifies each organisation before its events go live.</p>
      </div>
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {plans.map((plan, index) => (
          <div key={plan.id} className={index === 1 ? 'card p-6 ring-2 ring-brand-500' : 'card p-6'}>
            <p className="font-semibold text-brand-700">{plan.name}</p>
            <p className="mt-3 text-3xl font-bold">{plan.price_minor === 0 ? 'Free' : formatMoney(plan.price_minor)}<span className="text-sm font-medium text-slate-500">{plan.price_minor ? ` / ${plan.billing_period}` : ''}</span></p>
            <p className="mt-1 text-xs text-slate-500">+ {plan.ticket_fee_percent}% platform fee on paid tickets</p>
            <p className="mt-4 text-sm text-slate-600">{plan.description}</p>
            <ul className="mt-5 space-y-2 text-sm">{plan.features.map((feature) => <li key={feature} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-brand-600" />{feature}</li>)}</ul>
          </div>
        ))}
      </div>
      <div className="mt-10 text-center"><Link href="/signup?type=organizer" className="btn-primary">Apply as an organiser</Link></div>
    </main>
  )
}
