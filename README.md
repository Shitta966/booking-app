# FUTICK

Corporate event planning, ticketing and QR check-in for the Federal University of Technology, Minna — run as a multi-tenant SaaS.

Faculties, departments, student bodies and partner companies register as **organisations** (tenants). A FUTICK **super admin** verifies them, assigns plans and can manage everything on the platform. Organisers plan events, sell free or paid tickets, and their gate staff scan attendees' QR codes at the entrance.

Built on the structure of the `poultry-management` SaaS template (Next.js App Router, signed-session auth, tenant roles, plans, super admin console, Docker), with the ticketing rules carried over from `booking-app`.

## Who can do what

| Role | Where | Can |
|---|---|---|
| Attendee | `/events`, `/tickets` | Browse, book, pay by bank transfer, show QR tickets |
| Gate scanner | `/dashboard/<org>/scan` | Scan QR codes or type ticket codes; nothing else |
| Organizer | `/dashboard/<org>` | Events, ticket types, planning checklist, payment review, attendee export, scanning |
| Admin / Owner | `/dashboard/<org>` | Everything above, plus team and bank settings (only the owner adds admins) |
| Super admin | `/admin` | Approve/suspend organisations, change plans, transfer ownership, manage users, feature/cancel any event, edit plans and limits, branding and homepage, platform switches, audit log; open any organisation's dashboard |

## Run locally

```bash
npm install
cp .env.example .env.local   # FUTICK_SEED_DEMO="true" fills the database with demo data
npm run dev
```

Open http://localhost:3000. Without `DATABASE_URL` the app uses an embedded PostgreSQL (PGlite) stored in `~/.futick` (outside the project, so the dev server does not reload every time the database writes), so nothing else needs installing. Demo accounts and their shared development password are listed at the top of `src/lib/seed.ts`. Delete `~/.futick` to start again from a fresh seed.

## Production

1. Create a PostgreSQL 15+ database (Supabase, Neon, RDS or self-hosted) and set `DATABASE_URL`. The schema in `db/schema.sql` is applied automatically on start and is safe to re-run.
2. Set `SESSION_SECRET` and `TICKET_SIGNING_SECRET` (32+ random characters each, different values). The app refuses to start in production without them.
3. Set `FUTICK_SUPERADMIN_EMAIL` and `FUTICK_SUPERADMIN_PASSWORD` (12+ characters) for the first super admin. Leave `FUTICK_SEED_DEMO` unset.
4. `docker build -t futick . && docker run -p 3000:3000 --env-file .env.production futick`, or `npm run build && npm start` on any Node 22 host.
5. Health check: `GET /api/health`.

### Using Supabase as the database

FUTICK uses Supabase as a managed PostgreSQL database; Supabase Auth, Storage and the REST API are not used.

1. In Supabase, create a project (pick a region close to Nigeria, e.g. EU West or South Africa) and note the database password.
2. In the dashboard, click **Connect** and copy a pooler connection string (host `…pooler.supabase.com`). The direct connection is IPv6-only on most plans.
   - **Vercel (serverless):** the **Transaction pooler**, port `6543`.
   - **Docker or a VPS (long-running server):** the **Session pooler**, port `5432`.
