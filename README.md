# CampusPass

CampusPass is a responsive event-discovery and digital ticketing app for FUT Minna. The current frontend includes event discovery, search and filters, event details, attendee registration/login, ticket booking requests, and a personal booking list.

## Run locally

```sh
npm install
npm run dev
```

The app runs in **preview mode** until Supabase is configured. Preview mode uses clearly labelled sample event listings and provides a no-password demo attendee session for browsing protected screens. Demo sessions are stored only in the current browser tab; they cannot create or save bookings, payments, or tickets.

## Supabase configuration

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local`.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the project's public URL and anon/publishable key.
4. Restart the Vite dev server.

Only the public anon/publishable key belongs in this frontend. Never expose a service-role key in `VITE_*` variables or browser code.

Apply the SQL migration in `supabase/migrations/` to create the core schema, indexes, Row Level Security, and transactional booking/payment functions. Authenticated bookings call `create_booking(p_ticket_type_id, p_quantity)`; payment claims call `submit_payment_claim(p_booking_id, p_transaction_reference)`. The attendee booking page loads private payment details through `get_booking_payment_instructions(p_booking_id)`. Payment review uses `confirm_payment` and `reject_payment`; these verify organizer ownership and record decisions. The frontend deliberately does not directly update inventory, confirm payments, or mark tickets as redeemed.

Run `expire_pending_bookings()` on a trusted schedule (for example, with Supabase Cron) so expired reservations release inventory. Never grant this operation to browser users. New accounts receive the attendee role; organizer profiles and admin privileges must be provisioned through trusted administrative operations. Before the first public launch, seed/approve organizers and create published events, ticket types, and their private payment accounts.

## Current scope and remaining setup

- Live event discovery, authentication, and booking history need configured Supabase credentials and migrated/seeded database records.
- Free bookings and paid reservations are created transactionally by `create_booking`; paid bookings expire after 20 minutes unless reviewed in time.
- A paid reservation remains pending until an authorized organizer verifies a manual transfer. Payment claims are not payment confirmation.
- QR tokens are stored as hashes; displaying/scanning the raw token, ticket redemption, secure evidence storage, organizer/admin dashboard pages, notifications, refunds, and audit reports remain future implementation work.

## Checks

```sh
npm run build
npm run lint
```
