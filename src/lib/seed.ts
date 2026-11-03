import 'server-only'
import bcrypt from 'bcryptjs'
import { generateOrderReference, generateTicketCode } from './tickets'

type Db = { query<T>(sql: string, params?: unknown[]): Promise<T[]> }

/**
 * Runs on every start, after the schema:
 * 1. Creates the first super admin from FUTICK_SUPERADMIN_EMAIL / FUTICK_SUPERADMIN_PASSWORD.
 * 2. In development with FUTICK_SEED_DEMO=true, fills an empty database with demo data.
 *
 * Demo accounts (development only — every one uses DEMO_PASSWORD below):
 *   superadmin@futick.local  platform super admin
 *   organizer@futick.local   owner of "FUT Minna Career Services"
 *   scanner@futick.local     gate scanner for the same organisation
 *   attendee@futick.local    attendee holding two tickets
 */
const DEMO_PASSWORD = 'futick-demo-2026'

export async function bootstrap(db: Db) {
  const email = process.env.FUTICK_SUPERADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.FUTICK_SUPERADMIN_PASSWORD
  if (email && password) {
    if (password.length < 12) throw new Error('FUTICK_SUPERADMIN_PASSWORD must be at least 12 characters.')
    await db.query(
      `insert into users (email, password_hash, full_name, is_super_admin)
       values ($1, $2, 'Super Admin', true)
       on conflict (email) do update set is_super_admin = true`,
      [email, await bcrypt.hash(password, 10)],
    )
  }

  const seedDemo = process.env.FUTICK_SEED_DEMO === 'true' && process.env.NODE_ENV !== 'production'
  if (!seedDemo) return
  const [{ count }] = await db.query<{ count: number }>('select count(*) as count from organizations')
  if (count > 0) return
  await seedDemoData(db)
}

async function seedDemoData(db: Db) {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10)
  const user = async (email: string, name: string, superAdmin = false) => {
    const [row] = await db.query<{ id: string }>(
      `insert into users (email, password_hash, full_name, is_super_admin) values ($1, $2, $3, $4)
       on conflict (email) do update set full_name = excluded.full_name returning id`,
      [email, hash, name, superAdmin],
    )
    return row.id
  }
  await user('superadmin@futick.local', 'Platform Admin', true)
  const organizer = await user('organizer@futick.local', 'Hauwa Abubakar')
  const scanner = await user('scanner@futick.local', 'Musa Idris')
  const attendee = await user('attendee@futick.local', 'Chinedu Okafor')

  const [org] = await db.query<{ id: string }>(
    `insert into organizations (name, slug, description, kind, contact_email, plan_id, status, approved_at,
       bank_name, account_name, account_number, payment_instructions, created_by)
     values ('FUT Minna Career Services', 'fut-minna-career-services',
       'Career fairs, recruiter sessions and industry networking for FUT Minna students and graduates.',
       'department', 'careers@futick.local', 'pro', 'active', now(),
       'Demo Bank', 'FUT Minna Career Services', '0123456789', 'Use your order reference as the transfer narration.', $1)
     returning id`,
    [organizer],
  )
  await db.query(
    `insert into organization_members (org_id, user_id, role) values ($1, $2, 'owner'), ($1, $3, 'scanner')`,
    [org.id, organizer, scanner],
  )
  await db.query(
    `insert into organizations (name, slug, description, kind, contact_email, plan_id, status, created_by)
     values ('Minna Innovation Partners', 'minna-innovation-partners', 'Corporate partner applying to host a hackathon.',
       'company', 'partners@futick.local', 'starter', 'pending', $1)`,
    [organizer],
  )

  const day = 24 * 60 * 60 * 1000
  const at = (days: number, hour: number) => {
    const date = new Date(Date.now() + days * day)
    date.setUTCHours(hour - 1, 0, 0, 0)
    return date
  }
  const event = async (title: string, category: string, venue: string, days: number, poster: string, summary: string, featured: boolean) => {
    const [row] = await db.query<{ id: string }>(
      `insert into events (org_id, title, summary, description, category, venue, start_time, end_time, poster_url, status, is_featured, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'published', $10, $11) returning id`,
      [org.id, title, summary, `${summary}\n\nDoors open 30 minutes before the start time. Bring your FUTICK ticket on your phone; it will be scanned at the entrance.`,
        category, venue, at(days, 9), at(days, 16), poster, featured, organizer],
    )
    return row.id
  }
  const fair = await event('Career & Industry Fair 2026', 'Career Fair', 'Main Auditorium, Gidan Kwano Campus', 9,
    'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1400&q=80',
    'Meet recruiters from engineering, energy, banking and tech companies. CV clinics and on-the-spot interviews all day.', true)
  const dinner = await event('Corporate Partners Dinner', 'Corporate Dinner', 'Senate Building Banquet Hall, Gidan Kwano', 18,
    'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1400&q=80',
    'An evening with the university’s industry partners, sponsors and alumni leaders.', true)
  const conference = await event('SEET Engineering Conference', 'Conference', 'SEET Lecture Theatre, Gidan Kwano', 27,
    'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=1400&q=80',
    'Two tracks of talks on renewable energy, infrastructure and applied research, with a partner exhibition.', false)

  const ticketType = async (eventId: string, name: string, price: number, total: number, sort: number) => {
    const [row] = await db.query<{ id: string }>(
      `insert into ticket_types (event_id, name, price_minor, quantity_total, sort_order) values ($1, $2, $3, $4, $5) returning id`,
      [eventId, name, price, total, sort],
    )
    return row.id
  }
  const fairStudent = await ticketType(fair, 'Student pass', 0, 400, 1)
  await ticketType(fair, 'Graduate pass', 200000, 150, 2)
  await ticketType(dinner, 'Single seat', 2500000, 80, 1)
  await ticketType(dinner, 'Corporate table (8 seats)', 18000000, 10, 2)
  await ticketType(conference, 'Delegate', 1000000, 250, 1)
  await ticketType(conference, 'Student delegate', 300000, 200, 2)

  const [order] = await db.query<{ id: string }>(
    `insert into orders (reference, org_id, event_id, user_id, status, total_minor) values ($1, $2, $3, $4, 'paid', 0) returning id`,
    [generateOrderReference(), org.id, fair, attendee],
  )
  await db.query('insert into order_items (order_id, ticket_type_id, quantity, unit_price_minor) values ($1, $2, 2, 0)', [order.id, fairStudent])
  await db.query('update ticket_types set quantity_sold = quantity_sold + 2 where id = $1', [fairStudent])
  for (const name of ['Chinedu Okafor', 'Guest of Chinedu Okafor']) {
    await db.query(
      `insert into tickets (code, order_id, event_id, ticket_type_id, user_id, attendee_name) values ($1, $2, $3, $4, $5, $6)`,
      [generateTicketCode(), order.id, fair, fairStudent, attendee, name],
    )
  }

  const tasks: Array<[string, string, number, string]> = [
    ['Confirm exhibitor list with partner companies', 'Hauwa', 2, 'done'],
    ['Book Main Auditorium and backup generator', 'Works Department', 3, 'doing'],
    ['Print directional signage for Gidan Kwano gate', 'Musa', 6, 'todo'],
    ['Brief gate scanners on the check-in flow', 'Musa', 8, 'todo'],
  ]
  for (const [title, assignee, days, status] of tasks) {
    await db.query(
      `insert into event_tasks (event_id, title, assignee, due_date, status) values ($1, $2, $3, $4::date, $5)`,
      [fair, title, assignee, at(days, 12).toISOString().slice(0, 10), status],
    )
  }
}
