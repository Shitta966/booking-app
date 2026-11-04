import type { DatabaseConfig } from './databaseUrl'

/**
 * Supabase's Direct connection host (db.<ref>.supabase.co) is IPv6-only unless the paid IPv4 add-on is
 * enabled, and serverless hosts such as Vercel only have IPv4. Supabase also runs an IPv4 connection
 * pooler in each region (aws-0-<region> / aws-1-<region>.pooler.supabase.com) that accepts the same
 * password with the user name postgres.<ref>. This module finds the pooler that serves a project.
 */

export const SUPABASE_REGIONS = [
  'eu-west-2', 'eu-west-1', 'eu-central-1', 'eu-west-3', 'eu-north-1', 'eu-central-2',
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'ca-central-1', 'sa-east-1',
  'ap-south-1', 'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2',
]

const DIRECT_HOST = /^db\.([a-z0-9]{20})\.supabase\.co$/i

/** Returns the project ref when `host` is a Supabase Direct connection host. */
export function supabaseDirectRef(host: string) {
  return DIRECT_HOST.exec(host)?.[1]?.toLowerCase() ?? null
}

export function poolerCandidates(regions = SUPABASE_REGIONS) {
  return ['aws-0', 'aws-1'].flatMap((cluster) => regions.map((region) => `${cluster}-${region}.pooler.supabase.com`))
}

/** Outcome of trying one pooler host. */
export type ProbeResult = 'connected' | 'wrong-password' | 'not-this-region'

export type Probe = (config: DatabaseConfig) => Promise<ProbeResult>

/**
 * Classifies an error from connecting to a pooler. "Tenant or user not found" means the project lives in
 * another region; an authentication failure means this is the right pooler but the password is wrong.
 */
export function classifyPoolerError(error: unknown): ProbeResult {
  const message = error instanceof Error ? error.message : String(error)
  const code = (error as { code?: string })?.code
  if (code === '28P01' || /password authentication failed/i.test(message)) return 'wrong-password'
  return 'not-this-region'
}

export class SupabasePoolerError extends Error {}

/**
 * Tries every regional pooler in parallel and returns the configuration for the first one that accepts
 * the project. Transaction mode (port 6543) is used because it suits short-lived serverless functions.
 */
export async function findSupabasePooler(direct: DatabaseConfig, probe: Probe, candidates = poolerCandidates()): Promise<DatabaseConfig> {
  const ref = supabaseDirectRef(direct.host)
  if (!ref) throw new SupabasePoolerError('Not a Supabase Direct connection host.')
  const user = direct.user.startsWith(`postgres.${ref}`) ? direct.user : `postgres.${ref}`

  return new Promise<DatabaseConfig>((resolve, reject) => {
    let pending = candidates.length
    let settled = false
    let wrongPassword = false
    for (const host of candidates) {
      const config: DatabaseConfig = { ...direct, host, port: 6543, user, ssl: true }
      probe(config)
        .catch(classifyPoolerError)
        .then((result) => {
          if (settled) return
          if (result === 'connected') {
            settled = true
            resolve(config)
          } else if (result === 'wrong-password') {
            wrongPassword = true
          }
          pending -= 1
          if (pending === 0 && !settled) {
            settled = true
            reject(new SupabasePoolerError(wrongPassword
              ? 'Found your Supabase pooler, but the database password in DATABASE_URL was rejected.'
              : 'Could not find an IPv4 Supabase pooler for this project. Use the Transaction pooler string from Supabase → Connect.'))
          }
        })
    }
  })
}
