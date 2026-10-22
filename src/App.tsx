import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  CircleUserRound,
  Clock3,
  Compass,
  MapPin,
  Menu,
  Search,
  Sparkles,
  Ticket,
  X,
} from 'lucide-react'
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom'
import { previewEvents } from './lib/previewEvents'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { BookingRecord, EventRecord } from './types'

type AppContextValue = {
  events: EventRecord[]
  userEmail: string | null
  isDemo: boolean
  isLoading: boolean
  error: string | null
  isPreview: boolean
  startDemoSession: () => void
  signOut: () => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

function useApp() {
  const value = useContext(AppContext)
  if (!value) throw new Error('App context is missing')
  return value
}

function AppProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<EventRecord[]>(isSupabaseConfigured ? [] : previewEvents)
  const [isDemo, setIsDemo] = useState(() => window.sessionStorage.getItem('campuspass-demo') === 'true')
  const [userEmail, setUserEmail] = useState<string | null>(() =>
    window.sessionStorage.getItem('campuspass-demo') === 'true' ? 'demo@campuspass.local' : null,
  )
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState<string | null>(null)

  const startDemoSession = useCallback(() => {
    window.sessionStorage.setItem('campuspass-demo', 'true')
    setIsDemo(true)
    setUserEmail('demo@campuspass.local')
  }, [])

  const signOut = useCallback(async () => {
    if (isDemo) {
      window.sessionStorage.removeItem('campuspass-demo')
      setIsDemo(false)
      setUserEmail(null)
      return
    }
    if (supabase) {
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) setError(signOutError.message)
    }
  }, [isDemo])

  useEffect(() => {
    const client = supabase
    if (!client) return undefined
    let active = true
    client
      .from('events')
      .select('*, ticket_types(*), organizer_profiles(display_name)')
      .eq('status', 'published')
      .eq('visibility', 'public')
      .order('start_time', { ascending: true })
      .then(({ data, error: queryError }) => {
        if (!active) return
        if (queryError) {
          setError(queryError.message)
          setEvents([])
        } else {
          setEvents((data ?? []).map((event) => ({
            ...event,
            organizer_name: event.organizer_profiles?.display_name ?? 'CampusPass organizer',
          })) as EventRecord[])
        }
        setIsLoading(false)
      })
    client.auth.getSession().then(({ data, error: sessionError }) => {
        if (!active) return
        if (sessionError) setError(sessionError.message)
        if (!window.sessionStorage.getItem('campuspass-demo')) {
          setIsDemo(false)
          setUserEmail(data.session?.user.email ?? null)
        }
      })
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        if (!window.sessionStorage.getItem('campuspass-demo')) {
          setIsDemo(false)
          setUserEmail(session?.user.email ?? null)
        }
      })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo(
    () => ({
      events,
      userEmail,
      isDemo,
      isLoading,
      error,
      isPreview: !isSupabaseConfigured,
      startDemoSession,
      signOut,
    }),
    [events, userEmail, isDemo, isLoading, error, startDemoSession, signOut],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <div className="app-shell">
          <SiteHeader />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/events/:eventId" element={<EventPage />} />
            <Route path="/login" element={<AuthPage />} />
            <Route path="/my-tickets" element={<MyTicketsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
          <SiteFooter />
        </div>
      </AppProvider>
    </BrowserRouter>
  )
}

