'use server'

import bcrypt from 'bcryptjs'
import { audit } from '@/lib/audit'
import { requireUser } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'
import { back, text } from '@/lib/forms'
import { notify } from '@/lib/notify'
import { passwordProblem } from '@/lib/passwords'
import { hit } from '@/lib/rateLimit'
import { startSession } from '@/lib/session'

export async function updateProfile(form: FormData) {
  const user = await requireUser('/account')
  const fullName = text(form, 'full_name', 120)
  if (fullName.length < 2) back('/account', { error: 'Enter your full name.' })
  await query('update users set full_name = $2, phone = $3 where id = $1', [user.id, fullName, text(form, 'phone', 30) || null])
  back('/account', { ok: 'Profile saved.' })
}

export async function changePassword(form: FormData) {
  const user = await requireUser('/account')
  const current = String(form.get('current_password') ?? '')
  const next = String(form.get('new_password') ?? '')
  if (!(await hit(`password:${user.id}`, 5, 900))) back('/account', { error: 'Too many attempts. Wait 15 minutes and try again.' })
  const row = await queryOne<{ password_hash: string }>('select password_hash from users where id = $1', [user.id])
  if (!row || !(await bcrypt.compare(current, row.password_hash))) back('/account', { error: 'Your current password is incorrect.' })
  const problem = passwordProblem(next, user.email)
  if (problem) back('/account', { error: problem })
  if (next !== String(form.get('confirm_password') ?? '')) back('/account', { error: 'The new passwords do not match.' })
  // Changing the password signs out every other device; this one gets a fresh session.
  const [updated] = await query<{ session_version: number }>(
    'update users set password_hash = $2, session_version = session_version + 1 where id = $1 returning session_version',
    [user.id, await bcrypt.hash(next, 12)],
  )
  await startSession(user.id, updated.session_version)
  await audit({ actorId: user.id, action: 'user.password_changed', entityType: 'user', entityId: user.id })
  await notify([user.id], { kind: 'security.password_changed', title: 'Your password was changed', body: 'If this was not you, contact FUTICK support immediately.', href: '/account' })
  back('/account', { ok: 'Password changed. Other devices have been signed out.' })
}
