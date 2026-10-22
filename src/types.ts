export type TicketType = {
  id: string
  name: string
  price_minor: number
  currency: string
  quantity_limit: number
  quantity_reserved: number
  quantity_sold: number
}

export type EventRecord = {
  id: string
  title: string
  description: string
  category: string
  venue: string
  start_time: string
  end_time: string
  poster_url: string | null
  organizer_name: string
  organizer_profiles?: { display_name: string } | null
  status: string
  visibility: string
  ticket_types: TicketType[]
}

export type BookingRecord = {
  id: string
  booking_reference: string
  status: string
  total_amount_minor: number
  currency: string
  expires_at: string | null
  created_at: string
  event: Pick<EventRecord, 'title' | 'venue' | 'start_time' | 'poster_url'>
  booking_items: Array<{
    quantity: number
    unit_price_minor: number
    ticket_types: Pick<TicketType, 'name'>
  }>
  payments: Array<{
    id: string
    status: string
  }>
}