function SiteHeader() {
  const { userEmail, isDemo, signOut } = useApp()
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" to="/" aria-label="CampusPass home">
          <span className="brand-mark"><Ticket size={18} strokeWidth={2.5} /></span>
          <span>campus<span className="brand-light">pass</span></span>
        </Link>
        <button
          className="mobile-menu-button"
          type="button"
          aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
        <nav className={menuOpen ? 'main-nav is-open' : 'main-nav'} aria-label="Main navigation">
          <Link className={location.pathname === '/explore' ? 'nav-active' : ''} to="/explore" onClick={() => setMenuOpen(false)}>Explore events</Link>
          <a href="/#how-it-works">How it works</a>
          <a href="/#organizers">For organizers</a>
        </nav>
        <div className="header-actions">
          {userEmail ? (
            <>
              <Link className="nav-tickets" to="/my-tickets"><Ticket size={16} /> My tickets</Link>
              <button
                className="avatar-button"
                type="button"
                title={isDemo ? 'Demo attendee session' : userEmail ?? undefined}
                onClick={() => void signOut()}
              >
                <CircleUserRound size={19} />
                <span>{isDemo ? 'Demo · sign out' : 'Sign out'}</span>
              </button>
            </>
          ) : (
            <>
              <Link className="login-link" to="/login">Log in</Link>
              <Link className="button button-dark button-small" to="/login?mode=signup">Get started <ArrowRight size={15} /></Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

function PreviewNotice() {
  const { isPreview } = useApp()
  if (!isPreview) return null
  return (
    <div className="preview-notice" role="status">
      <Sparkles size={14} /> Preview mode <span>·</span> Sample event listings. Connect Supabase to load live events and enable bookings.
    </div>
  )
}

function HomePage() {
  const { events, isLoading } = useApp()
  const featured = events.slice(0, 3)
  const navigate = useNavigate()

  return (
    <main>
      <PreviewNotice />
      <section className="hero-section">
        <div className="hero-orb hero-orb-one" />
        <div className="hero-orb hero-orb-two" />
        <div className="hero-content">
          <div className="eyebrow"><span className="eyebrow-dot" /> GOOD THINGS HAPPEN HERE</div>
          <h1>Find your people.<br /><span>Find your next</span> <span className="serif-accent">something.</span></h1>
          <p className="hero-copy">The best of what’s happening around campus, all in one place. Discover the moments you don’t want to miss.</p>
          <form
            className="hero-search"
            onSubmit={(event) => {
              event.preventDefault()
              const search = new FormData(event.currentTarget).get('search')?.toString() ?? ''
              navigate(`/explore${search ? `?q=${encodeURIComponent(search)}` : ''}`)
            }}
          >
            <Search size={19} />
            <input name="search" type="search" placeholder="What are you in the mood for?" aria-label="Search events" />
            <button className="button button-dark" type="submit">Find events <ArrowRight size={16} /></button>
          </form>
          <div className="hero-meta"><MapPin size={15} /> FUT Minna &nbsp;·&nbsp; and beyond</div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-photo hero-photo-back">
            <img src="https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=850&q=85" alt="" />
          </div>
          <div className="hero-photo hero-photo-front">
            <img src="https://images.unsplash.com/photo-1523580494863-6f3031224c94?auto=format&fit=crop&w=800&q=85" alt="" />
            <div className="photo-caption"><span className="caption-dot" /><span><b>YOUR NEXT GREAT MEMORY</b><small>is closer than you think</small></span><ArrowUpRight size={17} /></div>
          </div>
          <div className="floating-date"><CalendarDays size={17} /><span><b>14 NOV</b><small>SAVE THE DATE</small></span></div>
          <div className="floating-ticket"><span className="ticket-mini-icon"><Ticket size={18} /></span><span><b>Your plans, sorted.</b><small>One little pass. A lot of possibilities.</small></span></div>
        </div>
        <a className="scroll-cue" href="#upcoming"><span>SCROLL TO EXPLORE</span><ArrowDown size={14} /></a>
      </section>

      <section className="trust-strip">
        <div><span className="trust-number">01</span><span>Discover what’s on</span></div>
        <span className="trust-divider" />
        <div><span className="trust-number">02</span><span>Book in a few taps</span></div>
        <span className="trust-divider" />
        <div><span className="trust-number">03</span><span>Show up. Have a story.</span></div>
        <span className="trust-location"><MapPin size={14} /> BUILT FOR MINNA</span>
      </section>

      <section className="section-wrap upcoming-section" id="upcoming">
        <div className="section-heading">
          <div><div className="eyebrow eyebrow-muted">MAKE ROOM FOR A GOOD TIME</div><h2>Coming up <span className="serif-accent">soon.</span></h2></div>
          <Link className="text-link" to="/explore">See all events <ArrowRight size={16} /></Link>
        </div>
        {isLoading ? <LoadingState /> : (
          <EventGrid events={featured} />
        )}
      </section>

      <section className="category-section">
        <div className="section-wrap">
          <div className="section-heading category-heading">
            <div><div className="eyebrow eyebrow-muted">FOLLOW YOUR CURIOSITY</div><h2>Whatever you’re <span className="serif-accent">into.</span></h2></div>
            <Link className="text-link" to="/explore">Explore all <ArrowRight size={16} /></Link>
          </div>
          <div className="category-grid">
            {[
              ['Music', 'Live shows, DJ sets & more', 'category-music', '♪'],
              ['Technology', 'Ideas, makers & meetups', 'category-tech', '⌘'],
              ['Arts & Culture', 'Art, film & everything between', 'category-arts', '✳'],
              ['Community', 'Find your kind of people', 'category-community', '♡'],
            ].map(([name, subtitle, style, symbol]) => (
              <Link key={name} className={`category-card ${style}`} to={`/explore?category=${encodeURIComponent(name)}`}>
                <span className="category-symbol">{symbol}</span><span className="category-label">{name}<small>{subtitle}</small></span><ArrowUpRight size={17} />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section-wrap how-section" id="how-it-works">
        <div className="how-copy">
          <div className="eyebrow eyebrow-muted">LESS PLANNING. MORE LIVING.</div>
          <h2>Good plans.<br /><span className="serif-accent">Zero paper.</span></h2>
          <p>Keep your tickets in one safe place and spend less time sorting plans. From the first tap to the front row, we’ve got you.</p>
          <Link className="button button-dark" to="/explore">Find your next event <ArrowRight size={16} /></Link>
        </div>
        <div className="steps">
          <div className="step"><span className="step-num">01</span><span className="step-icon"><Compass size={21} /></span><span><b>Find your thing</b><small>Browse handpicked happenings around FUT Minna.</small></span></div>
          <div className="step"><span className="step-num">02</span><span className="step-icon"><Ticket size={21} /></span><span><b>Book your spot</b><small>Your ticket lives right here. No printing, no panic.</small></span></div>
          <div className="step"><span className="step-num">03</span><span className="step-icon"><Sparkles size={21} /></span><span><b>Make it a moment</b><small>Show your pass at the door, then enjoy being there.</small></span></div>
        </div>
      </section>

      <section className="organizer-banner" id="organizers">
        <div className="organizer-shape" aria-hidden="true">✳</div>
        <div className="organizer-content"><div className="eyebrow">FOR THE ONES MAKING IT HAPPEN</div><h2>You bring the people.<br /><span className="serif-accent">We’ll bring the passes.</span></h2><p>Make your next event easier to discover, book, and check in.</p><a className="button button-cream" href="mailto:hello@campuspass.ng?subject=CampusPass%20organizer%20access">Let’s talk events <ArrowRight size={16} /></a></div>
        <div className="organizer-stat"><span>YOUR IDEAS</span><b>deserve a<br />full house.</b><small>Make it easy for people to say yes.</small></div>
      </section>

      <section className="section-wrap all-events-teaser">
        <div><span className="eyebrow eyebrow-muted">A LITTLE SOMETHING FOR EVERYONE</span><h2>Your calendar called.</h2><p>It’s ready for something more interesting.</p></div>
        <Link className="button button-dark" to="/explore">Browse all events <ArrowRight size={16} /></Link>
      </section>
      {featured.length === 0 && !isLoading && <div className="sr-only">No events are currently available.</div>}
    </main>
  )
}

function EventGrid({ events }: { events: EventRecord[] }) {
  if (!events.length) {
    return <div className="empty-state"><CalendarDays size={25} /><b>Nothing on the calendar just yet.</b><span>Check back soon for new events.</span></div>
  }
  return <div className="event-grid">{events.map((event, index) => <EventCard key={event.id} event={event} index={index} />)}</div>
}

function EventCard({ event, index = 0 }: { event: EventRecord; index?: number }) {
  const firstTicket = event.ticket_types?.[0]
  const isFree = !firstTicket || firstTicket.price_minor === 0
  const remaining = firstTicket
    ? Math.max(0, firstTicket.quantity_limit - firstTicket.quantity_sold - firstTicket.quantity_reserved)
    : null
  return (
    <Link to={`/events/${event.id}`} className={`event-card event-card-${index % 3}`}>
      <div className="event-image-wrap">
        {event.poster_url ? <img src={event.poster_url} alt="" className="event-image" loading="lazy" /> : <div className="event-image-placeholder"><Sparkles size={30} /></div>}
        <span className="event-category">{event.category}</span>
        <button className="save-event" type="button" aria-label={`View ${event.title}`} onClick={(clickEvent) => clickEvent.stopPropagation()}><ArrowUpRight size={17} /></button>
      </div>
      <div className="event-card-body">
        <div className="event-date"><CalendarDays size={14} /> {formatShortDate(event.start_time)} <span>·</span> {formatTime(event.start_time)}</div>
        <h3>{event.title}</h3>
        <div className="event-venue"><MapPin size={14} /> {event.venue}</div>
        <div className="event-card-bottom"><span className={isFree ? 'price-tag price-free' : 'price-tag'}>{isFree ? 'FREE' : formatMoney(firstTicket.price_minor, firstTicket.currency)}<small>{!isFree ? ' / ticket' : ''}</small></span><span className="availability">{remaining === null ? '' : `${remaining} spots left`}</span></div>
      </div>
    </Link>
  )
}

function ExplorePage() {
  const { events, isLoading, error, isPreview } = useApp()
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [category, setCategory] = useState(params.get('category') ?? 'All events')
  const [priceFilter, setPriceFilter] = useState('Any price')
  const [dateFilter, setDateFilter] = useState('')
  const categories = ['All events', ...Array.from(new Set(events.map((event) => event.category)))]
  const filteredEvents = events.filter((event) => {
    const searchable = `${event.title} ${event.venue} ${event.category} ${event.organizer_name}`.toLowerCase()
    const price = event.ticket_types?.[0]?.price_minor ?? 0
    return searchable.includes(query.toLowerCase())
      && (category === 'All events' || event.category === category)
      && (priceFilter === 'Any price' || (priceFilter === 'Free' ? price === 0 : price > 0))
      && (!dateFilter || formatDateInput(event.start_time) === dateFilter)
  })

  return (
    <main className="page-main">
      <PreviewNotice />
      <section className="explore-top">
        <div className="eyebrow eyebrow-muted">THE GOOD STUFF IS OUT THERE</div>
        <h1>Find your <span className="serif-accent">next thing.</span></h1>
        <p>Little moments, big nights, and all the things in between.</p>
        <label className="explore-search"><Search size={19} /><input type="search" placeholder="Search events, places, people..." value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>↵</kbd></label>
      </section>
      <section className="section-wrap explore-results">
        {isPreview && <div className="preview-inline"><Sparkles size={14} /> These are sample listings for preview only.</div>}
        <div className="filter-row">
          <div className="category-filters" role="group" aria-label="Filter by category">
            {categories.map((item) => <button className={item === category ? 'filter-pill filter-active' : 'filter-pill'} key={item} type="button" onClick={() => setCategory(item)}>{item}</button>)}
          </div>
          <div className="extra-filters">
            <label className="date-filter">Date <input aria-label="Filter by date" type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} /></label>
            <label className="price-filter">Price <ChevronDown size={14} /><select value={priceFilter} onChange={(event) => setPriceFilter(event.target.value)} aria-label="Filter by price"><option>Any price</option><option>Free</option><option>Paid</option></select></label>
          </div>
        </div>
        {error && <div className="inline-error" role="alert">Couldn’t load events from Supabase: {error}. Check the project URL, anon key, and database policies.</div>}
        {isLoading ? <LoadingState /> : filteredEvents.length ? (
          <><div className="results-count"><span>{filteredEvents.length} {filteredEvents.length === 1 ? 'event' : 'events'}</span><span>FUT Minna & surroundings</span></div><EventGrid events={filteredEvents} /></>
        ) : (
          <div className="empty-state"><Search size={24} /><b>No events match that search.</b><span>Try another title, category, date, or price filter.</span><button className="text-button" type="button" onClick={() => { setQuery(''); setCategory('All events'); setPriceFilter('Any price'); setDateFilter('') }}>Clear filters</button></div>
        )}
      </section>
    </main>
  )
}

function EventPage() {
  const { eventId } = useParams()
  const { events, isPreview, userEmail } = useApp()
  const navigate = useNavigate()
  const event = events.find((item) => item.id === eventId)
  const [selectedTicket, setSelectedTicket] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!event) return <main className="page-main"><div className="empty-state event-not-found"><CalendarDays size={25} /><b>We couldn’t find that event.</b><span>It may have been removed or the link may be old.</span><Link className="text-link" to="/explore">Browse events <ArrowRight size={16} /></Link></div></main>

  const ticketType = event.ticket_types.find((ticket) => ticket.id === selectedTicket) ?? event.ticket_types[0]
  const available = ticketType
    ? Math.max(0, ticketType.quantity_limit - ticketType.quantity_sold - ticketType.quantity_reserved)
    : 0
  async function bookTicket() {
    if (!userEmail) {
      navigate('/login')
      return
    }
    if (!supabase || !ticketType || isPreview) {
      setMessage('Live booking is not available in preview mode. Connect Supabase to create a real reservation.')
      return
    }
    setSubmitting(true)
    setMessage('')
    const { data, error: bookingError } = await supabase.rpc('create_booking', {
      p_ticket_type_id: ticketType.id,
      p_quantity: quantity,
    })
    if (bookingError) {
      setMessage(`Booking could not be created: ${bookingError.message}`)
    } else {
      const result = data as { booking_reference?: string; status?: string } | null
      setMessage(`Booking ${result?.booking_reference ?? 'created'} is ${result?.status ?? 'ready'}. View it in My tickets.`)
    }
    setSubmitting(false)
  }

  return (
    <main className="page-main detail-main">
      <PreviewNotice />
      <div className="detail-breadcrumb"><Link to="/explore">Explore events</Link><span>/</span>{event.category}</div>
      <div className="detail-layout">
        <div className="detail-primary">
          <div className="detail-poster">{event.poster_url && <img src={event.poster_url} alt={`Poster for ${event.title}`} />}<span className="event-category">{event.category}</span></div>
          <div className="detail-title-row"><div><div className="eyebrow eyebrow-muted">{event.organizer_name}</div><h1>{event.title}</h1></div><span className="detail-share"><ArrowUpRight size={18} /></span></div>
          <div className="detail-meta"><span><CalendarDays size={17} />{formatLongDate(event.start_time)}</span><span><Clock3 size={17} />{formatTime(event.start_time)}</span><span><MapPin size={17} />{event.venue}</span></div>
          <div className="detail-description"><h2>About this event</h2><p>{event.description}</p><div className="detail-organizer"><span className="organizer-avatar">{event.organizer_name.slice(0, 1)}</span><span><small>HOSTED BY</small><b>{event.organizer_name}</b></span><ArrowUpRight size={16} /></div></div>
        </div>
        <aside className="booking-card">
          <span className="eyebrow eyebrow-muted">MAKE IT OFFICIAL</span><h2>Get your pass.</h2>
          <div className="ticket-options">{event.ticket_types.length ? event.ticket_types.map((ticket) => (
            <label className={selectedTicket === ticket.id ? 'ticket-option ticket-option-selected' : 'ticket-option'} key={ticket.id}>
              <input type="radio" name="ticket" value={ticket.id} checked={selectedTicket === ticket.id} onChange={() => setSelectedTicket(ticket.id)} />
              <span className="radio-look"><Check size={12} /></span><span className="ticket-option-name"><b>{ticket.name}</b><small>{Math.max(0, ticket.quantity_limit - ticket.quantity_sold - ticket.quantity_reserved)} available</small></span><strong>{ticket.price_minor === 0 ? 'Free' : formatMoney(ticket.price_minor, ticket.currency)}</strong>
            </label>
          )) : <div className="no-tickets">Ticket types will be announced soon.</div>}</div>
          {ticketType && available > 0 && <label className="quantity-label">Quantity <select value={quantity} onChange={(change) => setQuantity(Math.min(Number(change.target.value), available))}>{Array.from({ length: Math.min(available, 10) }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label>}
          {ticketType && <div className="booking-total"><span>Total</span><b>{ticketType.price_minor === 0 ? 'Free' : formatMoney(ticketType.price_minor * quantity, ticketType.currency)}</b></div>}
          {message && <div className="booking-message" role="status">{message}</div>}
          <button className="button button-dark button-full" type="button" disabled={!ticketType || available === 0 || submitting || (isPreview && Boolean(userEmail))} onClick={() => void bookTicket()}>{submitting ? 'Creating booking…' : !userEmail ? 'Log in to book' : isPreview ? 'Preview only' : available === 0 ? 'Sold out' : 'Get tickets'} <ArrowRight size={16} /></button>
          <p className="secure-note"><Check size={13} /> Digital tickets. No printing required.</p>
          {!isPreview && <p className="secure-note">Paid bookings use manual bank-transfer confirmation. Clicking book does not confirm payment.</p>}
        </aside>
      </div>
    </main>
  )
}

function AuthPage() {
  const { userEmail, isPreview, startDemoSession } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [isSignup, setIsSignup] = useState(new URLSearchParams(location.search).get('mode') === 'signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (userEmail) return <Navigate to="/my-tickets" replace />

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) {
      setMessage('Authentication needs a configured Supabase project. Add the VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables to get started.')
      return
    }
    setSubmitting(true)
    setMessage('')
    const result = isSignup
      ? await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } })
      : await supabase.auth.signInWithPassword({ email, password })
    if (result.error) setMessage(result.error.message)
    else if (isSignup && !result.data.session) setMessage('Account created. Check your email to confirm your address, then log in.')
    else navigate('/my-tickets')
    setSubmitting(false)
  }

  return (
    <main className="auth-page">
      <div className="auth-art"><div className="auth-art-copy"><div className="eyebrow">YOUR NEXT STORY STARTS HERE</div><h2>Be where<br />it <span className="serif-accent">happens.</span></h2><p>Discover events made for your campus, and keep every ticket close.</p></div><img src="https://images.unsplash.com/photo-1523580494863-6f3031224c94?auto=format&fit=crop&w=1100&q=85" alt="Students gathered at an event" /></div>
      <section className="auth-form-wrap">
        <div className="auth-form-heading"><span className="eyebrow eyebrow-muted">{isPreview ? 'PREVIEW ACCESS' : isSignup ? 'A BETTER KIND OF CAMPUS LIFE' : 'GOOD TO SEE YOU AGAIN'}</span><h1>{isPreview ? 'Take a look around.' : isSignup ? 'Come on in.' : 'Welcome back.'}</h1><p>{isPreview ? 'Continue as a demo attendee. No account or password needed.' : isSignup ? 'Create an account and start making plans.' : 'Log in to pick up where you left off.'}</p></div>
        {isPreview ? (
          <div className="demo-access">
            <div className="preview-inline"><Sparkles size={14} /> Demo access only. Bookings and tickets are not saved.</div>
            <button
              className="button button-dark button-full"
              type="button"
              onClick={() => {
                startDemoSession()
                navigate('/my-tickets')
              }}
            >
              Continue as demo attendee <ArrowRight size={16} />
            </button>
            <Link className="text-link demo-explore-link" to="/explore">Keep browsing without signing in</Link>
          </div>
        ) : (
          <>
            <form className="auth-form" onSubmit={(event) => void submit(event)}>
              {isSignup && <label>Your name<input autoComplete="name" required value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Ada Okonkwo" /></label>}
              <label>Email address<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
              <label>Password<input type="password" autoComplete={isSignup ? 'new-password' : 'current-password'} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></label>
              {message && <div className="inline-error" role="alert">{message}</div>}
              <button className="button button-dark button-full" type="submit" disabled={submitting}>{submitting ? 'One moment…' : isSignup ? 'Create account' : 'Log in'} <ArrowRight size={16} /></button>
            </form>
            <p className="auth-switch">{isSignup ? 'Already have an account?' : 'New around here?'} <button type="button" onClick={() => { setIsSignup(!isSignup); setMessage('') }}>{isSignup ? 'Log in' : 'Create an account'}</button></p>
            <p className="auth-terms">By continuing, you agree to our <a href="mailto:hello@campuspass.ng?subject=Terms%20and%20Conditions">terms</a> and <a href="mailto:hello@campuspass.ng?subject=Privacy%20Policy">privacy policy</a>.</p>
          </>
        )}
      </section>
    </main>
  )
}

function MyTicketsPage() {
  const { userEmail, isDemo, isPreview } = useApp()
  const [bookings, setBookings] = useState<BookingRecord[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [claimReference, setClaimReference] = useState<Record<string, string>>({})
  const [paymentInstructions, setPaymentInstructions] = useState<Record<string, PaymentInstructions>>({})
  const [notice, setNotice] = useState('')
  const [submittingClaim, setSubmittingClaim] = useState<string | null>(null)

  useEffect(() => {
    const client = supabase
    if (!client || !userEmail || isPreview) return
    let active = true
    client.auth.getUser().then(async ({ data, error: userError }) => {
      if (userError || !data.user) {
        if (active) {
          setError(userError?.message ?? 'Please sign in to view your bookings.')
          setLoading(false)
        }
        return
      }
      const { data: rows, error: bookingError } = await client
        .from('bookings')
        .select('id, booking_reference, status, total_amount_minor, currency, expires_at, created_at, events(title, venue, start_time, poster_url), booking_items(quantity, unit_price_minor, ticket_types(name)), payments(id, status)')
        .eq('user_id', data.user.id)
        .order('created_at', { ascending: false })
      if (active) {
        if (bookingError) setError(bookingError.message)
        else {
          const bookingRows = (rows ?? []) as unknown as BookingRecord[]
          setBookings(bookingRows)
          const pendingBookings = bookingRows.filter((booking) =>
            ['pending_payment', 'payment_submitted'].includes(booking.status)
            && booking.payments?.some((payment) => ['pending', 'submitted', 'rejected'].includes(payment.status)),
          )
          const instructionResults = await Promise.all(pendingBookings.map(async (booking) => {
            const { data: instructions, error: instructionError } = await client.rpc(
              'get_booking_payment_instructions',
              { p_booking_id: booking.id },
            )
            if (instructionError) return { bookingId: booking.id, error: instructionError.message }
            return isPaymentInstructions(instructions)
              ? { bookingId: booking.id, instructions }
              : { bookingId: booking.id, error: 'Payment instructions returned an invalid response.' }
          }))
          if (active) {
            const nextInstructions: Record<string, PaymentInstructions> = {}
            const instructionErrors: string[] = []
            instructionResults.forEach((result) => {
              if ('instructions' in result && result.instructions) nextInstructions[result.bookingId] = result.instructions
              else if ('error' in result) instructionErrors.push(result.error)
            })
            setPaymentInstructions(nextInstructions)
            if (instructionErrors.length) setError(`Couldn’t load payment instructions: ${instructionErrors.join('; ')}`)
          }
        }
        setLoading(false)
      }
    })
    return () => { active = false }
  }, [userEmail, isPreview])

  async function submitClaim(bookingId: string) {
    if (!supabase) return
    setSubmittingClaim(bookingId)
    setNotice('')
    const { error: claimError } = await supabase.rpc('submit_payment_claim', {
      p_booking_id: bookingId,
      p_transaction_reference: claimReference[bookingId]?.trim() || null,
    })
    if (claimError) setNotice(`Payment claim was not submitted: ${claimError.message}`)
    else {
      setNotice('Payment claim submitted. Your organizer will review it; this does not confirm payment.')
      setBookings((current) => current.map((booking) => booking.id === bookingId ? { ...booking, status: 'payment_submitted' } : booking))
    }
    setSubmittingClaim(null)
  }

  if (!userEmail) return <Navigate to="/login" replace />

  return (
    <main className="page-main tickets-page">
      <div className="eyebrow eyebrow-muted">YOUR PLANS, ALL IN ONE PLACE</div>
      <h1>My <span className="serif-accent">tickets.</span></h1>
      <p className="tickets-intro">Your next good time starts here.</p>
      {isPreview ? <div className="preview-dashboard"><Sparkles size={20} /><div><b>{isDemo ? 'You’re browsing as a demo attendee.' : 'Your tickets will live here.'}</b><p>Demo access lets you explore the app, but it does not create or save real bookings or tickets.</p></div><Link to="/explore" className="text-link">Explore events <ArrowRight size={15} /></Link></div> :
        loading ? <LoadingState /> : error ? <div className="inline-error" role="alert">{error}</div> : bookings.length ? (
          <div className="booking-list">
            {notice && <div className="booking-message" role="status">{notice}</div>}
            {bookings.map((booking) => {
              const event = booking.event
              const item = booking.booking_items?.[0]
              const paymentStatus = booking.payments?.[0]?.status
              return <article className="booking-row" key={booking.id}>
                {event?.poster_url ? <img className="booking-thumbnail" src={event.poster_url} alt="" /> : <div className="booking-thumbnail booking-thumbnail-empty"><Ticket size={22} /></div>}
                <div className="booking-info"><span className="eyebrow eyebrow-muted">{formatLongDate(event?.start_time ?? booking.created_at)}</span><h2>{event?.title ?? 'Event booking'}</h2><p><MapPin size={14} /> {event?.venue ?? 'Venue to be announced'}</p><div className="booking-reference">REF <b>{booking.booking_reference}</b> · {item?.quantity ?? 0} × {item?.ticket_types?.name ?? 'ticket'}</div></div>
                <div className="booking-side"><StatusBadge status={booking.status} /><b>{booking.total_amount_minor === 0 ? 'Free' : formatMoney(booking.total_amount_minor, booking.currency)}</b>{['pending', 'rejected'].includes(paymentStatus ?? '') && booking.status === 'pending_payment' && <label className="claim-reference">Transaction reference (optional)<input value={claimReference[booking.id] ?? ''} onChange={(event) => setClaimReference({ ...claimReference, [booking.id]: event.target.value })} placeholder="Bank transfer reference" /></label>}{['pending', 'rejected'].includes(paymentStatus ?? '') && booking.status === 'pending_payment' && <button className="button button-dark button-small" type="button" disabled={submittingClaim === booking.id} onClick={() => void submitClaim(booking.id)}>{submittingClaim === booking.id ? 'Submitting…' : paymentStatus === 'rejected' ? 'Resubmit claim' : 'I’ve paid'}</button>}</div>
                {paymentInstructions[booking.id] && booking.status !== 'confirmed' && <div className="payment-instructions"><span className="eyebrow eyebrow-muted">MANUAL BANK TRANSFER</span><div><small>ACCOUNT NAME</small><b>{paymentInstructions[booking.id].account_name}</b></div><div><small>BANK</small><b>{paymentInstructions[booking.id].bank_name}</b></div><div><small>ACCOUNT NUMBER</small><b className="account-number">{paymentInstructions[booking.id].account_number}</b></div><p>Transfer <b>{formatMoney(paymentInstructions[booking.id].amount_minor, paymentInstructions[booking.id].currency)}</b> and include <b>{paymentInstructions[booking.id].booking_reference}</b> in the narration. Then submit your payment reference below. Your ticket is issued only after the organizer confirms receipt.</p>{paymentInstructions[booking.id].payment_instructions && <p>{paymentInstructions[booking.id].payment_instructions}</p>}</div>}
              </article>
            })}
          </div>
        ) : <div className="empty-state tickets-empty"><Ticket size={26} /><b>No tickets yet.</b><span>Find something worth showing up for.</span><Link className="button button-dark" to="/explore">Explore events <ArrowRight size={16} /></Link></div>}
    </main>
  )
}

type PaymentInstructions = {
  account_name: string
  bank_name: string
  account_number: string
  payment_instructions: string | null
  amount_minor: number
  currency: string
  booking_reference: string
  expires_at: string
}

function isPaymentInstructions(value: unknown): value is PaymentInstructions {
  if (typeof value !== 'object' || value === null) return false
  return 'account_name' in value
    && typeof value.account_name === 'string'
    && 'bank_name' in value
    && typeof value.bank_name === 'string'
    && 'account_number' in value
    && typeof value.account_number === 'string'
    && 'amount_minor' in value
    && typeof value.amount_minor === 'number'
    && 'currency' in value
    && typeof value.currency === 'string'
    && 'booking_reference' in value
    && typeof value.booking_reference === 'string'
    && 'expires_at' in value
    && typeof value.expires_at === 'string'
    && 'payment_instructions' in value
    && (typeof value.payment_instructions === 'string' || value.payment_instructions === null)
}

function StatusBadge({ status }: { status: string }) {
  const label = status.replaceAll('_', ' ')
  return <span className={`status-badge status-${status}`}>{label}</span>
}

function LoadingState() {
  return <div className="loading-state" role="status"><span className="loading-spinner" />Finding the good stuff…</div>
}

function NotFoundPage() {
  return <main className="page-main"><div className="empty-state event-not-found"><b>This page took a wrong turn.</b><span>Let’s get you back to the good stuff.</span><Link className="text-link" to="/">Back to home <ArrowRight size={16} /></Link></div></main>
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-brand"><Link className="brand brand-footer" to="/"><span className="brand-mark"><Ticket size={17} strokeWidth={2.5} /></span><span>campus<span className="brand-light">pass</span></span></Link><p>Little moments. Big memories.<br />Made for the campus life.</p></div>
        <div className="footer-links"><div><b>DISCOVER</b><Link to="/explore">Explore events</Link><a href="/#how-it-works">How it works</a></div><div><b>FOR ORGANIZERS</b><a href="/#organizers">Host an event</a><a href="mailto:hello@campuspass.ng">Get in touch</a></div><div><b>THE DETAILS</b><a href="mailto:hello@campuspass.ng?subject=Privacy%20Policy">Privacy</a><a href="mailto:hello@campuspass.ng?subject=Terms%20and%20Conditions">Terms</a></div></div>
      </div>
      <div className="footer-bottom"><span>© 2026 CampusPass. Made for moments.</span><span><MapPin size={13} /> FUT Minna, Nigeria</span></div>
    </footer>
  )
}

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' }).format(new Date(date))
}

function formatDateInput(date: string) {
  const parts = new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Africa/Lagos',
  }).formatToParts(new Date(date))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function formatLongDate(date: string) {
  return new Intl.DateTimeFormat('en-NG', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' }).format(new Date(date))
}

function formatTime(date: string) {
  return new Intl.DateTimeFormat('en-NG', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Lagos' }).format(new Date(date))
}

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amountMinor / 100)
}

export default App
