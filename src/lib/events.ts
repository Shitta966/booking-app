import 'server-only'
import { query } from './db'

export type PublicEvent = {
  id: string
  title: string
  summary: string
  category: string
  venue: string
  start_time: Date
  end_time: Date
  poster_url: string | null
  is_featured: boolean
  org_name: string
  min_price: number | null
  remaining: number
  accepts_reward_coupons: boolean
}

export const CAMPUSES = ['Gidan Kwano', 'Bosso']

export const EVENT_CATEGORIES = ['Conference', 'Career Fair', 'Seminar', 'Workshop', 'Corporate Dinner', 'Convocation', 'Exhibition', 'Sports', 'Social', 'Other']

export async function listPublicEvents(filters: { q?: string; category?: string; campus?: string; free?: boolean; thisWeek?: boolean; date?: string; featuredOnly?: boolean; rewardsOnly?: boolean; limit?: number } = {}) {
  const params: unknown[] = []
  const where = [`e.status = 'published'`, `e.visibility = 'public'`, `o.status = 'active'`, 'e.end_time > now()']
  if (filters.q) {
    params.push(`%${filters.q}%`)
    where.push(`(e.title ilike $${params.length} or e.venue ilike $${params.length} or o.name ilike $${params.length} or e.category ilike $${params.length})`)
  }
  if (filters.category) {
    params.push(filters.category)
    where.push(`e.category = $${params.length}`)
  }
  if (filters.campus) {
    params.push(`%${filters.campus}%`)
    where.push(`e.venue ilike $${params.length}`)
  }
  if (filters.free) where.push('exists (select 1 from ticket_types t where t.event_id = e.id and t.is_active and t.price_minor = 0)')
  if (filters.thisWeek) where.push(`e.start_time < now() + interval '7 days'`)
  if (filters.date && /^\d{4}-\d{2}-\d{2}$/.test(filters.date)) {
    params.push(filters.date)
    where.push(`(e.start_time at time zone 'Africa/Lagos')::date >= $${params.length}::date`)
  }
  if (filters.featuredOnly) where.push('e.is_featured')
  if (filters.rewardsOnly) where.push('e.accepts_reward_coupons')
  params.push(filters.limit ?? 60)
  return query<PublicEvent>(
    `select e.id, e.title, e.summary, e.category, e.venue, e.start_time, e.end_time, e.poster_url, e.is_featured, e.accepts_reward_coupons, o.name as org_name,
            (select min(price_minor) from ticket_types t where t.event_id = e.id and t.is_active) as min_price,
            coalesce((select sum(quantity_total - quantity_sold - quantity_reserved) from ticket_types t where t.event_id = e.id and t.is_active), 0) as remaining
     from events e join organizations o on o.id = e.org_id
     where ${where.join(' and ')}
     order by e.start_time asc limit $${params.length}`,
    params,
  )
}
