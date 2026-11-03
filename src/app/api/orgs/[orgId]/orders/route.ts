import { requireOrgAccess } from '@/lib/auth'
import { query } from '@/lib/db'

function csv(value: unknown) {
  let text = value instanceof Date ? value.toISOString() : String(value ?? '')
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

/** Orders report for an organisation (the dashboard's "Export report" button). */
export async function GET(_request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  const { org } = await requireOrgAccess(orgId, 'orders.review')
  const rows = await query<Record<string, unknown>>(
    `select o.reference, o.created_at, e.title, u.full_name, u.email, (select sum(quantity) from order_items where order_id = o.id) as tickets,
            o.total_minor / 100.0 as total_naira, o.platform_fee_minor / 100.0 as fee_naira, o.status, o.payment_reference, o.reviewed_at
     from orders o join events e on e.id = o.event_id join users u on u.id = o.user_id
     where o.org_id = $1 order by o.created_at desc`,
    [org.id],
  )
  const header = ['Reference', 'Created at', 'Event', 'Attendee', 'Email', 'Tickets', 'Total (NGN)', 'Platform fee (NGN)', 'Status', 'Transfer reference', 'Reviewed at']
  const lines = rows.map((row) => Object.values(row).map(csv).join(','))
  return new Response([header.map(csv).join(','), ...lines].join('\r\n'), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${org.slug}-orders.csv"`, 'cache-control': 'no-store' },
  })
}
