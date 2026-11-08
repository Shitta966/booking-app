'use server'

import bcrypt from 'bcryptjs'
import { audit } from '@/lib/audit'
import { requireSuperAdmin } from '@/lib/auth'
import { query, queryOne, transaction } from '@/lib/db'
import { back, text } from '@/lib/forms'
import { passwordProblem } from '@/lib/passwords'
import { getPaymentConfig, PROVIDER_LABELS, savePaymentSettings, type Provider } from '@/lib/payments/config'
import { testFlutterwave } from '@/lib/payments/flutterwave'
import { testStripe } from '@/lib/payments/stripe'
import { notify, notifyEventCancelled, orgStaff } from '@/lib/notify'

function returnPath(form: FormData, fallback: string) {
  const value = text(form, 'return_to', 300)
  return value.startsWith('/admin') ? value : fallback
}

export async function setOrganizationStatus(form: FormData) {
  const admin = await requireSuperAdmin()
  const orgId = text(form, 'org_id', 64)
  const status = text(form, 'status', 20)
  const path = returnPath(form, `/admin/organizations/${orgId}`)
  if (!['active', 'suspended', 'pending'].includes(status)) back(path, { error: 'Invalid status.' })
  const updated = await query(
    `update organizations set status = $2, approved_at = case when $2 = 'active' then coalesce(approved_at, now()) else approved_at end
     where id = $1 returning id`,
    [orgId, status],
  )
  if (!updated.length) back(path, { error: 'Organisation not found.' })
  await audit({ actorId: admin.id, orgId, action: `organization.${status === 'active' ? 'approved' : status}`, entityType: 'organization', entityId: orgId })
  const org = await queryOne<{ name: string }>('select name from organizations where id = $1', [orgId])
  if (status === 'active') await notify(await orgStaff(orgId, ['owner', 'admin']), { kind: 'organization.approved', title: `${org?.name} is verified`, body: 'You can now publish events and sell tickets.', href: `/dashboard/${orgId}` })
  if (status === 'suspended') await notify(await orgStaff(orgId, ['owner', 'admin']), { kind: 'organization.suspended', title: `${org?.name} has been suspended`, body: 'Your events are hidden. Contact FUTICK support for details.', href: `/dashboard/${orgId}` })
  back(path, { ok: status === 'active' ? 'Organisation approved and active.' : status === 'suspended' ? 'Organisation suspended. Its events are hidden.' : 'Organisation set back to pending.' })
}

export async function updateOrganizationPlan(form: FormData) {
  const admin = await requireSuperAdmin()
  const orgId = text(form, 'org_id', 64)
  const path = `/admin/organizations/${orgId}`
  const planId = text(form, 'plan_id', 40)
  const endsAt = text(form, 'subscription_ends_at', 10)
  if (!(await queryOne('select 1 from plans where id = $1', [planId]))) back(path, { error: 'Unknown plan.' })
  // A plan set by a super admin is a regular subscription, not one funded by reward credit.
  await query(`update organizations set plan_id = $2, subscription_ends_at = $3, plan_source = 'manual' where id = $1`,
    [orgId, planId, /^\d{4}-\d{2}-\d{2}$/.test(endsAt) ? `${endsAt}T23:59:59+01:00` : null])
  await audit({ actorId: admin.id, orgId, action: 'organization.plan_changed', entityType: 'organization', entityId: orgId, metadata: { planId, endsAt } })
  back(path, { ok: 'Plan updated.' })
}

