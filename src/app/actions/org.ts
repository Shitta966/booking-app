'use server'

import { redirect, unstable_rethrow } from 'next/navigation'
import { audit } from '@/lib/audit'
import { requireOrgAccess, type OrgAccess } from '@/lib/auth'
import { query, queryOne, transaction } from '@/lib/db'
import { fromLagosInput, nairaToMinor } from '@/lib/format'
import { back, errorMessage, text } from '@/lib/forms'
import { notify, notifyEventCancelled, orgStaff } from '@/lib/notify'
import { getSettings } from '@/lib/settings'
import { sendRewardNotices } from '@/lib/rewards'
import { cancelOrderAsOrganizer, confirmOrder, rejectPayment } from '@/lib/orders'
import { EVENT_CATEGORIES } from '@/lib/events'
import { saveImageUpload, UploadError } from '@/lib/uploads'
import { hit } from '@/lib/rateLimit'
import type { OrgAction, OrgRole } from '@/lib/permissions'

type Plan = { max_events: number | null; max_tickets_per_event: number | null; max_team_members: number | null; name: string }

/** Resolves the caller's access for a mutation and blocks writes to suspended tenants. */
async function access(form: FormData, action: OrgAction, returnTo: string): Promise<OrgAccess> {
  const orgId = text(form, 'org_id', 64)
  try {
    const result = await requireOrgAccess(orgId, action)
    if (result.org.status === 'suspended' && !result.viaSuperAdmin) throw new Error('This organisation is suspended.')
    return result
  } catch (error) {
    unstable_rethrow(error)
    back(returnTo, { error: errorMessage(error) })
  }
}

async function plan(planId: string) {
  return (await queryOne<Plan>('select name, max_events, max_tickets_per_event, max_team_members from plans where id = $1', [planId]))!
}

function readEventForm(form: FormData) {
  const start = fromLagosInput(text(form, 'start_time', 20))
  const end = fromLagosInput(text(form, 'end_time', 20))
  const category = text(form, 'category', 40)
  const fields = {
    title: text(form, 'title', 140),
    summary: text(form, 'summary', 280),
    description: text(form, 'description', 8000),
    category: EVENT_CATEGORIES.includes(category) ? category : 'Other',
    venue: text(form, 'venue', 200),
    visibility: form.get('visibility') === 'unlisted' ? 'unlisted' : 'public',
    acceptsRewards: form.get('accepts_reward_coupons') === 'on',
    start, end,
  }
  if (fields.title.length < 3) return { error: 'Give the event a title.' } as const
  if (fields.venue.length < 2) return { error: 'Add a venue.' } as const
  if (!start || !end) return { error: 'Enter a valid start and end time.' } as const
  if (end <= start) return { error: 'The event must end after it starts.' } as const
  return { fields } as const
}

/** Returns the poster URL to store: a fresh upload, null when removed, or the current one when unchanged. */
async function readPoster(form: FormData, orgId: string, userId: string, current: string | null, returnTo: string) {
  const file = form.get('poster')
  if (file instanceof File && file.size > 0) {
    if (!(await hit(`upload:${userId}`, 30, 3600))) back(returnTo, { error: 'Too many uploads. Try again later.' })
    try {
      return await saveImageUpload(file, orgId, userId)
    } catch (error) {
      if (error instanceof UploadError) back(returnTo, { error: error.message })
      throw error
    }
  }
  return form.get('remove_poster') === 'on' ? null : current
}

