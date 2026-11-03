import 'server-only'
import fs from 'node:fs'
import path from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import type { Pool } from 'pg'
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

async function createPostgresEngine(connectionString: string): Promise<Engine> {
  const pg = await import('pg')
  pg.types.setTypeParser(20, toNumber) // int8 / count(*)
  pg.types.setTypeParser(1700, toNumber) // numeric
  const pool: Pool = new pg.Pool({
    connectionString,
    // Serverless hosts run many small instances, each with its own pool; keep each one small there.
    max: Number(process.env.DATABASE_POOL_SIZE ?? (process.env.VERCEL ? 2 : 10)),
    // Hosted Postgres (Supabase direct or pooler, Neon) requires TLS. Their certificates are not in Node's
    // default trust store, so the connection is encrypted without chain verification.
    ssl: /sslmode=require|supabase\.(co|com)|neon\.tech/.test(connectionString) ? { rejectUnauthorized: false } : undefined,
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

async function initialize(): Promise<Engine> {
  const url = process.env.DATABASE_URL?.trim()
  const engine = url ? await createPostgresEngine(url) : await createPgliteEngine()
  const schema = fs.readFileSync(path.join(process.cwd(), 'db', 'schema.sql'), 'utf8')
  await engine.exec(schema)
  const { bootstrap } = await import('./seed')
  await bootstrap(engine)
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
  return (await engine()).query<T>(sql, params)
}

export async function queryOne<T = Record<string, unknown>>(sql: string, params: Params = []): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

export async function transaction<T>(fn: (db: Queryable) => Promise<T>): Promise<T> {
  return (await engine()).transaction(fn)
}

export async function databaseKind() {
  return (await engine()).kind
}
