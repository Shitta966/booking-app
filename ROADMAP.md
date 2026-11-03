# FUTICK — roadmap to production

Starting point (November 2026): a working MVP. Public event listing and booking, attendee QR tickets, manual bank-transfer payments with organiser confirmation, organiser dashboard (events, ticket types, planning checklist, attendees CSV, team roles), a camera QR scanner with duplicate protection, multi-tenant organisations with plans and limits, and a super admin console. Runs on PostgreSQL in production and on embedded PGlite for local development.

The phases below assume one or two full-time developers. Each phase ends with something that can be deployed.

---

## Phase 1 — Harden the core (weeks 1–3)

Goal: safe to put real student and staff data in it.

- **Email**: transactional email provider (Resend, Postmark or SES) for sign-up verification, password reset, ticket delivery, payment confirmed/rejected, organisation approved/suspended, team invitations. There is no self-service password reset yet; today a super admin sets new passwords.
- **Account security**: email verification before booking; TOTP two-factor for super admins and organisation owners (the template already has a 2FA module to port). *Done already: log-in lockout, rate limits, password rules, CSP with nonces, origin checks, session revocation.*
- **Database**: replace the idempotent `schema.sql` with versioned migrations (e.g. node-pg-migrate) and a migration step in deploys; daily automated backups with a tested restore.
- **Scheduled jobs**: expire unpaid reservations on a timer (currently expired lazily whenever orders are read or created); nightly "mark past events completed".
- **Tests**: integration tests against real PostgreSQL for booking, inventory, payment review, cancellation and check-in races; end-to-end tests (Playwright) for the attendee, organiser, scanner and super admin journeys; CI on every push.
- **Observability**: error tracking (Sentry), structured logs, uptime monitoring on `/api/health`.
- **Web security**: Content-Security-Policy, HSTS, hardened cookies behind the production domain, dependency scanning.
- **Legal**: privacy policy and terms aligned with the Nigeria Data Protection Act 2023; data-retention rules for attendee data; consent for sharing attendee details with organisers.

## Phase 2 — Online payments and billing (weeks 3–6)

Goal: remove manual transfer checks and make the SaaS earn money.

- **Paystack checkout for tickets**, with a Paystack subaccount per organisation so money settles directly to the organiser and the platform fee is split automatically. Webhook verification; idempotent order confirmation.
- Keep manual bank transfer as an optional fallback per organisation.
- **Refunds and cancellations**: event-cancelled flow that notifies holders and refunds through Paystack; partial refunds; refund audit trail.
- **Plan subscriptions**: Paystack recurring billing for Pro and Enterprise; automatic downgrade or grace period when payment fails; invoices and receipts.
- **Finance reporting** for super admins: gross sales, platform fees, payouts and refunds per organisation, exportable for accounting.

## Phase 3 — Gate operations at scale (weeks 5–8)

Goal: convocation-sized events with poor network at the gate.

- **Offline scanning** (the app is already installable as a PWA, with push notifications): download the event's ticket list (IDs and status only) before doors open, verify signatures on the device, queue check-ins, sync when back online, flag conflicts.
- Multiple gates and scanner devices per event, with per-gate counts and a live dashboard.
- Re-entry rules (pass-out/pass-in), wristband/zone tickets, VIP lanes.
- Ticket delivery by email and WhatsApp/SMS, PDF tickets, Apple/Google Wallet passes.
- Named tickets: holders can assign guest tickets to another email; organisers can reissue a lost ticket and void the old QR.
- Load test: 5,000 check-ins within 30 minutes, and booking spikes when popular events open.

## Phase 4 — Corporate event planning (weeks 7–10)

Goal: cover the planning side, not just ticketing.

- Budgets (planned against actual), vendors and quotes, sponsor packages.
- Agenda builder with sessions, speakers and rooms; public agenda on the event page.
- Invite-only events: CSV guest-list import, RSVP links, approval queues for registrations.
- University workflow: optional sign-off steps (e.g. venue booking with Works, security with Student Affairs) before an event can be published.
- Post-event reports: attendance by ticket type, no-show rate, revenue, feedback survey.

## Phase 5 — Pilot and launch (weeks 10–12)

- **Pilot** with two or three organisations (for example Career Services, one faculty and one corporate partner) on real events; weekly feedback loop.
- External security review / penetration test of auth, tenant isolation, payments and check-in.
- Production hosting: managed PostgreSQL in or near West Africa, app on Docker (Render, Fly.io, Railway or a VPS) or Vercel, CDN for images, the `futick.ng` domain and TLS.
- Move poster uploads from the database (`uploads` table) to object storage with a CDN, and add organisation logo uploads.
- Operations: status page, support inbox, incident runbook, on-call for big event days, super admin training.
- Public launch alongside a major university event.

## After launch

- Analytics dashboard for organisations and the platform.
- Custom domains and white-label branding per organisation (the template has a white-label module).
- Public API and webhooks for partner systems; university SSO if the institution provides one.
- Native mobile app (React Native / Expo, or Capacitor around the PWA): add a versioned JSON API with token auth beside the existing server actions, native push (FCM/APNs) alongside web push, and an offline-first scanner.

---

## Launch checklist

- [ ] `SESSION_SECRET`, `TICKET_SIGNING_SECRET` and the database credentials are in a secret manager, and each is different per environment
- [ ] First super admin created from environment variables, with 2FA turned on
- [ ] `FUTICK_SEED_DEMO` is unset in production, and the demo accounts don't exist
- [ ] Migrations run automatically on deploy, and a backup restore has been rehearsed
- [ ] Paystack is live, webhooks are verified, and a refund has been tested end to end
- [ ] Email deliverability checked (SPF, DKIM, DMARC)
- [ ] The scanner has been tested on low-end Android phones in daylight and at night
- [ ] Privacy policy and terms published; data-processing roles agreed with organisations
- [ ] Monitoring, alerting and the incident runbook are in place

## Decisions needed from the FUTICK owners

1. Who holds the Paystack account and receives platform fees: the university, a student enterprise or a company.
2. Final plan prices, platform fee percentages and whether student-body events are free.
3. Hosting budget and preferred provider.
4. Who at FUT Minna approves organisations (the super admin team) and its approval criteria.
5. Whether university sign-off is mandatory before events are published.
