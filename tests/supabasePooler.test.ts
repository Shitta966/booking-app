import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DatabaseConfig } from '../src/lib/databaseUrl'
import { classifyPoolerError, findSupabasePooler, poolerCandidates, supabaseDirectRef, type Probe } from '../src/lib/supabasePooler'

const REF = 'gqecsttqragpkxhbmtjz'
const direct: DatabaseConfig = { host: `db.${REF}.supabase.co`, port: 5432, user: 'postgres', password: 'pw', database: 'postgres', ssl: true }

test('recognises Supabase Direct hosts only', () => {
  assert.equal(supabaseDirectRef(`db.${REF}.supabase.co`), REF)
  assert.equal(supabaseDirectRef('aws-0-eu-west-2.pooler.supabase.com'), null)
  assert.equal(supabaseDirectRef('example.com'), null)
})

test('finds the region whose pooler accepts the project, using port 6543 and postgres.<ref>', async () => {
  const seen: string[] = []
  const probe: Probe = async (config) => {
    seen.push(config.host)
    if (config.host === 'aws-1-eu-west-2.pooler.supabase.com') return 'connected'
    throw Object.assign(new Error('Tenant or user not found'), { code: 'XX000' })
  }
  const found = await findSupabasePooler(direct, probe)
  assert.equal(found.host, 'aws-1-eu-west-2.pooler.supabase.com')
  assert.equal(found.port, 6543)
  assert.equal(found.user, `postgres.${REF}`)
  assert.equal(found.password, 'pw')
  assert.ok(seen.length > 1)
})

test('reports a wrong password when the right pooler rejects the login', async () => {
  const probe: Probe = async (config) => (config.host.startsWith('aws-0-eu-west-1') ? 'wrong-password' : 'not-this-region')
  await assert.rejects(findSupabasePooler(direct, probe, poolerCandidates(['eu-west-1', 'us-east-1'])), /password .* was rejected/)
})

test('explains when no pooler serves the project', async () => {
  const probe: Probe = async () => 'not-this-region'
  await assert.rejects(findSupabasePooler(direct, probe, poolerCandidates(['us-east-1'])), /Could not find an IPv4 Supabase pooler/)
})

test('classifies pooler errors', () => {
  assert.equal(classifyPoolerError(Object.assign(new Error('password authentication failed for user'), { code: '28P01' })), 'wrong-password')
  assert.equal(classifyPoolerError(new Error('Tenant or user not found')), 'not-this-region')
  assert.equal(classifyPoolerError(Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })), 'not-this-region')
})
