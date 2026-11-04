import { NextResponse } from 'next/server'
import { connectionRoute, databaseKind, DatabaseInitError, query } from '@/lib/db'
import { parseDatabaseUrl } from '@/lib/databaseUrl'
import { SupabasePoolerError } from '@/lib/supabasePooler'

const HINTS: Record<string, string> = {
  configure: 'DATABASE_URL is missing or invalid. Set it in Vercel → Settings → Environment Variables, then redeploy.',
  connect: 'Could not reach or log in to the database. Check the host, port (Vercel: Supabase Transaction pooler, 6543) and password in DATABASE_URL.',
  schema: 'Connected, but creating the tables failed. The database user may lack permissions.',
  bootstrap: 'Tables exist, but creating the first super admin failed. FUTICK_SUPERADMIN_PASSWORD must be at least 12 characters.',
}

/** Remove anything that looks like a connection string or password before showing an error publicly. */
function scrub(text: string) {
  return text.replace(/postgres(ql)?:\/\/\S+/gi, '[connection string]').replace(/password=\S+/gi, 'password=[hidden]').slice(0, 300)
}

/**
 * What FUTICK understood from DATABASE_URL, without revealing it: the kind of problem, or the kind of host
 * and the port. This endpoint is public, so it never shows the host name, user name or password.
 */
function databaseUrlSummary() {
  if (!process.env.DATABASE_URL?.trim()) return null
  const parsed = parseDatabaseUrl(process.env.DATABASE_URL)
  if (!parsed.ok) return { problem: parsed.problem, message: parsed.message }
  const { host, port } = parsed.config
  const hostKind = /\.pooler\.supabase\.com$/i.test(host) ? 'supabase-pooler'
    : /\.supabase\.co$/i.test(host) ? 'supabase-direct (IPv6 only — use the pooler on Vercel)'
      : 'other'
  return { problem: null, hostKind, port }
}

/**
 * Health check for uptime monitors. On failure it reports which start-up stage broke and which required
 * settings are present (yes/no only — never their values), so a deployment can be diagnosed without logs.
 */
export async function GET() {
  try {
    await query('select 1')
    return NextResponse.json({ status: 'ok', database: await databaseKind(), route: connectionRoute ?? undefined }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    const stage = error instanceof DatabaseInitError ? error.stage : 'query'
    const original = error instanceof DatabaseInitError ? error.original : error
    const secretOk = (name: string) => (process.env[name]?.trim().length ?? 0) >= 32
    const parsed = parseDatabaseUrl(process.env.DATABASE_URL)
    const directSupabase = parsed.ok && /^db\.[a-z0-9]+\.supabase\.co$/i.test(parsed.config.host)
    const hint = directSupabase
      ? 'DATABASE_URL is Supabase\'s IPv6-only Direct connection. FUTICK tried to switch to your project\'s IPv4 pooler automatically and could not; see the error message. You can also paste the Transaction pooler string from Supabase → Connect.'
      : HINTS[stage] ?? 'A database query failed.'
    return NextResponse.json({
      status: 'error',
      stage,
      hint,
      error: {
        code: (original as { code?: string })?.code ?? null,
        // Our own configuration messages are safe to show; driver messages can name hosts, so they stay in the logs.
        message: (stage === 'configure' || original instanceof SupabasePoolerError) && original instanceof Error
          ? scrub(original.message)
          : 'See the Vercel function logs for details.',
      },
      databaseUrl: databaseUrlSummary(),
      settings: {
        DATABASE_URL: Boolean(process.env.DATABASE_URL?.trim()),
        SESSION_SECRET: secretOk('SESSION_SECRET'),
        TICKET_SIGNING_SECRET: secretOk('TICKET_SIGNING_SECRET'),
        FUTICK_SUPERADMIN_EMAIL: Boolean(process.env.FUTICK_SUPERADMIN_EMAIL?.trim()),
        FUTICK_SUPERADMIN_PASSWORD: (process.env.FUTICK_SUPERADMIN_PASSWORD?.length ?? 0) >= 12,
      },
    }, { status: 503, headers: { 'cache-control': 'no-store' } })
  }
}
