import { NextResponse } from 'next/server'
import { databaseKind, query } from '@/lib/db'

export async function GET() {
  try {
    await query('select 1')
    return NextResponse.json({ status: 'ok', database: await databaseKind() })
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 503 })
  }
}
