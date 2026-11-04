/**
 * Reads DATABASE_URL tolerantly. People paste connection strings with surrounding quotes or spaces, and
 * database passwords often contain characters such as @ # / ? that break standard URL parsing unless
 * percent-encoded. This parser splits at the last "@" before the host, so the password can contain anything.
 */
export type DatabaseConfig = {
  host: string
  port: number
  user: string
  password: string
  database: string
  ssl: boolean
}

export type DatabaseUrlProblem = 'missing' | 'placeholder' | 'password-placeholder' | 'not-a-postgres-url' | 'no-password'

export type ParsedDatabaseUrl =
  | { ok: true; config: DatabaseConfig }
  | { ok: false; problem: DatabaseUrlProblem; message: string }

const MESSAGES: Record<DatabaseUrlProblem, string> = {
  missing: 'DATABASE_URL is empty.',
  placeholder: 'DATABASE_URL still contains the REPLACE_WITH_… placeholder. Paste your Supabase Transaction pooler string.',
  'password-placeholder': 'DATABASE_URL still contains [YOUR-PASSWORD]. Replace it with your Supabase database password.',
  'not-a-postgres-url': 'DATABASE_URL must look like postgresql://user:password@host:6543/postgres.',
  'no-password': 'DATABASE_URL has no password. Use the format postgresql://user:password@host:6543/postgres.',
}

function decode(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value // a literal % in the password that was not percent-encoded
  }
}

export function cleanDatabaseUrl(raw: string | undefined) {
  let value = (raw ?? '').trim()
  while (value.length >= 2 && /^["'`]/.test(value) && value.endsWith(value[0])) value = value.slice(1, -1).trim()
  return value
}

export function parseDatabaseUrl(raw: string | undefined): ParsedDatabaseUrl {
  const value = cleanDatabaseUrl(raw)
  const fail = (problem: DatabaseUrlProblem) => ({ ok: false as const, problem, message: MESSAGES[problem] })
  if (!value) return fail('missing')
  if (/REPLACE_WITH/i.test(value)) return fail('placeholder')
  if (/\[YOUR[-_ ]?PASSWORD\]/i.test(value)) return fail('password-placeholder')

  const match = /^postgres(?:ql)?:\/\/([^:@/?#\s]+)(?::(.*))?@([^@/?#:\s]+)(?::(\d+))?(?:\/([^?#\s]*))?(?:\?(\S*))?$/i.exec(value)
  if (!match) return fail('not-a-postgres-url')
  const [, user, password, host, port, database, query] = match
  if (password === undefined || password === '') return fail('no-password')
  const sslmode = new URLSearchParams(query ?? '').get('sslmode')
  return {
    ok: true,
    config: {
      host,
      port: port ? Number(port) : 5432,
      user: decode(user),
      password: decode(password),
      database: database ? decode(database) : 'postgres',
      // Hosted Postgres (Supabase, Neon) requires TLS.
      ssl: sslmode === 'disable' ? false : Boolean(sslmode && sslmode !== 'prefer') || /supabase\.(co|com)$|neon\.tech$/i.test(host),
    },
  }
}
