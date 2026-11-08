import Link from 'next/link'
import { CreditCard, Landmark, PlugZap, ShieldCheck, Wallet } from 'lucide-react'
import { recordPayout, saveBankTransfer, savePaymentGateway, testPaymentGateway } from '@/app/actions/admin'
import { CardTitle } from '@/components/charts'
import { ConfirmButton } from '@/components/Modal'
import { Badge, Flash, PageHeader } from '@/components/ui'
import { query } from '@/lib/db'
import { formatDateTime, formatMoney } from '@/lib/format'
import { getPaymentConfig, keyMode, maskSecret, PROVIDER_LABELS, type GatewayConfig, type Provider } from '@/lib/payments/config'
import { siteUrl } from '@/lib/siteUrl'

const naira = (value: number) => (value ? formatMoney(value) : '₦0')

const DETAILS: Record<Provider, { blurb: string; color: string; publicLabel: string; secretLabel: string; hookLabel: string; hookHelp: string; dashboard: string }> = {
  flutterwave: {
    blurb: 'Cards, bank transfer and USSD — the most familiar checkout for Nigerian attendees.',
    color: '#f5a623',
    publicLabel: 'Public key (FLWPUBK…)',
    secretLabel: 'Secret key (FLWSECK…)',
    hookLabel: 'Webhook secret hash',
    hookHelp: 'Any long random string. Enter the same value under Settings → Webhooks → Secret hash in Flutterwave.',
    dashboard: 'https://app.flutterwave.com/dashboard/settings/apis',
  },
  stripe: {
    blurb: 'International Visa, Mastercard and Amex — useful for alumni, sponsors and visitors abroad.',
    color: '#635bff',
    publicLabel: 'Publishable key (pk_…)',
    secretLabel: 'Secret key (sk_…)',
    hookLabel: 'Webhook signing secret (whsec_…)',
    hookHelp: 'In Stripe → Developers → Webhooks, add the endpoint below for checkout.session.completed and checkout.session.async_payment_succeeded, then copy its signing secret.',
    dashboard: 'https://dashboard.stripe.com/apikeys',
  },
}

function GatewayCard({ provider, config, webhookUrl }: { provider: Provider; config: GatewayConfig; webhookUrl: string }) {
  const details = DETAILS[provider]
  const mode = keyMode(provider, config.secretKey)
  return (
    <section className="card flex flex-col p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl text-white" style={{ background: details.color }}><CreditCard size={20} /></span>
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900">{PROVIDER_LABELS[provider]}</h2>
            <p className="text-xs text-slate-500">{details.blurb}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge status={config.enabled ? 'active' : 'draft'} label={config.enabled ? 'on' : 'off'} />
          {mode !== 'unknown' && <Badge status={mode === 'live' ? 'paid' : 'pending'} label={`${mode} keys`} />}
        </div>
      </div>

      <form action={savePaymentGateway} className="mt-5 grid gap-3">
        <input type="hidden" name="provider" value={provider} />
        <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-800">
          <input type="checkbox" name="enabled" defaultChecked={config.enabled} className="size-4 accent-brand-600" /> Offer {PROVIDER_LABELS[provider]} at checkout
        </label>
        <label className="field">{details.publicLabel}<input name="public_key" defaultValue={config.publicKey} autoComplete="off" spellCheck={false} className="input font-mono text-xs" /></label>
        <label className="field">{details.secretLabel}
          <input name="secret_key" type="password" autoComplete="new-password" spellCheck={false}
            placeholder={config.secretKey ? `Saved ${maskSecret(config.secretKey)}${config.source.secretKey === 'environment' ? ' (from environment)' : ''} — leave blank to keep` : 'Paste the secret key'}
            className="input font-mono text-xs" />
        </label>
        <label className="field">{details.hookLabel}
          <input name="webhook_secret" type="password" autoComplete="new-password" spellCheck={false}
            placeholder={config.webhookSecret ? `Saved ${maskSecret(config.webhookSecret)} — leave blank to keep` : 'Not set — payments are then confirmed only when buyers return'}
            className="input font-mono text-xs" />
          <span className="text-[11px] font-normal text-slate-400">{details.hookHelp}</span>
        </label>
        <div className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
          Webhook URL <span className="block select-all break-all font-mono text-xs text-slate-800">{webhookUrl}</span>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" name="clear_secrets" className="accent-rose-600" /> Remove the saved secret key and webhook secret</label>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary">Save {PROVIDER_LABELS[provider]}</button>
          <a href={details.dashboard} target="_blank" rel="noopener noreferrer" className="btn-secondary">Open {PROVIDER_LABELS[provider]} dashboard</a>
        </div>
      </form>
      <form action={testPaymentGateway} className="mt-3">
        <input type="hidden" name="provider" value={provider} />
        <button className="btn-soft btn-sm" disabled={!config.secretKey}><PlugZap size={14} /> Test connection</button>
      </form>
    </section>
  )
}

