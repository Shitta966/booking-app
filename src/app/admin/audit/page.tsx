import { PageHeader } from '@/components/ui'
import { query } from '@/lib/db'
import { formatDateTime } from '@/lib/format'

export default async function AuditLog({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { q = '' } = await searchParams
  const term = q.trim().slice(0, 80)
  const entries = await query<{ id: string; action: string; entity_type: string; entity_id: string | null; metadata: Record<string, unknown>; created_at: Date; actor: string | null; org: string | null }>(
    `select a.id, a.action, a.entity_type, a.entity_id, a.metadata, a.created_at, u.email as actor, o.name as org
     from audit_logs a left join users u on u.id = a.actor_id left join organizations o on o.id = a.org_id
     where ($1 = '' or a.action ilike '%' || $1 || '%' or u.email ilike '%' || $1 || '%' or o.name ilike '%' || $1 || '%')
     order by a.created_at desc limit 300`,
    [term],
  )
  return (
    <>
      <PageHeader eyebrow="Security" title="Audit log" description="Every sign-up, approval, payment decision, role change and setting change." />
      <form className="mb-4 flex gap-2"><input name="q" defaultValue={term} placeholder="Filter by action, email or organisation" className="input max-w-sm" /><button className="btn-secondary">Filter</button></form>
      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Organisation</th><th>Details</th></tr></thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td data-label="When" className="whitespace-nowrap text-xs">{formatDateTime(entry.created_at)}</td>
                <td data-label="Action" className="font-mono text-xs text-brand-700">{entry.action}</td>
                <td data-label="Actor" className="text-xs">{entry.actor ?? 'system'}</td>
                <td data-label="Organisation" className="text-xs">{entry.org ?? '—'}</td>
                <td data-label="Details" className="max-w-md truncate font-mono text-xs text-slate-500">{entry.entity_type}{entry.entity_id ? `:${entry.entity_id.slice(0, 8)}` : ''} {Object.keys(entry.metadata ?? {}).length ? JSON.stringify(entry.metadata) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