3. Set it as `DATABASE_URL` (in Vercel's environment variables, or `.env.local`), replacing `[YOUR-PASSWORD]`:
   ```env
   DATABASE_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres"
   ```
4. Start the app. The schema is created automatically. Every table has Row Level Security turned on with no policies, and Supabase's `anon` and `authenticated` roles are revoked. The public REST API therefore cannot read FUTICK data, while the app, connecting as the table owner, works normally.
5. Never put the database password or a `service_role` key in a `NEXT_PUBLIC_*` variable.

Data in the local development database (`~/.futick`) is not copied to Supabase; a new database starts empty, plus the super admin from your environment variables.

### Deploy to Vercel

1. In Vercel, **Add New → Project** and import the GitHub repository. `vercel.json` sets the framework to Next.js, the install command to `npm ci` and the build command to `npm run build`, overriding whatever the dashboard says (this repository was first deployed as a Vite app). `package.json` pins Node 24 (match it under Settings → Build and Deployment → Node.js Version).
2. Under **Settings → Environment Variables**, add everything marked *required* in `.env.example`:
   - `DATABASE_URL` (Supabase Transaction pooler);
   - `SESSION_SECRET` and `TICKET_SIGNING_SECRET`;
   - `FUTICK_SUPERADMIN_EMAIL` and `FUTICK_SUPERADMIN_PASSWORD`;
   - `NEXT_PUBLIC_APP_URL`;
   - optionally the three `VAPID_*` keys for push.
   Do not set `FUTICK_SEED_DEMO`.
3. Deploy. The first request creates the tables in Supabase and the super admin account; `/api/health` should report `"database":"postgres"`.
4. Notes: poster uploads are capped at 4 MB to stay under Vercel's 4.5 MB request limit, and each function keeps at most 2 database connections (`DATABASE_POOL_SIZE`).

See `ROADMAP.md` for what still has to happen before a public launch.

## Notifications

- **In-app alerts:** the bell in every header checks for new notifications every 20 seconds and when the tab regains focus. New ones pop up as toasts; `/notifications` lists the last 100.
- **Browser push:** each user turns it on per device (bell dropdown or `/account`). A service worker (`public/sw.js`) shows the alert even when FUTICK is closed; tapping it opens the right page. Set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in production (`npx web-push generate-vapid-keys`). On iPhone, push works once FUTICK is added to the Home Screen (iOS 16.4+).
- **What triggers them:**
  - payment submitted → the organiser's team;
  - tickets issued, payment rejected, or order cancelled → the attendee;
  - event cancelled → every ticket holder;
  - new organisation → super admins;
  - approved or suspended → the organisation's owners;
  - added to a team → that person;
  - password changed → the account owner.

## Security

- Signed session cookies (HttpOnly, SameSite=Lax, Secure in production). Changing a password, suspension, or "sign out everywhere" revokes all sessions.
- Log-in lockout after 5 failed attempts per account in 15 minutes, plus per-IP limits on log-in and sign-up, and per-user limits on bookings, payment claims, uploads, push sign-ups and gate scans. Limits are stored in the database so they hold across servers. Put the app behind a proxy that sets `X-Forwarded-For` for the per-IP limits to apply.
- Passwords: at least 10 characters, common passwords rejected, bcrypt cost 12.
- Content-Security-Policy with a fresh script nonce on every request, plus X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, and HSTS in production. JSON API routes reject cross-site requests; server actions are origin-checked by Next.js.
- Uploaded images are identified by their contents (not their name) and served with `nosniff` and a sandboxing CSP.

## Mobile and installable app

FUTICK is a Progressive Web App: it has a manifest, home-screen icons and a service worker, so it installs to Android and iPhone home screens and opens full-screen. On phones:
- dashboards get a bottom tab bar;
- tables turn into stacked cards;
- layouts respect the notch and home-bar areas;
- form fields are large enough that iOS doesn't zoom in.

The server actions and JSON routes are the starting point for a native app API (see `ROADMAP.md`).

## How tickets are secured

- A ticket's QR code holds `FTK1.<ticket id>.<HMAC signature>`. It cannot be forged or edited without `TICKET_SIGNING_SECRET`, and no secret is stored in the database.
- Every ticket also has an 8-character code (e.g. `K7QD-M2XP`) for manual entry when a phone screen won't scan.
- Check-in is a single conditional update (`status = 'valid'` → `checked_in`), so a ticket is admitted once even if two gates scan it at the same moment. Every attempt — admitted, duplicate, cancelled, wrong event, invalid — is logged in `check_ins`.
- Paid orders hold inventory for a configurable window (default 30 minutes). Attendees submit their transfer reference; an organiser confirms against the bank statement, which issues the tickets.

## Project layout

```
db/schema.sql                 PostgreSQL schema, default plans and settings
src/lib/                      db (pg / PGlite), auth + sessions, permissions, orders, check-in, ticket signing, seed
src/app/(site)/               public site, sign-up, event pages, My tickets, orders
src/app/dashboard/[orgId]/    organiser dashboard (events, orders, scanner, team, settings)
src/app/admin/                super admin console
src/app/actions/              server actions (auth, attendee, org, admin)
src/app/api/                  check-in, attendee CSV export, health
tests/                        ticket signing tests (npm test)
```

## Checks

```bash
npm run typecheck
npm test
npm run build
```
