'use server'

import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import { audit } from '@/lib/audit'
import { getCurrentUser } from '@/lib/auth'
import { query, queryOne, transaction } from '@/lib/db'
import { back, safeNext, text } from '@/lib/forms'
import { endSession, startSession } from '@/lib/session'
import { getSettings } from '@/lib/settings'
import { slugify } from '@/lib/format'
import { notify, superAdmins } from '@/lib/notify'
import { passwordProblem } from '@/lib/passwords'
import { clear, clientIp, hit, isBlocked } from '@/lib/rateLimit'
import { cookies } from 'next/headers'
import { findReferrer, shortName } from '@/lib/rewards'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function acceptInvitations(userId: string, email: string) {
  const invites = await query<{ id: string; org_id: string; role: string }>(
    'select id, org_id, role from invitations where lower(email) = $1 and accepted_at is null',
    [email],
  )
  for (const invite of invites) {
    await query(
      `insert into organization_members (org_id, user_id, role) values ($1, $2, $3) on conflict (org_id, user_id) do nothing`,
      [invite.org_id, userId, invite.role],
    )
    await query('update invitations set accepted_at = now() where id = $1', [invite.id])
  }
}

export async function login(form: FormData) {
  const email = text(form, 'email', 200).toLowerCase()
  const password = String(form.get('password') ?? '')
  const next = safeNext(text(form, 'next', 300) || '/tickets')
  const ip = await clientIp()
  // Lock an account after 5 failed attempts in 15 minutes, and slow down any IP trying many accounts.
  const accountKey = `login:${email}`
  if (await isBlocked(accountKey, 5, 900) || (ip !== null && !(await hit(`login-ip:${ip}`, 30, 900)))) {
    back('/login', { error: 'Too many sign-in attempts. Wait 15 minutes and try again.' })
  }
  const user = await queryOne<{ id: string; password_hash: string; status: string; session_version: number; is_super_admin: boolean }>(
    'select id, password_hash, status, session_version, is_super_admin from users where email = $1',
    [email],
  )
  // Compare against a dummy hash when the user does not exist so timing does not reveal accounts.
  const valid = await bcrypt.compare(password, user?.password_hash ?? '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.wUuAH5Yb0ZtbV0p0lp1J3lJ5Xbe2')
  if (!user || !valid) {
    await hit(accountKey, 5, 900)
    back('/login', { error: 'Email or password is incorrect.' })
  }
  await clear(accountKey)
  if (user.status !== 'active') back('/login', { error: 'This account has been suspended. Contact support.' })
  await query('update users set last_login_at = now() where id = $1', [user.id])
  await acceptInvitations(user.id, email)
  await startSession(user.id, user.session_version)
  redirect(next === '/tickets' && user.is_super_admin ? '/admin' : next)
}