export async function createEvent(form: FormData) {
  const orgId = text(form, 'org_id', 64)
  const { org, user } = await access(form, 'events.manage', `/dashboard/${orgId}/events/new`)
  const limits = await plan(org.plan_id)
  const [{ count }] = await query<{ count: number }>(`select count(*) as count from events where org_id = $1 and status in ('draft', 'published')`, [org.id])
  if (limits.max_events !== null && count >= limits.max_events) {
    back(`/dashboard/${org.id}/events/new`, { error: `The ${limits.name} plan allows ${limits.max_events} active events. Complete or cancel one, or upgrade your plan.` })
  }
  const parsed = readEventForm(form)
  if ('error' in parsed) back(`/dashboard/${org.id}/events/new`, { error: parsed.error })
  const { fields } = parsed
  const poster = await readPoster(form, org.id, user.id, null, `/dashboard/${org.id}/events/new`)
  const [event] = await query<{ id: string }>(
    `insert into events (org_id, title, summary, description, category, venue, start_time, end_time, poster_url, visibility, created_by, accepts_reward_coupons)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
    [org.id, fields.title, fields.summary, fields.description, fields.category, fields.venue, fields.start, fields.end, poster, fields.visibility, user.id, fields.acceptsRewards],
  )
  await audit({ actorId: user.id, orgId: org.id, action: 'event.created', entityType: 'event', entityId: event.id })
  redirect(`/dashboard/${org.id}/events/${event.id}?tab=tickets&ok=${encodeURIComponent('Event created as a draft. Add ticket types, then publish.')}`)
}

async function ownedEvent(orgId: string, eventId: string) {
  return queryOne<{ id: string; status: string; title: string; poster_url: string | null }>('select id, status, title, poster_url from events where id = $1 and org_id = $2', [eventId, orgId])
}

export async function updateEvent(form: FormData) {
  const eventId = text(form, 'event_id', 64)
  const orgId = text(form, 'org_id', 64)
  const path = `/dashboard/${orgId}/events/${eventId}`
  const { org, user } = await access(form, 'events.manage', path)
  const existing = await ownedEvent(org.id, eventId)
  if (!existing) back(`/dashboard/${org.id}/events`, { error: 'Event not found.' })
  const parsed = readEventForm(form)
  if ('error' in parsed) back(path, { error: parsed.error })
  const { fields } = parsed
  const poster = await readPoster(form, org.id, user.id, existing.poster_url, path)
  await query(
    `update events set title = $3, summary = $4, description = $5, category = $6, venue = $7, start_time = $8, end_time = $9,
       poster_url = $10, visibility = $11, accepts_reward_coupons = $12, updated_at = now() where id = $1 and org_id = $2`,
    [eventId, org.id, fields.title, fields.summary, fields.description, fields.category, fields.venue, fields.start, fields.end, poster, fields.visibility, fields.acceptsRewards],
  )
  await audit({ actorId: user.id, orgId: org.id, action: 'event.updated', entityType: 'event', entityId: eventId })
  back(path, { ok: 'Event saved.' })
}

export async function setEventStatus(form: FormData) {
  const eventId = text(form, 'event_id', 64)
  const orgId = text(form, 'org_id', 64)
  const status = text(form, 'status', 20)
  const path = `/dashboard/${orgId}/events/${eventId}`
  const { org, user, viaSuperAdmin } = await access(form, 'events.manage', path)
  const event = await ownedEvent(org.id, eventId)
  if (!event || !['draft', 'published', 'cancelled', 'completed'].includes(status)) back(path, { error: 'Invalid status change.' })
  if (status === 'published') {
    if (org.status !== 'active' && !viaSuperAdmin) back(path, { error: 'Your organisation must be verified before events can be published.' })
    const [{ count }] = await query<{ count: number }>('select count(*) as count from ticket_types where event_id = $1 and is_active', [eventId])
    if (count === 0) back(`${path}?tab=tickets`, { error: 'Add at least one ticket type before publishing.' })
  }
  if (status === 'draft') {
    const [{ count }] = await query<{ count: number }>(`select count(*) as count from orders where event_id = $1 and status <> 'expired'`, [eventId])
    if (count > 0) back(path, { error: 'Events with orders cannot go back to draft. Cancel the event instead.' })
  }
  await query('update events set status = $2, updated_at = now() where id = $1', [eventId, status])
  await audit({ actorId: user.id, orgId: org.id, action: `event.${status}`, entityType: 'event', entityId: eventId })
  if (status === 'cancelled') await notifyEventCancelled(eventId, event.title, org.name)
  back(path, { ok: `Event ${status === 'published' ? 'published' : `marked ${status}`}.` })
}

export async function deleteEvent(form: FormData) {
  const eventId = text(form, 'event_id', 64)
  const orgId = text(form, 'org_id', 64)
  const { org, user } = await access(form, 'events.manage', `/dashboard/${orgId}/events/${eventId}`)
  const event = await ownedEvent(org.id, eventId)
  if (!event || event.status !== 'draft') back(`/dashboard/${org.id}/events/${eventId}`, { error: 'Only draft events can be deleted.' })
  await query('delete from events where id = $1 and org_id = $2', [eventId, org.id])
  await audit({ actorId: user.id, orgId: org.id, action: 'event.deleted', entityType: 'event', entityId: eventId, metadata: { title: event.title } })
  back(`/dashboard/${org.id}/events`, { ok: 'Draft deleted.' })
}

export async function saveTicketType(form: FormData) {
  const eventId = text(form, 'event_id', 64)
  const orgId = text(form, 'org_id', 64)
  const ticketTypeId = text(form, 'ticket_type_id', 64)
  const path = `/dashboard/${orgId}/events/${eventId}?tab=tickets`
  const { org, user } = await access(form, 'events.manage', path)
  if (!(await ownedEvent(org.id, eventId))) back(path, { error: 'Event not found.' })

  const name = text(form, 'name', 80)
  const price = nairaToMinor(text(form, 'price', 20) || '0')
  const total = Number(form.get('quantity_total'))
  const maxPerOrder = Number(form.get('max_per_order') || 10)
  const salesEndRaw = text(form, 'sales_end', 20)
  const salesEnd = salesEndRaw ? fromLagosInput(salesEndRaw) : null
  if (name.length < 2) back(path, { error: 'Name the ticket type.' })
  if (price === null) back(path, { error: 'Enter a valid price in naira (0 for free).' })
  if (!Number.isInteger(total) || total < 1) back(path, { error: 'Capacity must be a whole number of at least 1.' })
  if (!Number.isInteger(maxPerOrder) || maxPerOrder < 1 || maxPerOrder > 50) back(path, { error: 'Max per order must be between 1 and 50.' })
  if (salesEndRaw && !salesEnd) back(path, { error: 'Enter a valid sales end time.' })

  const limits = await plan(org.plan_id)
  const [{ sum }] = await query<{ sum: number }>(
    'select coalesce(sum(quantity_total), 0) as sum from ticket_types where event_id = $1 and id::text <> $2',
    [eventId, ticketTypeId || '00000000-0000-0000-0000-000000000000'],
  )
  if (limits.max_tickets_per_event !== null && sum + total > limits.max_tickets_per_event) {
    back(path, { error: `The ${limits.name} plan allows ${limits.max_tickets_per_event} tickets per event in total.` })
  }

  if (ticketTypeId) {
    const updated = await query(
      `update ticket_types set name = $3, description = $4, price_minor = $5, quantity_total = $6, max_per_order = $7, sales_end = $8
       where id = $1 and event_id = $2 and quantity_sold + quantity_reserved <= $6
         and (price_minor = $5 or quantity_sold + quantity_reserved = 0) returning id`,
      [ticketTypeId, eventId, name, text(form, 'description', 200), price, total, maxPerOrder, salesEnd],
    )
    if (!updated.length) back(path, { error: 'Capacity cannot go below tickets already sold, and price cannot change once tickets are sold.' })
  } else {
    await query(
      `insert into ticket_types (event_id, name, description, price_minor, quantity_total, max_per_order, sales_end, sort_order)
       values ($1, $2, $3, $4, $5, $6, $7, (select coalesce(max(sort_order), 0) + 1 from ticket_types where event_id = $1))`,
      [eventId, name, text(form, 'description', 200), price, total, maxPerOrder, salesEnd],
    )
  }
  if (price! > 0 && !org.account_number) {
    await audit({ actorId: user.id, orgId: org.id, action: 'ticket_type.saved', entityType: 'event', entityId: eventId })
    back(path, { ok: 'Ticket type saved. Add your bank details in Settings so attendees can pay for it.' })
  }
  await audit({ actorId: user.id, orgId: org.id, action: 'ticket_type.saved', entityType: 'event', entityId: eventId })
  back(path, { ok: 'Ticket type saved.' })
}

export async function toggleTicketType(form: FormData) {
  const eventId = text(form, 'event_id', 64)
  const orgId = text(form, 'org_id', 64)
  const path = `/dashboard/${orgId}/events/${eventId}?tab=tickets`
  const { org } = await access(form, 'events.manage', path)
  await query(
    `update ticket_types t set is_active = not t.is_active from events e where t.id = $1 and t.event_id = e.id and e.org_id = $2`,
    [text(form, 'ticket_type_id', 64), org.id],
  )
  back(path, { ok: 'Ticket availability updated.' })
}

export async function addTask(form: FormData) {
  const eventId = text(form, 'event_id', 64)
  const orgId = text(form, 'org_id', 64)
  const path = `/dashboard/${orgId}/events/${eventId}?tab=planning`
  const { org } = await access(form, 'events.manage', path)
  if (!(await ownedEvent(org.id, eventId))) back(path, { error: 'Event not found.' })
  const title = text(form, 'title', 200)
  const due = text(form, 'due_date', 10)
  if (title.length < 2) back(path, { error: 'Describe the task.' })
  await query('insert into event_tasks (event_id, title, assignee, due_date) values ($1, $2, $3, $4)',
    [eventId, title, text(form, 'assignee', 80), /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null])
  back(path, { ok: 'Task added.' })
}

export async function updateTask(form: FormData) {
  const eventId = text(form, 'event_id', 64)
  const orgId = text(form, 'org_id', 64)
  const path = `/dashboard/${orgId}/events/${eventId}?tab=planning`
  const { org } = await access(form, 'events.manage', path)
  const taskId = text(form, 'task_id', 64)
  const status = text(form, 'status', 10)
  if (status === 'delete') {
    await query('delete from event_tasks t using events e where t.id = $1 and t.event_id = e.id and e.org_id = $2', [taskId, org.id])
  } else if (['todo', 'doing', 'done'].includes(status)) {
    await query('update event_tasks t set status = $3 from events e where t.id = $1 and t.event_id = e.id and e.org_id = $2', [taskId, org.id, status])
  }
  back(path, {})
}

export async function reviewOrder(form: FormData) {
  const orgId = text(form, 'org_id', 64)
  const returnTo = text(form, 'return_to', 300) || `/dashboard/${orgId}/orders`
  const path = returnTo.startsWith(`/dashboard/${orgId}`) ? returnTo : `/dashboard/${orgId}/orders`
  const { org, user } = await access(form, 'orders.review', path)
  const orderId = text(form, 'order_id', 64)
  const decision = text(form, 'decision', 20)
  const order = await queryOne<{ user_id: string; reference: string; title: string }>(
    'select o.user_id, o.reference, e.title from orders o join events e on e.id = o.event_id where o.id = $1 and o.org_id = $2', [orderId, org.id])
  try {
    if (decision === 'confirm') await sendRewardNotices(await confirmOrder(org.id, user.id, orderId))
    else if (decision === 'reject') await rejectPayment(org.id, user.id, orderId, text(form, 'note', 300))
    else if (decision === 'cancel') await cancelOrderAsOrganizer(org.id, user.id, orderId)
    else throw new Error('Unknown decision.')
  } catch (error) {
    back(path, { error: errorMessage(error) })
  }
  if (order) {
    if (decision === 'confirm') await notify([order.user_id], { kind: 'order.paid', title: 'Payment confirmed — your tickets are ready', body: `${order.title} · order ${order.reference}`, href: '/tickets' })
    if (decision === 'reject') await notify([order.user_id], { kind: 'payment.rejected', title: 'Your transfer could not be verified', body: text(form, 'note', 300) || `Please check order ${order.reference} and submit the transfer reference again.`, href: `/orders/${orderId}` })
    if (decision === 'cancel') await notify([order.user_id], { kind: 'order.cancelled', title: 'Your order was cancelled', body: `${org.name} cancelled order ${order.reference} for ${order.title}.`, href: '/tickets' })
  }
  back(path, { ok: decision === 'confirm' ? 'Payment confirmed and tickets issued.' : decision === 'reject' ? 'Payment rejected. The attendee has been asked to resubmit.' : 'Order cancelled.' })
}

export async function inviteMember(form: FormData) {
  const orgId = text(form, 'org_id', 64)
  const path = `/dashboard/${orgId}/team`
  const { org, user, role: myRole } = await access(form, 'team.manage', path)
  const email = text(form, 'email', 200).toLowerCase()
  const role = text(form, 'role', 20) as OrgRole
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back(path, { error: 'Enter a valid email address.' })
  if (!['admin', 'organizer', 'scanner'].includes(role)) back(path, { error: 'Choose a role.' })
  if (role === 'admin' && myRole !== 'owner') back(path, { error: 'Only the owner can add admins.' })
  const limits = await plan(org.plan_id)
  const [{ count }] = await query<{ count: number }>(
    `select (select count(*) from organization_members where org_id = $1) + (select count(*) from invitations where org_id = $1 and accepted_at is null) as count`,
    [org.id],
  )
  if (limits.max_team_members !== null && count >= limits.max_team_members) back(path, { error: `The ${limits.name} plan allows ${limits.max_team_members} team members.` })

  const existing = await queryOne<{ id: string }>('select id from users where email = $1', [email])
  if (existing) {
    await notify([existing.id], { kind: 'team.added', title: `You joined ${org.name}`, body: `You were added as ${role}. Open the dashboard to get started.`, href: `/dashboard/${org.id}` })
    await query(
      `insert into organization_members (org_id, user_id, role) values ($1, $2, $3) on conflict (org_id, user_id) do nothing`,
      [org.id, existing.id, role],
    )
  } else {
    await query(
      `insert into invitations (org_id, email, role, invited_by) values ($1, $2, $3, $4)
       on conflict (org_id, email) do update set role = excluded.role, accepted_at = null`,
      [org.id, email, role, user.id],
    )
  }
  await audit({ actorId: user.id, orgId: org.id, action: 'team.invited', entityType: 'user', entityId: existing?.id ?? null, metadata: { email, role } })
  back(path, { ok: existing ? `${email} now has access.` : `Invitation saved. ${email} gets access as soon as they sign up with that email.` })
}

export async function updateMember(form: FormData) {
  const orgId = text(form, 'org_id', 64)
  const path = `/dashboard/${orgId}/team`
  const { org, user, role: myRole } = await access(form, 'team.manage', path)
  const memberId = text(form, 'user_id', 64)
  const role = text(form, 'role', 20)
  const target = await queryOne<{ role: OrgRole }>('select role from organization_members where org_id = $1 and user_id = $2', [org.id, memberId])
  if (!target) back(path, { error: 'Member not found.' })
  if (target.role === 'owner') back(path, { error: 'The owner cannot be changed here. A super admin can transfer ownership.' })
  if ((target.role === 'admin' || role === 'admin') && myRole !== 'owner') back(path, { error: 'Only the owner can change admins.' })
  if (role === 'remove') {
    await query('delete from organization_members where org_id = $1 and user_id = $2', [org.id, memberId])
  } else if (['admin', 'organizer', 'scanner'].includes(role)) {
    await query('update organization_members set role = $3 where org_id = $1 and user_id = $2', [org.id, memberId, role])
  }
  await audit({ actorId: user.id, orgId: org.id, action: role === 'remove' ? 'team.removed' : 'team.role_changed', entityType: 'user', entityId: memberId, metadata: { role } })
  back(path, { ok: 'Team updated.' })
}

export async function revokeInvitation(form: FormData) {
  const orgId = text(form, 'org_id', 64)
  const path = `/dashboard/${orgId}/team`
  const { org } = await access(form, 'team.manage', path)
  await query('delete from invitations where id = $1 and org_id = $2 and accepted_at is null', [text(form, 'invitation_id', 64), org.id])
  back(path, { ok: 'Invitation revoked.' })
}

export async function updateOrgSettings(form: FormData) {
  const orgId = text(form, 'org_id', 64)
  const path = `/dashboard/${orgId}/settings`
  const { org, user } = await access(form, 'org.settings', path)
  const accountNumber = text(form, 'account_number', 20).replace(/\s/g, '')
  if (accountNumber && !/^\d{10}$/.test(accountNumber)) back(path, { error: 'Account number must be 10 digits (NUBAN).' })
  const name = text(form, 'name', 120)
  if (name.length < 3) back(path, { error: 'Organisation name is too short.' })
  await query(
    `update organizations set name = $2, description = $3, contact_email = $4, contact_phone = $5,
       bank_name = $6, account_name = $7, account_number = $8, payment_instructions = $9 where id = $1`,
    [org.id, name, text(form, 'description', 600), text(form, 'contact_email', 200) || null, text(form, 'contact_phone', 30) || null,
      text(form, 'bank_name', 80) || null, text(form, 'account_name', 120) || null, accountNumber || null, text(form, 'payment_instructions', 400) || null],
  )
  await audit({ actorId: user.id, orgId: org.id, action: 'organization.settings_updated', entityType: 'organization', entityId: org.id })
  back(path, { ok: 'Settings saved.' })
}

/** Spends the organisation's reward credit on FUTICK Pro: each full threshold buys the configured months. */
export async function redeemRewardsForPro(form: FormData) {
  const orgId = text(form, 'org_id', 64)
  const path = `/dashboard/${orgId}/rewards`
  const { org, user } = await access(form, 'org.settings', path)
  if (org.plan_id === 'enterprise') back(path, { error: 'You are already on Enterprise, which includes everything in Pro.' })
  if (org.plan_id === 'pro' && org.plan_source === 'manual' && !org.subscription_ends_at) {
    back(path, { error: 'Your Pro plan has no end date, so there is nothing to extend. Your credit stays saved.' })
  }
  const { referrals } = await getSettings()
  const threshold = referrals.proThresholdMinor
  const result = await transaction(async (db) => {
    const credits = await db.query<{ id: string; amount_minor: number }>(
      'select id, amount_minor from org_reward_credits where org_id = $1 and redemption_id is null order by created_at for update',
      [org.id],
    )
    const total = credits.reduce((sum, credit) => sum + Number(credit.amount_minor), 0)
    const sets = Math.floor(total / threshold)
    if (sets < 1) return null
    const months = sets * referrals.proMonthsPerRedemption
    const spent = sets * threshold
    const [current] = await db.query<{ plan_id: string; plan_source: string; subscription_ends_at: Date | null }>(
      'select plan_id, plan_source, subscription_ends_at from organizations where id = $1 for update',
      [org.id],
    )
    // Extend from the current end date if Pro is still running, otherwise from today.
    const startFrom = current.plan_id === 'pro' && current.subscription_ends_at && new Date(current.subscription_ends_at) > new Date()
      ? new Date(current.subscription_ends_at)
      : new Date()
    const endsAt = new Date(startFrom)
    endsAt.setMonth(endsAt.getMonth() + months)
    const [redemption] = await db.query<{ id: string }>(
      `insert into org_reward_redemptions (org_id, credits_minor, months, redeemed_by, plan_ends_at) values ($1, $2, $3, $4, $5) returning id`,
      [org.id, spent, months, user.id, endsAt],
    )
    await db.query('update org_reward_credits set redemption_id = $2 where id = any($1::uuid[])', [credits.map((credit) => credit.id), redemption.id])
    if (total - spent > 0) {
      await db.query(`insert into org_reward_credits (org_id, amount_minor, note) values ($1, $2, 'Carried over from last redemption')`, [org.id, total - spent])
    }
    // A paid (manual) Pro subscription keeps its source; Starter organisations get reward-funded Pro.
    await db.query(
      `update organizations set plan_id = 'pro', subscription_ends_at = $2,
         plan_source = case when plan_id = 'pro' and plan_source = 'manual' then 'manual' else 'reward' end
       where id = $1`,
      [org.id, endsAt],
    )
    await audit({ actorId: user.id, orgId: org.id, action: 'organization.pro_redeemed', entityType: 'organization', entityId: org.id, metadata: { months, spent } }, db)
    return { months, endsAt }
  })
  if (!result) back(path, { error: `You need ₦${(threshold / 100).toLocaleString('en-NG')} of reward credit to unlock Pro.` })
  await notify(await orgStaff(org.id, ['owner', 'admin']), {
    kind: 'organization.pro_unlocked', title: `${org.name} unlocked FUTICK Pro`,
    body: `${result.months} month${result.months === 1 ? '' : 's'} of Pro, paid for by reward tickets at your events.`, href: `/dashboard/${org.id}/rewards`,
  })
  back(path, { ok: `Pro unlocked for ${result.months} month${result.months === 1 ? '' : 's'}. Enjoy the higher limits!` })
}

export async function toggleEventRewards(form: FormData) {
  const orgId = text(form, 'org_id', 64)
  const path = `/dashboard/${orgId}/rewards`
  const { org } = await access(form, 'events.manage', path)
  const accept = form.get('accept') === 'on'
  await query('update events set accepts_reward_coupons = $3, updated_at = now() where id = $1 and org_id = $2', [text(form, 'event_id', 64), org.id, accept])
  back(path, { ok: accept ? 'This event now accepts reward tickets.' : 'Reward tickets are switched off for this event.' })
}
