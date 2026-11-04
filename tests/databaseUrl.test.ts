import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseDatabaseUrl } from '../src/lib/databaseUrl'

const POOLER = 'aws-0-eu-west-2.pooler.supabase.com'

test('a normal Supabase pooler string parses', () => {
  const parsed = parseDatabaseUrl(`postgresql://postgres.abc:s3cret@${POOLER}:6543/postgres`)
  assert.deepEqual(parsed, { ok: true, config: { host: POOLER, port: 6543, user: 'postgres.abc', password: 's3cret', database: 'postgres', ssl: true } })
})

test('surrounding quotes and spaces are ignored', () => {
  const parsed = parseDatabaseUrl(`  "postgresql://postgres.abc:s3cret@${POOLER}:6543/postgres"  `)
  assert.equal(parsed.ok && parsed.config.host, POOLER)
})

test('passwords with @ # / ? characters work without encoding', () => {
  const parsed = parseDatabaseUrl(`postgresql://postgres.abc:P@ss#w/rd?1@${POOLER}:6543/postgres`)
  assert.equal(parsed.ok && parsed.config.password, 'P@ss#w/rd?1')
  assert.equal(parsed.ok && parsed.config.host, POOLER)
})

test('percent-encoded passwords are decoded', () => {
  const parsed = parseDatabaseUrl(`postgresql://postgres.abc:Futick%402026%21@${POOLER}:6543/postgres`)
  assert.equal(parsed.ok && parsed.config.password, 'Futick@2026!')
})

test('placeholders and non-URLs are reported, not connected to', () => {
  assert.equal(parseDatabaseUrl('REPLACE_WITH_SUPABASE_TRANSACTION_POOLER_URL').ok, false)
  const pw = parseDatabaseUrl(`postgresql://postgres.abc:[YOUR-PASSWORD]@${POOLER}:6543/postgres`)
  assert.equal(!pw.ok && pw.problem, 'password-placeholder')
  const api = parseDatabaseUrl('https://abc.supabase.co')
  assert.equal(!api.ok && api.problem, 'not-a-postgres-url')
  assert.equal(!parseDatabaseUrl('').ok && 'missing', 'missing')
})