export default async function AdminPayments({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const [config, base] = await Promise.all([getPaymentConfig(), siteUrl()])
  const [[totals], owed, recent] = await Promise.all([
    query<{ online: number; online_count: number; fees: number; paid_out: number; refunds: number }>(
      `select coalesce((select sum(total_minor) from orders where status = 'paid' and payment_method in ('stripe', 'flutterwave')), 0) as online,
              (select count(*) from orders where status = 'paid' and payment_method in ('stripe', 'flutterwave')) as online_count,
              coalesce((select sum(platform_fee_minor) from orders where status = 'paid' and payment_method in ('stripe', 'flutterwave')), 0) as fees,
              coalesce((select sum(amount_minor) from payouts), 0) as paid_out,
              (select count(*) from payments where status = 'refund_needed') as refunds`,
    ),
    query<{ id: string; name: string; bank_name: string | null; account_name: string | null; account_number: string | null; earned: number; paid_out: number; last_payout: Date | null }>(
      `select * from (
         select o.id, o.name, o.bank_name, o.account_name, o.account_number,
                coalesce((select sum(total_minor - platform_fee_minor) from orders where org_id = o.id and status = 'paid' and payment_method in ('stripe', 'flutterwave')), 0) as earned,
                coalesce((select sum(amount_minor) from payouts where org_id = o.id), 0) as paid_out,
                (select max(created_at) from payouts where org_id = o.id) as last_payout
         from organizations o
         where exists (select 1 from orders where org_id = o.id and status = 'paid' and payment_method in ('stripe', 'flutterwave'))
       ) balances order by earned - paid_out desc`,
    ),
    query<{ id: string; provider: string; status: string; amount_minor: number; note: string; created_at: Date; reference: string; order_id: string; org_id: string; email: string }>(
      `select p.id, p.provider, p.status, p.amount_minor, p.note, p.created_at, o.reference, o.id as order_id, o.org_id, u.email
       from payments p join orders o on o.id = p.order_id join users u on u.id = o.user_id
       order by (p.status = 'refund_needed') desc, p.created_at desc limit 30`,
    ),
  ])
  const owedTotal = owed.reduce((sum, row) => sum + Math.max(0, Number(row.earned) - Number(row.paid_out)), 0)

  return (
    <>
      <PageHeader eyebrow="Payments" title="Payment methods"
        description="Turn on online payments for every organiser on FUTICK. Money is collected into the platform's Stripe and Flutterwave accounts; organisers are paid out their sales less the platform fee." />
      <Flash searchParams={await searchParams} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card flex items-center gap-4 p-5"><CreditCard size={30} className="text-brand-600" /><div><p className="text-xs text-slate-400">Online sales</p><p className="text-xl font-semibold text-slate-900">{naira(Number(totals.online))}</p><p className="text-[11px] text-slate-400">{totals.online_count} orders</p></div></div>
        <div className="card flex items-center gap-4 p-5"><ShieldCheck size={30} className="text-brand-600" /><div><p className="text-xs text-slate-400">Platform fees kept</p><p className="text-xl font-semibold text-slate-900">{naira(Number(totals.fees))}</p></div></div>
        <div className="card flex items-center gap-4 p-5"><Wallet size={30} className="text-gold-500" /><div><p className="text-xs text-slate-400">Owed to organisers</p><p className="text-xl font-semibold text-slate-900">{naira(owedTotal)}</p><p className="text-[11px] text-slate-400">{naira(Number(totals.paid_out))} paid out so far</p></div></div>
        <div className="card flex items-center gap-4 p-5"><Landmark size={30} className={Number(totals.refunds) ? 'text-rose-500' : 'text-slate-400'} /><div><p className="text-xs text-slate-400">Payments to refund</p><p className="text-xl font-semibold text-slate-900">{totals.refunds}</p></div></div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <GatewayCard provider="flutterwave" config={config.flutterwave} webhookUrl={`${base}/api/webhooks/flutterwave`} />
        <GatewayCard provider="stripe" config={config.stripe} webhookUrl={`${base}/api/webhooks/stripe`} />
      </div>

      <section className="card mt-6 flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-slate-100 text-slate-600"><Landmark size={20} /></span>
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900">Manual bank transfer</h2>
            <p className="text-xs text-slate-500">Attendees transfer to the organiser’s own account and the organiser confirms it. Paid directly to organisers, so no payout is needed.</p>
          </div>
        </div>
        <form action={saveBankTransfer} className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="enabled" defaultChecked={config.bankTransferEnabled} className="size-4 accent-brand-600" /> Allowed</label>
          <button className="btn-secondary btn-sm">Save</button>
        </form>
      </section>

      <section className="card mt-6 overflow-x-auto">
        <div className="px-6 pt-6"><CardTitle>Payouts to organisers</CardTitle></div>
        <table className="data-table">
          <thead><tr><th>Organisation</th><th>Online sales (after fees)</th><th>Paid out</th><th>Owed</th><th>Bank</th><th>Record payout</th></tr></thead>
          <tbody>
            {owed.map((row) => {
              const balance = Math.max(0, Number(row.earned) - Number(row.paid_out))
              return (
                <tr key={row.id}>
                  <td data-label="Organisation"><Link href={`/admin/organizations/${row.id}`} className="font-medium text-slate-800 hover:text-brand-700">{row.name}</Link>{row.last_payout && <p className="text-xs text-slate-400">last paid {formatDateTime(row.last_payout)}</p>}</td>
                  <td data-label="Online sales">{naira(Number(row.earned))}</td>
                  <td data-label="Paid out">{naira(Number(row.paid_out))}</td>
                  <td data-label="Owed" className="font-semibold text-slate-900">{naira(balance)}</td>
                  <td data-label="Bank" className="text-xs">{row.account_number ? <>{row.bank_name}<br /><span className="font-mono">{row.account_number}</span><br />{row.account_name}</> : <span className="text-rose-600">No bank details</span>}</td>
                  <td data-label="">
                    {balance > 0 && (
                      <form action={recordPayout} className="flex flex-wrap gap-1">
                        <input type="hidden" name="org_id" value={row.id} />
                        <input name="amount" inputMode="decimal" defaultValue={balance / 100} aria-label="Amount in naira" className="input w-28 py-1.5 text-xs" />
                        <input name="reference" placeholder="Transfer ref" aria-label="Transfer reference" className="input w-32 py-1.5 text-xs" />
                        <ConfirmButton tone="primary" className="btn-primary btn-sm" title="Record this payout?" message={<>Only record it after the money has left your account for <b>{row.name}</b>. This reduces what they are owed.</>} confirmLabel="Record payout">Record</ConfirmButton>
                      </form>
                    )}
                  </td>
                </tr>
              )
            })}
            {owed.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-slate-400">No online sales yet.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="card mt-6 overflow-x-auto">
        <div className="px-6 pt-6"><CardTitle>Recent online payments</CardTitle></div>
        <table className="data-table">
          <thead><tr><th>Order</th><th>Provider</th><th>Amount</th><th>Status</th><th>When</th></tr></thead>
          <tbody>
            {recent.map((payment) => (
              <tr key={payment.id}>
                <td data-label="Order"><Link href={`/dashboard/${payment.org_id}/orders?status=all`} className="font-mono font-semibold text-slate-800 hover:text-brand-700">{payment.reference}</Link><p className="text-xs text-slate-400">{payment.email}</p></td>
                <td data-label="Provider" className="capitalize">{payment.provider}</td>
                <td data-label="Amount">{naira(Number(payment.amount_minor))}</td>
                <td data-label="Status">
                  <Badge status={payment.status === 'succeeded' ? 'paid' : payment.status === 'refund_needed' ? 'cancelled' : payment.status === 'failed' ? 'expired' : 'pending'} label={payment.status.replace('_', ' ')} />
                  {payment.note && <p className="mt-1 max-w-64 text-xs text-rose-600">{payment.note} Refund it from the {payment.provider === 'stripe' ? 'Stripe' : 'Flutterwave'} dashboard.</p>}
                </td>
                <td data-label="When">{formatDateTime(payment.created_at)}</td>
              </tr>
            ))}
            {recent.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-slate-400">No online payments yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  )
}