export async function transferOwnership(form: FormData) {
  const admin = await requireSuperAdmin()
  const orgId = text(form, 'org_id', 64)
  const path = `/admin/organizations/${orgId}`
  const email = text(form, 'email', 200).toLowerCase()
  const user = await queryOne<{ id: string }>('select id from users where email = $1', [email])
  if (!user) back(path, { error: 'No account uses that email. Ask them to sign up first.' })
  await transaction(async (db) => {
    await db.query(`update organization_members set role = 'admin' where org_id = $1 and role = 'owner'`, [orgId])
    await db.query(
      `insert into organization_members (org_id, user_id, role) values ($1, $2, 'owner')
       on conflict (org_id, user_id) do update set role = 'owner'`,
      [orgId, user.id],
    )
    await audit({ actorId: admin.id, orgId, action: 'organization.ownership_transferred', entityType: 'user', entityId: user.id, metadata: { email } }, db)
  })
  back(path, { ok: `${email} is now the owner. The previous owner became an admin.` })
}

export async function deleteOrganization(form: FormData) {
  const admin = await requireSuperAdmin()
  const orgId = text(form, 'org_id', 64)
  const path = `/admin/organizations/${orgId}`
  const org = await queryOne<{ name: string }>('select name from organizations where id = $1', [orgId])
  if (!org) back('/admin/organizations', { error: 'Organisation not found.' })
  if (text(form, 'confirm_name', 120) !== org.name) back(path, { error: 'Type the organisation name exactly to confirm deletion.' })
  const [{ count }] = await query<{ count: number }>(`select count(*) as count from orders where org_id = $1 and status = 'paid' and total_minor > 0`, [orgId])
  if (count > 0) back(path, { error: 'This organisation has paid orders. Suspend it instead so financial records are kept.' })
  await query('delete from organizations where id = $1', [orgId])
  await audit({ actorId: admin.id, action: 'organization.deleted', entityType: 'organization', entityId: orgId, metadata: { name: org.name } })
  back('/admin/organizations', { ok: `${org.name} was deleted.` })
}

export async function updateUserAccount(form: FormData) {
  const admin = await requireSuperAdmin()
  const userId = text(form, 'user_id', 64)
  const action = text(form, 'action', 30)
  const path = returnPath(form, '/admin/users')
  const target = await queryOne<{ id: string; email: string; is_super_admin: boolean }>('select id, email, is_super_admin from users where id = $1', [userId])
  if (!target) back(path, { error: 'User not found.' })
  if (target.id === admin.id && ['suspend', 'revoke_admin'].includes(action)) back(path, { error: 'You cannot suspend yourself or remove your own super admin access.' })

  switch (action) {
    case 'suspend':
      await query(`update users set status = 'suspended', session_version = session_version + 1 where id = $1`, [userId])
      break
    case 'activate':
      await query(`update users set status = 'active' where id = $1`, [userId])
      break
    case 'grant_admin':
      await query('update users set is_super_admin = true where id = $1', [userId])
      break
    case 'revoke_admin': {
      const [{ count }] = await query<{ count: number }>(`select count(*) as count from users where is_super_admin and status = 'active'`)
      if (count <= 1) back(path, { error: 'Keep at least one active super admin.' })
      await query('update users set is_super_admin = false where id = $1', [userId])
      break
    }
    case 'sign_out':
      await query('update users set session_version = session_version + 1 where id = $1', [userId])
      break
    case 'set_password': {
      const password = String(form.get('password') ?? '')
      const weak = passwordProblem(password, target.email)
      if (weak) back(path, { error: weak })
      await query('update users set password_hash = $2, session_version = session_version + 1 where id = $1', [userId, await bcrypt.hash(password, 10)])
      break
    }
    case 'update_profile': {
      const fullName = text(form, 'full_name', 120)
      const phone = text(form, 'phone', 30)
      await query('update users set full_name = $2, phone = $3 where id = $1', [userId, fullName, phone || null])
      break
    }
    default:
      back(path, { error: 'Unknown action.' })
  }
  await audit({ actorId: admin.id, action: `user.${action}`, entityType: 'user', entityId: userId, metadata: { email: target.email } })
  back(path, { ok: `${target.email}: ${action.replace('_', ' ')} done.` })
}

