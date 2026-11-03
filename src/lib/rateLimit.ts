import 'server-only'
import { headers } from 'next/headers'
import { query, queryOne } from './db'

/**
 * Fixed-window counters kept in the database, so limits hold across restarts and multiple servers.
 * `hit` records an attempt and returns whether the caller is still within the limit.
 */
export async function hit(key: string, limit: number, windowSeconds: number) {
  const [row] = await query<{ count: number }>(
    `insert into rate_limits (key, window_start, count) values ($1, now(), 1)
     on conflict (key) do update set
       count = case when rate_limits.window_start < now() - make_interval(secs => $2) then 1 else rate_limits.count + 1 end,
       window_start = case when rate_limits.window_start < now() - make_interval(secs => $2) then now() else rate_limits.window_start end
     returning count`,
    [key, windowSeconds],
  )
  if (Math.random() < 0.01) await query(`delete from rate_limits where window_start < now() - interval '1 day'`)
  return row.count <= limit
}

/** Checks a counter without adding to it (used for log-in lockout, which only counts failures). */
export async function isBlocked(key: string, limit: number, windowSeconds: number) {
  const row = await queryOne<{ count: number }>(
    'select count from rate_limits where key = $1 and window_start >= now() - make_interval(secs => $2)',
    [key, windowSeconds],
  )
  return (row?.count ?? 0) >= limit
}

export async function clear(key: string) {
  await query('delete from rate_limits where key = $1', [key])
}

/**
 * Client IP for rate limiting, or null when it is unknown. Behind a reverse proxy the first
 * X-Forwarded-For entry is the client; make sure the proxy overwrites that header so it cannot be spoofed.
 * Callers skip per-IP limits when this is null, so visitors never share one "unknown" bucket.
 */
export async function clientIp() {
  const list = await headers()
  return list.get('x-forwarded-for')?.split(',')[0]?.trim() || list.get('x-real-ip')?.trim() || null
}
