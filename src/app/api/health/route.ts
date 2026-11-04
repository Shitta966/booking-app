import { NextResponse } from 'next/server'
import { databaseKind, DatabaseInitError, query } from '@/lib/db'

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

function databaseTarget() {
  try {
    const url = new URL(process.env.DATABASE_URL ?? '')
    return `${url.hostname}:${url.port || '5432'}`
  } catch {
    return null
  }
}

/**
 * Health check for uptime monitors. On failure it reports which start-up stage broke and which required
 * settings are present (yes/no only — never their values), so a deployment can be diagnosed without logs.
 */
export async function GET() {
  try {
    await query('select 1')
    return NextResponse.json({ status: 'ok', database: await databaseKind() }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    const stage = error instanceof DatabaseInitError ? error.stage : 'query'
    const original = error instanceof DatabaseInitError ? error.original : error
    const secretOk = (name: string) => (process.env[name]?.trim().length ?? 0) >= 32
    return NextResponse.json({
      status: 'error',
      stage,
      hint: HINTS[stage] ?? 'A database query failed.',
      error: {
        code: (original as { code?: string })?.code ?? null,
        message: scrub(original instanceof Error ? original.message : String(original)),
      },
      databaseTarget: databaseTarget(),
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
