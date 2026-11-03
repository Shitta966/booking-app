import Link from 'next/link'
import { ConfirmButton } from '@/components/Modal'
import clsx from 'clsx'
import { FileText, Ticket, UsersRound } from 'lucide-react'
import { Ring } from '@/components/charts'
import { reviewOrder } from '@/app/actions/org'
import { Badge, Flash, PageHeader } from '@/components/ui'
import { requireOrgAccess } from '@/lib/auth'
import { query, transaction } from '@/lib/db'
import { formatDateTime, formatMoney } from '@/lib/format'
import { expireStaleOrders } from '@/lib/orders'

const FILTERS = [['awaiting_review', 'To review'], ['pending_payment', 'Awaiting transfer'], ['paid', 'Paid'], ['all', 'All']] as const

type OrderRow = {
  id: string; reference: string; status: string; total_minor: number; payment_reference: string | null; created_at: Date; expires_at: Date | null
  title: string; full_name: string; email: string; quantity: number
}

export default async function OrdersPage({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<Record<string, string>> }) {
  const { orgId } = await params
  const search = await searchParams
  const { org } = await requireOrgAccess(orgId, 'orders.review')
  await transaction(expireStaleOrders)
  const filter = FILTERS.some(([key]) => key === search.status) ? search.status : 'awaiting_review'
  const orders = await query<OrderRow>(
    `select o.id, o.reference, o.status, o.total_minor, o.payment_reference, o.created_at, o.expires_at, e.title, u.full_name, u.email,
            (select sum(quantity) from order_items where order_id = o.id) as quantity
     from orders o join events e on e.id = o.event_id join users u on u.id = o.user_id
     where o.org_id = $1 and ($2 = 'all' or o.status = $2) order by o.created_at desc limit 300`,
    [org.id, filter],
  )
  const path = `/dashboard/${org.id}/orders?status=${filter}`
  const [summary] = await query<{ income: number; tickets: number; buyers: number; paid: number; total: number }>(
    `select coalesce(sum(total_minor) filter (where status = 'paid'), 0) as income,
            coalesce((select count(*) from tickets t join events e on e.id = t.event_id where e.org_id = $1 and t.status <> 'cancelled'), 0) as tickets,
            count(distinct user_id) filter (where status = 'paid') as buyers,
            count(*) filter (where status = 'paid') as paid,
            count(*) filter (where status <> 'cancelled') as total
     from orders where org_id = $1`,
    [org.id],
  )
  const paidRate = summary.total ? Math.round((summary.paid / summary.total) * 100) : 0

  return (
    <>
      <PageHeader eyebrow="Order list" title="Orders" description="Check your bank statement for the order reference before confirming. Confirming issues the tickets immediately." />
      <div className="card mb-6 flex flex-wrap items-center gap-x-10 gap-y-4 p-5">
        <a href={`/api/orgs/${org.id}/orders`} className="flex items-center gap-3 rounded-2xl bg-brand-50 px-5 py-3 text-sm font-semibold text-brand-700 hover:bg-brand-100">
          <span className="grid size-9 place-items-center rounded-full bg-brand-600 text-white"><FileText size={16} /></span>Export report
        </a>
        <p className="max-w-56 text-[11px] text-slate-400">Every order with attendee, amount, platform fee and transfer reference, as a spreadsheet.</p>
        <div className="flex items-center gap-3"><Ticket size={26} className="text-brand-600" /><div><p className="text-[11px] text-slate-400">Income</p><p className="font-semibold text-slate-900">{summary.income ? formatMoney(summary.income) : '₦0'}</p></div></div>
        <div className="flex items-center gap-3"><UsersRound size={26} className="text-brand-600" /><div><p className="text-[11px] text-slate-400">Paying attendees</p><p className="font-semibold text-slate-900">{summary.buyers} · {summary.tickets} tickets</p></div></div>
        <div className="flex items-center gap-3"><Ring percent={paidRate} size={34} /><div><p className="text-[11px] text-slate-400">Orders paid</p><p className="font-semibold text-slate-900">{paidRate}%</p></div></div>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map(([key, label]) => (
          <Link key={key} href={`/dashboard/${org.id}/orders?status=${key}`} className={clsx('rounded-full px-4 py-2 text-xs font-semibold', filter === key ? 'bg-brand-600 text-white shadow-sm' : 'bg-white text-slate-500 hover:text-brand-700')}>{label}</Link>
        ))}
      </div>
      <Flash searchParams={search} />
      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>Order</th><th>Attendee</th><th>Event</th><th>Amount</th><th>Transfer ref</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td data-label="Order"><p className="whitespace-nowrap font-mono font-semibold">{order.reference}</p><p className="text-xs text-slate-500">{formatDateTime(order.created_at)}</p></td>
                <td data-label="Attendee"><p className="font-medium">{order.full_name}</p><p className="text-xs text-slate-500">{order.email}</p></td>
                <td data-label="Event">{order.title}<p className="text-xs text-slate-500">{order.quantity} ticket{order.quantity === 1 ? '' : 's'}</p></td>
                <td data-label="Amount" className="font-semibold">{formatMoney(order.total_minor)}</td>
                <td data-label="Transfer ref" className="font-mono text-xs">{order.payment_reference ?? '—'}</td>
                <td data-label="Status"><Badge status={order.status} />{order.expires_at && <p className="mt-1 text-xs text-slate-500">holds until {formatDateTime(order.expires_at)}</p>}</td>
                <td data-label="" className="min-w-56">
                  <form action={reviewOrder} className="flex flex-wrap justify-end gap-1">
                    <input type="hidden" name="org_id" value={org.id} />
                    <input type="hidden" name="order_id" value={order.id} />
                    <input type="hidden" name="return_to" value={path} />
                    {['awaiting_review', 'pending_payment'].includes(order.status) && <ConfirmButton name="decision" value="confirm" className="btn-primary btn-sm" tone="primary" title="Confirm this payment?"
                        message={<>Only confirm once <b>{formatMoney(order.total_minor)}</b> with reference <b className="font-mono">{order.reference}</b> is in your bank account. Tickets are issued immediately.</>}
                        confirmLabel="Payment received">Confirm payment</ConfirmButton>}
                    {order.status === 'awaiting_review' && (
                      <>
                        <ConfirmButton name="decision" value="reject" title="Reject this transfer?" confirmLabel="Reject payment"
                          message="The attendee is notified and asked to submit a new transfer reference. Their seats stay held for the reservation window."
                          extra={<label className="field">Reason shown to the attendee<input name="note" maxLength={300} placeholder="e.g. No transfer with this reference yet" className="input" /></label>}>Reject</ConfirmButton>
                      </>
                    )}
                    {!['cancelled', 'expired'].includes(order.status) && <ConfirmButton name="decision" value="cancel" className="btn-secondary btn-sm text-rose-600" title="Cancel this order?"
                      message={order.status === 'paid' ? 'Its tickets are voided and the seats go back on sale. Refund the attendee yourself.' : 'The held seats go back on sale.'} confirmLabel="Cancel order">Cancel</ConfirmButton>}
                  </form>
                </td>
              </tr>
            ))}
            {orders.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-slate-500">Nothing here.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
