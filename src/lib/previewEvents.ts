import type { EventRecord } from '../types'

export const previewEvents: EventRecord[] = [
  {
    id: 'preview-design-week',
    title: 'Design Week Minna',
    description:
      'A gathering for the curious and creative. Spend an afternoon exploring the people, ideas, and work shaping the next chapter of design in Nigeria.',
    category: 'Arts & Culture',
    venue: 'FUT Minna, Bosso Campus',
    start_time: '2026-11-14T10:00:00+01:00',
    end_time: '2026-11-14T17:00:00+01:00',
    poster_url:
      'https://images.unsplash.com/photo-1531058020387-3be344556be6?auto=format&fit=crop&w=1200&q=85',
    organizer_name: 'The Creative Society',
    status: 'published',
    visibility: 'public',
    ticket_types: [
      {
        id: 'preview-design-free',
        name: 'General admission',
        price_minor: 0,
        currency: 'NGN',
        quantity_limit: 250,
        quantity_reserved: 0,
        quantity_sold: 72,
      },
    ],
  },
  {
    id: 'preview-tech-meetup',
    title: 'Build in Public: Minna',
    description:
      'Meet the builders, founders, and makers turning bold ideas into useful products. Bring a work in progress and leave with new collaborators.',
    category: 'Technology',
    venue: 'Innovation Hub, Gidan Kwano',
    start_time: '2026-11-19T16:30:00+01:00',
    end_time: '2026-11-19T20:00:00+01:00',
    poster_url:
      'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=85',
    organizer_name: 'Minna Tech Community',
    status: 'published',
    visibility: 'public',
    ticket_types: [
      {
        id: 'preview-tech-standard',
        name: 'Standard',
        price_minor: 500000,
        currency: 'NGN',
        quantity_limit: 120,
        quantity_reserved: 0,
        quantity_sold: 48,
      },
    ],
  },
  {
    id: 'preview-sounds',
    title: 'Sounds of the North',
    description:
      'An open-air night of live music, new voices, and familiar rhythms. Come for the music, stay for the people.',
    category: 'Music',
    venue: 'Main Bowl, FUT Minna',
    start_time: '2026-11-28T18:00:00+01:00',
    end_time: '2026-11-28T23:00:00+01:00',
    poster_url:
      'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1200&q=85',
    organizer_name: 'Northside Live',
    status: 'published',
    visibility: 'public',
    ticket_types: [
      {
        id: 'preview-sounds-early',
        name: 'Early bird',
        price_minor: 1500000,
        currency: 'NGN',
        quantity_limit: 500,
        quantity_reserved: 0,
        quantity_sold: 196,
      },
    ],
  },
  {
    id: 'preview-career',
    title: 'The Next Chapter: Career Fair',
    description:
      'Meet teams hiring across technology, finance, and the creative industries. Take part in practical sessions on interviews, portfolios, and finding your first role.',
    category: 'Business',
    venue: 'Lecture Theatre Complex, FUT Minna',
    start_time: '2026-12-03T09:00:00+01:00',
    end_time: '2026-12-03T15:00:00+01:00',
    poster_url:
      'https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1200&q=85',
    organizer_name: 'FUT Minna Career Centre',
    status: 'published',
    visibility: 'public',
    ticket_types: [
      {
        id: 'preview-career-free',
        name: 'Student pass',
        price_minor: 0,
        currency: 'NGN',
        quantity_limit: 400,
        quantity_reserved: 0,
        quantity_sold: 91,
      },
    ],
  },
  {
    id: 'preview-film',
    title: 'Campus Film Night',
    description:
      'A relaxed evening of short films from emerging Nigerian filmmakers, followed by a conversation with the people behind the camera.',
    category: 'Arts & Culture',
    venue: 'Amphitheatre, Bosso Campus',
    start_time: '2026-12-08T17:30:00+01:00',
    end_time: '2026-12-08T21:00:00+01:00',
    poster_url:
      'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1200&q=85',
    organizer_name: 'Frame by Frame',
    status: 'published',
    visibility: 'public',
    ticket_types: [
      {
        id: 'preview-film-ticket',
        name: 'General',
        price_minor: 1000000,
        currency: 'NGN',
        quantity_limit: 180,
        quantity_reserved: 0,
        quantity_sold: 58,
      },
    ],
  },
  {
    id: 'preview-wellness',
    title: 'Reset: A Wellness Morning',
    description:
      'Take a little time for yourself. A welcoming morning of movement, good conversation, and simple ways to feel more grounded.',
    category: 'Community',
    venue: 'Sports Pavilion, FUT Minna',
    start_time: '2026-12-12T08:00:00+01:00',
    end_time: '2026-12-12T11:00:00+01:00',
    poster_url:
      'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=1200&q=85',
    organizer_name: 'Wellness Collective',
    status: 'published',
    visibility: 'public',
    ticket_types: [
      {
        id: 'preview-wellness-ticket',
        name: 'Open entry',
        price_minor: 0,
        currency: 'NGN',
        quantity_limit: 90,
        quantity_reserved: 0,
        quantity_sold: 23,
      },
    ],
  },
]
