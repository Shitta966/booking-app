import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { query, queryOne } from './db'
import { can, type OrgAction, type OrgRole } from './permissions'
import { SESSION_COOKIE, verifySession } from './session'

export type CurrentUser = {
  id: string
  email: string
  full_name: string
  phone: string | null
  is_super_admin: boolean
}

export type Organization = {
  id: string
  name: string
  slug: string
  description: string
  kind: string
  contact_email: string | null
  contact_phone: string | null
  plan_id: string
  status: 'pending' | 'active' | 'suspended'
  subscription_ends_at: Date | null
  bank_name: string | null
  account_name: string | null
  account_number: string | null
  payment_instructions: string | null
  created_at: Date
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const store = await cookies()
  const claims = await verifySession(store.get(SESSION_COOKIE)?.value)
  if (!claims) return null
  return queryOne<CurrentUser>(
    `select id, email, full_name, phone, is_super_admin from users
     where id = $1 and status = 'active' and session_version = $2`,
    [claims.sub, claims.sv],
  )
})

export async function requireUser(next = '/tickets') {
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`)
  return user
}

export async function requireSuperAdmin() {
  const user = await requireUser('/admin')
  if (!user.is_super_admin) notFound()
  return user
}

export type OrgAccess = {
  user: CurrentUser
  org: Organization
  role: OrgRole
  /** True when a super admin is acting inside a tenant they are not a member of. */
  viaSuperAdmin: boolean
}

export const getMemberships = cache(async (userId: string) =>
  query<{ org_id: string; role: OrgRole; name: string; status: string }>(
    `select m.org_id, m.role, o.name, o.status from organization_members m
     join organizations o on o.id = m.org_id where m.user_id = $1 order by o.name`,
    [userId],
  ),
)

/**
 * Loads a tenant and the caller's role in it. Super admins can open every tenant and act as owner.
 * Mutations pass `requireActive` so pending or suspended tenants cannot publish or sell.
 */
export async function requireOrgAccess(orgId: string, action: OrgAction = 'org.view') {
  const user = await requireUser(`/dashboard/${orgId}`)
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) notFound()
  const org = await queryOne<Organization>('select * from organizations where id = $1', [orgId])
  if (!org) notFound()
  const membership = await queryOne<{ role: OrgRole }>(
    'select role from organization_members where org_id = $1 and user_id = $2',
    [orgId, user.id],
  )
  let access: OrgAccess
  if (membership) access = { user, org, role: membership.role, viaSuperAdmin: false }
  else if (user.is_super_admin) access = { user, org, role: 'owner', viaSuperAdmin: true }
  else notFound()
  if (!can(access.role, action)) throw new Error('Your role does not allow this action.')
  return access
}