export async function adminUpdateEvent(form: FormData) {
  const admin = await requireSuperAdmin()
  const eventId = text(form, 'event_id', 64)
  const action = text(form, 'action', 20)
  const path = returnPath(form, '/admin/events')
  const event = await queryOne<{ org_id: string; title: string; org_name: string }>('select e.org_id, e.title, o.name as org_name from events e join organizations o on o.id = e.org_id where e.id = $1', [eventId])
  if (!event) back(path, { error: 'Event not found.' })
  if (action === 'feature') await query('update events set is_featured = not is_featured where id = $1', [eventId])
  else if (action === 'unpublish') await query(`update events set status = 'draft', updated_at = now() where id = $1 and status = 'published'`, [eventId])
  else if (action === 'cancel') {
    await query(`update events set status = 'cancelled', updated_at = now() where id = $1`, [eventId])
    await notifyEventCancelled(eventId, event.title, event.org_name)
  }
  else back(path, { error: 'Unknown action.' })
  await audit({ actorId: admin.id, orgId: event.org_id, action: `event.admin_${action}`, entityType: 'event', entityId: eventId })
  back(path, { ok: 'Event updated.' })
}

export async function savePlan(form: FormData) {
  const admin = await requireSuperAdmin()
  const id = text(form, 'id', 40).toLowerCase()
  const path = '/admin/plans'
  if (!/^[a-z0-9_-]{2,40}$/.test(id)) back(path, { error: 'Plan id must be 2–40 lowercase letters, numbers, - or _.' })
  const limit = (key: string) => {
    const raw = text(form, key, 10)
    if (!raw) return null
    const value = Number(raw)
    return Number.isInteger(value) && value > 0 ? value : NaN
  }
  const price = Math.round(Number(text(form, 'price', 20) || '0') * 100)
  const fee = Number(text(form, 'ticket_fee_percent', 6) || '0')
  const values = [limit('max_events'), limit('max_tickets_per_event'), limit('max_team_members')]
  if (values.some((value) => Number.isNaN(value))) back(path, { error: 'Limits must be positive whole numbers, or empty for unlimited.' })
  if (!Number.isFinite(price) || price < 0) back(path, { error: 'Enter a valid price.' })
  if (!Number.isFinite(fee) || fee < 0 || fee > 50) back(path, { error: 'Fee must be between 0 and 50%.' })
  const features = text(form, 'features', 2000).split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 12)
  const period = ['month', 'year', 'event'].includes(text(form, 'billing_period', 10)) ? text(form, 'billing_period', 10) : 'month'
  await query(
    `insert into plans (id, name, description, price_minor, billing_period, max_events, max_tickets_per_event, max_team_members, ticket_fee_percent, features, is_active, sort_order)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     on conflict (id) do update set name = excluded.name, description = excluded.description, price_minor = excluded.price_minor,
       billing_period = excluded.billing_period, max_events = excluded.max_events, max_tickets_per_event = excluded.max_tickets_per_event,
       max_team_members = excluded.max_team_members, ticket_fee_percent = excluded.ticket_fee_percent, features = excluded.features,
       is_active = excluded.is_active, sort_order = excluded.sort_order`,
    [id, text(form, 'name', 60) || id, text(form, 'description', 300), price, period, ...values, fee, features,
      form.get('is_active') === 'on', Number(text(form, 'sort_order', 4)) || 0],
  )
  await audit({ actorId: admin.id, action: 'plan.saved', entityType: 'plan', entityId: id })
  back(path, { ok: `Plan “${id}” saved.` })
}

