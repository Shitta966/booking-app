import 'server-only'
import fs from 'node:fs'
import path from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import type { Pool } from 'pg'
import { connection } from 'next/server'
import { cleanDatabaseUrl, parseDatabaseUrl } from './databaseUrl'
import { dataDir } from './dataDir'

/**
 * Database access. Production uses PostgreSQL through `pg` (DATABASE_URL).
 * Without DATABASE_URL, development runs on an embedded PGlite database stored in ~/.futick,
 * so the app works with no setup. Both engines run the same SQL in db/schema.sql.
 */

export type Params = unknown[]

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: Params): Promise<T[]>
}

type Engine = {
  kind: 'postgres' | 'pglite'
  query<T>(sql: string, params?: Params): Promise<T[]>
  exec(sql: string): Promise<void>
  transaction<T>(fn: (db: Queryable) => Promise<T>): Promise<T>
}

const toNumber = (value: string) => Number(value)

async function createPostgresEngine(databaseUrl: string): Promise<Engine> {
  const parsed = parseDatabaseUrl(databaseUrl)
  if (!parsed.ok) throw new Error(parsed.message)
  const { config } = parsed
  const pg = await import('pg')
  pg.types.setTypeParser(20, toNumber) // int8 / count(*)
  pg.types.setTypeParser(1700, toNumber) // numeric
  // Connection fields are passed separately (not as a URL) so passwords with special characters work.
  const pool: Pool = new pg.Pool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    // Serverless hosts run many small instances, each with its own pool; keep each one small there.
    max: Number(process.env.DATABASE_POOL_SIZE ?? (process.env.VERCEL ? 2 : 10)),
    connectionTimeoutMillis: 10_000,
    // Hosted Postgres (Supabase, Neon) requires TLS. Their certificates are not in Node's default
    // trust store, so the connection is encrypted without chain verification.
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
  })
  return {
    kind: 'postgres',
    async query<T>(sql: string, params: Params = []) {
      const result = await pool.query(sql, params)
      return result.rows as T[]
    },
    async exec(sql: string) {
      await pool.query(sql)
    },
    async transaction<T>(fn: (db: Queryable) => Promise<T>) {
      const client = await pool.connect()
      try {
        await client.query('begin')
        const value = await fn({
          async query<R>(sql: string, params: Params = []) {
            const result = await client.query(sql, params)
            return result.rows as R[]
          },
        })
        await client.query('commit')
        return value
      } catch (error) {
        await client.query('rollback')
        throw error
      } finally {
        client.release()
      }
    },
  }
}

async function createPgliteEngine(): Promise<Engine> {
  if (process.env.NODE_ENV === 'production' && process.env.FUTICK_ALLOW_EMBEDDED_DB !== 'true') {
    throw new Error('DATABASE_URL is required in production. The embedded database is for local development only.')
  }
  const { PGlite } = await import('@electric-sql/pglite')
  const dir = path.join(dataDir(), 'pglite')
  fs.mkdirSync(dir, { recursive: true })
  const db: PGlite = await PGlite.create(dir, { parsers: { 20: toNumber, 1700: toNumber } })
  return {
    kind: 'pglite',
    async query<T>(sql: string, params: Params = []) {
      const result = await db.query<T>(sql, params)
      return result.rows
    },
    async exec(sql: string) {
      await db.exec(sql)
    },
    async transaction<T>(fn: (db: Queryable) => Promise<T>) {
      return db.transaction(async (tx) => fn({
        async query<R>(sql: string, params: Params = []) {
          const result = await tx.query<R>(sql, params)
          return result.rows
        },
      }))
    },
  }
}

/** Start-up failure, tagged with the stage that failed so /api/health can say what to fix. */
export class DatabaseInitError extends Error {
  constructor(public stage: 'configure' | 'connect' | 'schema' | 'bootstrap', public original: unknown) {
    super(`Database ${stage} failed: ${original instanceof Error ? original.message : String(original)}`)
  }
}

async function step<T>(stage: DatabaseInitError['stage'], run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    console.error(`[futick] database ${stage} failed`, error)
    throw new DatabaseInitError(stage, error)
  }
}

async function initialize(): Promise<Engine> {
  const url = cleanDatabaseUrl(process.env.DATABASE_URL)
  const engine = await step('configure', () => (url ? createPostgresEngine(url) : createPgliteEngine()))
  await step('connect', () => engine.query('select 1'))
  const schema = fs.readFileSync(path.join(process.cwd(), 'db', 'schema.sql'), 'utf8')
  await step('schema', () => engine.exec(schema))
  const { bootstrap } = await import('./seed')
  await step('bootstrap', () => bootstrap(engine))
  return engine
}

const globalForDb = globalThis as unknown as { futickDb?: Promise<Engine> }

function engine(): Promise<Engine> {
  if (!globalForDb.futickDb) {
    globalForDb.futickDb = initialize().catch((error) => {
      globalForDb.futickDb = undefined
      throw error
    })
  }
  return globalForDb.futickDb
}

export async function query<T = Record<string, unknown>>(sql: string, params: Params = []): Promise<T[]> {
  // Database reads only ever happen for a live request: this stops `next build` from starting the
  // database while it tries to pre-render pages (on Vercel that would connect to Supabase at build time).
  await connection()
  return (await engine()).query<T>(sql, params)
}

export async function queryOne<T = Record<string, unknown>>(sql: string, params: Params = []): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

export async function transaction<T>(fn: (db: Queryable) => Promise<T>): Promise<T> {
  await connection()
  return (await engine()).transaction(fn)
}

export async function databaseKind() {
  await connection()
  return (await engine()).kind
}
