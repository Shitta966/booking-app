import Link from 'next/link'
import { ConfirmButton } from '@/components/Modal'
import { notFound } from 'next/navigation'
import { cancelOrder, submitPayment } from '@/app/actions/attendee'
import { Badge, Flash } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { query, queryOne, transaction } from '@/lib/db'
import { formatDateTime, formatMoney } from '@/lib/format'
import { expireStaleOrders } from '@/lib/orders'

export const metadata = { title: 'Order' }

type OrderDetail = {
  id: string; reference: string; status: string; total_minor: number; expires_at: Date | null; payment_reference: string | null; review_note: string | null
  title: string; event_id: string; bank_name: string | null; account_name: string | null; account_number: string | null; payment_instructions: string | null
}

export default async function OrderPage({ params, searchParams }: { params: Promise<{ orderId: string }>; searchParams: Promise<Record<string, string>> }) {
  const { orderId } = await params
  const user = await requireUser(`/orders/${orderId}`)
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) notFound()
  await transaction(expireStaleOrders)
  const order = await queryOne<OrderDetail>(
    `select o.id, o.reference, o.status, o.total_minor, o.expires_at, o.payment_reference, o.review_note, e.title, e.id as event_id,
            org.bank_name, org.account_name, org.account_number, org.payment_instructions
     from orders o join events e on e.id = o.event_id join organizations org on org.id = o.org_id
     where o.id = $1 and o.user_id = $2`,
    [orderId, user.id],
  )
  if (!order) notFound()
  const items = await query<{ name: string; quantity: number; unit_price_minor: number }>(
    'select tt.name, i.quantity, i.unit_price_minor from order_items i join ticket_types tt on tt.id = i.ticket_type_id where i.order_id = $1',
    [order.id],
  )

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/tickets" className="text-sm text-slate-500 hover:text-brand-600">← My tickets</Link>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">{order.title}</h1><p className="text-sm text-slate-500">Order <span className="font-mono">{order.reference}</span></p></div>
        <Badge status={order.status} />
      </div>
      <div className="mt-6"><Flash searchParams={await searchParams} /></div>

      <div className="card divide-y divide-slate-100">
        {items.map((item) => (
          <div key={item.name} className="flex justify-between p-4 text-sm"><span>{item.quantity} × {item.name}</span><span>{formatMoney(item.unit_price_minor * item.quantity)}</span></div>
        ))}
        <div className="flex justify-between p-4 font-semibold"><span>Total</span><span>{formatMoney(order.total_minor)}</span></div>
      </div>

      {order.status === 'paid' && (
        <div className="card mt-6 p-5 text-sm"><p className="font-semibold text-emerald-700">Payment confirmed. Your tickets are ready.</p><Link href="/tickets" className="btn-primary mt-4">View tickets</Link></div>
      )}

      {order.status === 'pending_payment' && (
        <div className="card mt-6 p-5">
          <h2 className="font-semibold">Pay by bank transfer</h2>
          {order.review_note && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">The organiser could not verify your last transfer: {order.review_note}</p>}
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-slate-500">Bank</dt><dd className="font-semibold">{order.bank_name}</dd></div>
            <div><dt className="text-xs text-slate-500">Account name</dt><dd className="font-semibold">{order.account_name}</dd></div>
            <div><dt className="text-xs text-slate-500">Account number</dt><dd className="font-mono text-lg font-bold tracking-wider">{order.account_number}</dd></div>
          </dl>
          <p className="mt-4 text-sm text-slate-600">Transfer exactly <b>{formatMoney(order.total_minor)}</b> with <b className="font-mono">{order.reference}</b> as the narration{order.expires_at ? <> before <b>{formatDateTime(order.expires_at)}</b></> : null}. Your tickets are held until then.</p>
          {order.payment_instructions && <p className="mt-2 text-sm text-slate-600">{order.payment_instructions}</p>}
          <form action={submitPayment} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
            <input type="hidden" name="order_id" value={order.id} />
            <label className="field flex-1">Transfer reference from your bank receipt<input name="payment_reference" required minLength={4} className="input" /></label>
            <button className="btn-primary">I have paid</button>
          </form>
        </div>
      )}

      {order.status === 'awaiting_review' && (
        <div className="card mt-6 p-5 text-sm text-slate-600">
          <p className="font-semibold text-violet-700">Transfer submitted</p>
          <p className="mt-1">Reference <span className="font-mono">{order.payment_reference}</span>. The organiser will confirm receipt and your tickets will appear under My tickets. Your seats stay held meanwhile.</p>
        </div>
      )}

      {['pending_payment', 'awaiting_review'].includes(order.status) && (
        <form action={cancelOrder} className="mt-4 text-right">
          <input type="hidden" name="order_id" value={order.id} />
          <ConfirmButton className="text-sm font-medium text-rose-600 hover:underline" title="Cancel this order?" message="Your held seats are released. If you already transferred money, contact the organiser before cancelling." confirmLabel="Cancel order">Cancel this order</ConfirmButton>
        </form>
      )}
      {order.status === 'expired' && <p className="card mt-6 p-5 text-sm text-slate-600">This reservation expired. <Link className="font-semibold text-brand-600" href={`/events/${order.event_id}`}>Book again</Link></p>}
    </main>
  )
}
