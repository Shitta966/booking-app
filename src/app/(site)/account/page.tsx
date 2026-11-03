import Link from 'next/link'
import { changePassword, updateProfile } from '@/app/actions/account'
import { signOutEverywhere } from '@/app/actions/auth'
import { ConfirmButton } from '@/components/Modal'
import { PushToggle } from '@/components/PushToggle'
import { Flash } from '@/components/ui'
import { getMemberships, requireUser } from '@/lib/auth'
import { ROLE_LABELS } from '@/lib/permissions'

export const metadata = { title: 'Account' }

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 rounded-3xl bg-white p-6 shadow-[0_8px_30px_rgba(31,38,18,0.05)] md:grid-cols-[220px_1fr] md:p-8">
      <div><h2 className="font-medium text-moss-950">{title}</h2><p className="mt-1 text-xs leading-relaxed text-moss-800/60">{description}</p></div>
      <div>{children}</div>
    </section>
  )
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser('/account')
  const memberships = await getMemberships(user.id)

  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-moss-400">Your account</p>
      <h1 className="mt-3 text-4xl font-medium tracking-tight text-moss-950">Account settings</h1>
      <p className="mt-2 text-sm text-moss-800/70">{user.email}{user.is_super_admin ? ' · Super admin' : ''}</p>
      <div className="mt-6"><Flash searchParams={await searchParams} /></div>

      <div className="space-y-5">
        <Section title="Profile" description="Your name appears on your tickets and in organiser attendee lists.">
          <form action={updateProfile} className="grid gap-4 sm:grid-cols-2">
            <label className="field">Full name<input name="full_name" required defaultValue={user.full_name} autoComplete="name" className="input" /></label>
            <label className="field">Phone<input name="phone" type="tel" defaultValue={user.phone ?? ''} autoComplete="tel" className="input" /></label>
            <div className="sm:col-span-2"><button className="btn-primary">Save profile</button></div>
          </form>
        </Section>

        <Section title="Password" description="At least 10 characters. Changing it signs you out on every other device.">
          <form action={changePassword} className="grid gap-4 sm:grid-cols-2">
            <label className="field sm:col-span-2">Current password<input name="current_password" type="password" required autoComplete="current-password" className="input" /></label>
            <label className="field">New password<input name="new_password" type="password" required minLength={10} autoComplete="new-password" className="input" /></label>
            <label className="field">Repeat new password<input name="confirm_password" type="password" required minLength={10} autoComplete="new-password" className="input" /></label>
            <div className="sm:col-span-2"><button className="btn-primary">Change password</button></div>
          </form>
        </Section>

        <Section title="Push alerts" description="Payments to review, tickets issued and cancellations — even when FUTICK is closed. Turn on separately on each device.">
          <PushToggle />
        </Section>

        {memberships.length > 0 && (
          <Section title="Organisations" description="Teams you belong to and your role in each.">
            <ul className="divide-y divide-moss-100">
              {memberships.map((membership) => (
                <li key={membership.org_id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <Link href={`/dashboard/${membership.org_id}`} className="font-medium text-moss-950 hover:underline">{membership.name}</Link>
                  <span className="text-moss-800/60">{ROLE_LABELS[membership.role]}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Sessions" description="Lost a phone or used a shared computer? End every session, including this one.">
          <form action={signOutEverywhere}>
            <ConfirmButton className="btn-secondary" title="Sign out everywhere?" message="Every device signed in to your account, including this one, is signed out immediately." confirmLabel="Sign out everywhere">Sign out of all devices</ConfirmButton>
          </form>
        </Section>
      </div>
    </main>
  )
}