export async function signup(form: FormData) {
  const { features } = await getSettings()
  if (!features.signupsOpen) back('/signup', { error: 'New sign-ups are paused at the moment.' })
  const signupIp = await clientIp()
  if (signupIp && !(await hit(`signup:${signupIp}`, 5, 3600))) back('/signup', { error: 'Too many new accounts from this network. Try again in an hour.' })
  const fullName = text(form, 'full_name', 120)
  const email = text(form, 'email', 200).toLowerCase()
  const phone = text(form, 'phone', 30) || null
  const password = String(form.get('password') ?? '')
  const asOrganizer = form.get('account_type') === 'organizer'
  const orgName = text(form, 'org_name', 120)
  const orgKind = text(form, 'org_kind', 30) || 'department'

  if (fullName.length < 2) back('/signup', { error: 'Enter your full name.' })
  if (!EMAIL.test(email)) back('/signup', { error: 'Enter a valid email address.' })
  const weak = passwordProblem(password, email)
  if (weak) back('/signup', { error: weak })
  if (asOrganizer && !features.organizerApplicationsOpen) back('/signup', { error: 'Organiser applications are closed right now.' })
  if (asOrganizer && orgName.length < 3) back('/signup', { error: 'Enter your organisation’s name.' })
  if (await queryOne('select 1 from users where email = $1', [email])) back('/signup', { error: 'An account with this email already exists. Log in instead.' })

  const passwordHash = await bcrypt.hash(password, 12)
  // Referral: from the invite form field, or the cookie set when the visitor first opened an invite link.
  const cookieStore = await cookies()
  const referrer = await findReferrer(text(form, 'ref', 20) || cookieStore.get('futick_ref')?.value)
  const { userId, orgId } = await transaction(async (db) => {
    const [user] = await db.query<{ id: string }>(
      'insert into users (email, password_hash, full_name, phone, referred_by) values ($1, $2, $3, $4, $5) returning id',
      [email, passwordHash, fullName, phone, referrer?.id ?? null],
    )
    let createdOrg: string | null = null
    if (asOrganizer) {
      const [org] = await db.query<{ id: string }>(
        `insert into organizations (name, slug, kind, contact_email, contact_phone, created_by)
         values ($1, $2 || '-' || substr(md5(random()::text), 1, 5), $3, $4, $5, $6) returning id`,
        [orgName, slugify(orgName), ['department', 'faculty', 'student_body', 'company', 'partner', 'other'].includes(orgKind) ? orgKind : 'other', email, phone, user.id],
      )
      await db.query(`insert into organization_members (org_id, user_id, role) values ($1, $2, 'owner')`, [org.id, user.id])
      await audit({ actorId: user.id, orgId: org.id, action: 'organization.applied', entityType: 'organization', entityId: org.id }, db)
      createdOrg = org.id
    }
    return { userId: user.id, orgId: createdOrg }
  })
  await acceptInvitations(userId, email)
  if (referrer) {
    cookieStore.delete('futick_ref')
    await audit({ actorId: userId, action: 'referral.joined', entityType: 'user', entityId: referrer.id })
    await notify([referrer.id], {
      kind: 'referral.joined', title: `${shortName(fullName)} joined with your invite`,
      body: 'They count towards your free ticket as soon as they book their first ticket.', href: '/rewards',
    })
  }
  if (orgId) await notify(await superAdmins(), { kind: 'organization.applied', title: 'New organisation to verify', body: `${orgName} applied to host events.`, href: `/admin/organizations/${orgId}` })
  await startSession(userId, 1)
  redirect(orgId ? `/dashboard/${orgId}` : safeNext(text(form, 'next', 300) || '/events'))
}

export async function createOrganization(form: FormData) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=/organizers/new')
  const { features } = await getSettings()
  if (!features.organizerApplicationsOpen) back('/organizers/new', { error: 'Organiser applications are closed right now.' })
  const name = text(form, 'org_name', 120)
  const kind = text(form, 'org_kind', 30)
  if (name.length < 3) back('/organizers/new', { error: 'Enter your organisation’s name.' })
  const orgId = await transaction(async (db) => {
    const [org] = await db.query<{ id: string }>(
      `insert into organizations (name, slug, kind, description, contact_email, contact_phone, created_by)
       values ($1, $2 || '-' || substr(md5(random()::text), 1, 5), $3, $4, $5, $6, $7) returning id`,
      [name, slugify(name), ['department', 'faculty', 'student_body', 'company', 'partner', 'other'].includes(kind) ? kind : 'other',
        text(form, 'description', 600), text(form, 'contact_email', 200) || user.email, text(form, 'contact_phone', 30) || null, user.id],
    )
    await db.query(`insert into organization_members (org_id, user_id, role) values ($1, $2, 'owner')`, [org.id, user.id])
    await audit({ actorId: user.id, orgId: org.id, action: 'organization.applied', entityType: 'organization', entityId: org.id }, db)
    return org.id
  })
  await notify(await superAdmins(), { kind: 'organization.applied', title: 'New organisation to verify', body: `${name} applied to host events.`, href: `/admin/organizations/${orgId}` })
  redirect(`/dashboard/${orgId}`)
}

export async function logout() {
  await endSession()
  redirect('/')
}

export async function signOutEverywhere() {
  const user = await getCurrentUser()
  if (user) await query('update users set session_version = session_version + 1 where id = $1', [user.id])
  await endSession()
  redirect('/login?ok=' + encodeURIComponent('Signed out on every device.'))
}
