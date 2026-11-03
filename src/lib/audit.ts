import 'server-only'
import type { Queryable } from './db'
import { query } from './db'

type AuditEntry = {
  actorId: string | null
  orgId?: string | null
  action: string
  entityType: string
  entityId?: string | null
  metadata?: Record<string, unknown>
}

export async function audit(entry: AuditEntry, db?: Queryable) {
  const sql = `insert into audit_logs (actor_id, org_id, action, entity_type, entity_id, metadata)
               values ($1, $2, $3, $4, $5, $6)`
  const params = [entry.actorId, entry.orgId ?? null, entry.action, entry.entityType, entry.entityId ?? null, JSON.stringify(entry.metadata ?? {})]
  if (db) await db.query(sql, params)
  else await query(sql, params)
}