export async function saveSettings(form: FormData) {
  const admin = await requireSuperAdmin()
  const section = text(form, 'section', 20)
  const path = '/admin/settings'
  let value: Record<string, unknown>
  if (section === 'branding') {
    const color = text(form, 'primaryColor', 7)
    value = {
      appName: text(form, 'appName', 40) || 'FUTICK',
      tagline: text(form, 'tagline', 120),
      supportEmail: text(form, 'supportEmail', 200),
      primaryColor: /^#[0-9a-f]{6}$/i.test(color) ? color : '#2b3fd9',
    }
  } else if (section === 'homepage') {
    value = { heroTitle: text(form, 'heroTitle', 120), heroSubtitle: text(form, 'heroSubtitle', 400), announcement: text(form, 'announcement', 200) }
  } else if (section === 'features') {
    const minutes = Number(text(form, 'reservationMinutes', 4))
    value = {
      signupsOpen: form.get('signupsOpen') === 'on',
      organizerApplicationsOpen: form.get('organizerApplicationsOpen') === 'on',
      reservationMinutes: Number.isInteger(minutes) && minutes >= 5 && minutes <= 1440 ? minutes : 30,
    }
  } else if (section === 'referrals') {
    const whole = (key: string, min: number, max: number, fallback: number) => {
      const value = Number(text(form, key, 12))
      return Number.isInteger(value) && value >= min && value <= max ? value : fallback
    }
    const naira = (key: string, fallback: number) => {
      const value = Number(text(form, key, 12).replace(/[,\s₦]/g, ''))
      return Number.isFinite(value) && value >= 100 ? Math.round(value * 100) : fallback
    }
    value = {
      enabled: form.get('enabled') === 'on',
      friendsPerReward: whole('friendsPerReward', 1, 50, 5),
      couponCapMinor: naira('couponCap', 1_000_000),
      couponValidDays: whole('couponValidDays', 7, 365, 90),
      maxRewardsPerMonth: whole('maxRewardsPerMonth', 1, 50, 3),
      proThresholdMinor: naira('proThreshold', 5_000_000),
      proMonthsPerRedemption: whole('proMonthsPerRedemption', 1, 12, 1),
    }
  } else {
    back(path, { error: 'Unknown settings section.' })
  }
  await query(
    `insert into platform_settings (key, value, updated_by, updated_at) values ($1, $2, $3, now())
     on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
    [section, JSON.stringify(value), admin.id],
  )
  await audit({ actorId: admin.id, action: 'settings.updated', entityType: 'platform_settings', entityId: section, metadata: value })
  back(path, { ok: 'Settings saved.' })
}

const PAYMENTS_PATH = '/admin/payments'

function readProvider(form: FormData): Provider {
  const provider = text(form, 'provider', 20)
  if (provider !== 'stripe' && provider !== 'flutterwave') back(PAYMENTS_PATH, { error: 'Unknown payment provider.' })
  return provider
}

export async function savePaymentGateway(form: FormData) {
  const admin = await requireSuperAdmin()
  const provider = readProvider(form)
  const secretKey = text(form, 'secret_key', 300)
  const webhookSecret = text(form, 'webhook_secret', 300)
  const publicKey = text(form, 'public_key', 300)
  if (provider === 'stripe' && secretKey && !/^(sk|rk)_(test|live)_/.test(secretKey)) back(PAYMENTS_PATH, { error: 'A Stripe secret key starts with sk_test_ or sk_live_.' })
  if (provider === 'stripe' && webhookSecret && !webhookSecret.startsWith('whsec_')) back(PAYMENTS_PATH, { error: 'A Stripe webhook signing secret starts with whsec_.' })
  if (provider === 'stripe' && publicKey && !/^pk_(test|live)_/.test(publicKey)) back(PAYMENTS_PATH, { error: 'A Stripe publishable key starts with pk_test_ or pk_live_.' })
  if (provider === 'flutterwave' && secretKey && !/^FLWSECK/i.test(secretKey)) back(PAYMENTS_PATH, { error: 'A Flutterwave secret key starts with FLWSECK.' })
  if (provider === 'flutterwave' && publicKey && !/^FLWPUBK/i.test(publicKey)) back(PAYMENTS_PATH, { error: 'A Flutterwave public key starts with FLWPUBK.' })
  const clearSecrets = form.get('clear_secrets') === 'on'
  await savePaymentSettings({ provider, enabled: form.get('enabled') === 'on', publicKey, secretKey, webhookSecret, clearSecrets }, admin.id)
  const config = await getPaymentConfig()
  await audit({ actorId: admin.id, action: 'payments.gateway_saved', entityType: 'platform_settings', entityId: provider, metadata: { enabled: config[provider].enabled, keyChanged: Boolean(secretKey), webhookChanged: Boolean(webhookSecret), cleared: clearSecrets } })
  if (form.get('enabled') === 'on' && !config[provider].secretKey) back(PAYMENTS_PATH, { error: `${PROVIDER_LABELS[provider]} stays off until a secret key is saved.` })
  back(PAYMENTS_PATH, { ok: `${PROVIDER_LABELS[provider]} settings saved${config[provider].enabled ? ' — live for attendees' : ''}.` })
}

export async function testPaymentGateway(form: FormData) {
  await requireSuperAdmin()
  const provider = readProvider(form)
  const { secretKey } = (await getPaymentConfig())[provider]
  if (!secretKey) back(PAYMENTS_PATH, { error: `Save a ${PROVIDER_LABELS[provider]} secret key first.` })
  let message: string
  try {
    message = provider === 'stripe' ? await testStripe(secretKey) : await testFlutterwave(secretKey)
  } catch (error) {
    const reason = error instanceof Error ? error.message.replace(/^(Stripe|Flutterwave):\s*/, '').slice(0, 160) : 'unknown error'
    back(PAYMENTS_PATH, { error: `${PROVIDER_LABELS[provider]} rejected the key: ${reason}` })
  }
  back(PAYMENTS_PATH, { ok: `${PROVIDER_LABELS[provider]}: ${message}` })
}

export async function saveBankTransfer(form: FormData) {
  const admin = await requireSuperAdmin()
  const enabled = form.get('enabled') === 'on'
  await savePaymentSettings({ bankTransferEnabled: enabled }, admin.id)
  await audit({ actorId: admin.id, action: 'payments.bank_transfer', entityType: 'platform_settings', entityId: 'payments', metadata: { enabled } })
  back(PAYMENTS_PATH, { ok: enabled ? 'Manual bank transfer is on.' : 'Manual bank transfer is off. Attendees pay online.' })
}

/** Online sales owed to an organiser: paid online orders, less platform fees, less payouts already made. */
export async function recordPayout(form: FormData) {
  const admin = await requireSuperAdmin()
  const orgId = text(form, 'org_id', 64)
  const amount = Math.round(Number(text(form, 'amount', 20).replace(/[,\s₦]/g, '')) * 100)
  const reference = text(form, 'reference', 120)
  if (!Number.isFinite(amount) || amount <= 0) back(PAYMENTS_PATH, { error: 'Enter the amount you paid out.' })
  if (reference.length < 3) back(PAYMENTS_PATH, { error: 'Enter the bank transfer reference for the payout.' })
  const done = await transaction(async (db) => {
    await db.query('select id from organizations where id = $1 for update', [orgId])
    const [{ owed }] = await db.query<{ owed: number }>(
      `select coalesce((select sum(total_minor - platform_fee_minor) from orders where org_id = $1 and status = 'paid' and payment_method in ('stripe', 'flutterwave')), 0)
            - coalesce((select sum(amount_minor) from payouts where org_id = $1), 0) as owed`,
      [orgId],
    )
    if (amount > Number(owed)) return false
    await db.query('insert into payouts (org_id, amount_minor, reference, paid_by) values ($1, $2, $3, $4)', [orgId, amount, reference, admin.id])
    await audit({ actorId: admin.id, orgId, action: 'payout.recorded', entityType: 'organization', entityId: orgId, metadata: { amount, reference } }, db)
    return true
  })
  if (!done) back(PAYMENTS_PATH, { error: 'That is more than this organiser is owed.' })
  back(PAYMENTS_PATH, { ok: 'Payout recorded.' })
}
