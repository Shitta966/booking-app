import Link from 'next/link'
import { redirect } from 'next/navigation'
import { signup } from '@/app/actions/auth'
import { AuthFrame } from '@/components/AuthFrame'
import { Flash } from '@/components/ui'
import { getCurrentUser } from '@/lib/auth'
import { ORG_KINDS } from '@/lib/constants'
import { cookies } from 'next/headers'
import { Gift } from 'lucide-react'
import { findReferrer, shortName } from '@/lib/rewards'
import { getSettings } from '@/lib/settings'

export const metadata = { title: 'Create an account' }

export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  if (await getCurrentUser()) redirect(params.type === 'organizer' ? '/organizers/new' : '/tickets')
  const { features, referrals } = await getSettings()
  const refCode = params.ref ?? (await cookies()).get('futick_ref')?.value
  const referrer = referrals.enabled ? await findReferrer(refCode) : null
  const organizerFirst = params.type === 'organizer' && features.organizerApplicationsOpen

  return (
    <AuthFrame eyebrow="Join FUTICK" title="Create your account" subtitle="Attendees book and carry tickets. Organisers also get an event dashboard."
      footer={<>Already registered? <Link href="/login" className="font-medium text-moss-950 underline underline-offset-4">Log in</Link></>}>
        {referrer && (
          <div className="mb-5 flex items-start gap-3 rounded-2xl bg-gold-400/20 p-4 text-sm text-moss-900">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold-400 text-moss-950"><Gift size={17} /></span>
            <p><b>{shortName(referrer.full_name)} invited you to FUTICK.</b> Book your first ticket and you help them earn a free one — then invite your own friends and earn yours.</p>
          </div>
        )}
        <Flash searchParams={params} />
        {!features.signupsOpen ? <p className="text-sm text-slate-600">New sign-ups are paused at the moment.</p> : (
          <form action={signup} className="group flex flex-col gap-4">
            <input type="hidden" name="next" value={params.next ?? ''} />
            {referrer && <input type="hidden" name="ref" value={refCode ?? ''} />}
            <fieldset className="grid grid-cols-2 gap-2">
              <legend className="mb-2 text-sm font-medium text-slate-700">I want to</legend>
              <label className="flex cursor-pointer flex-col rounded-2xl border border-moss-200 p-3.5 text-sm has-[:checked]:border-moss-800 has-[:checked]:bg-moss-50">
                <span className="flex items-center gap-2 font-semibold"><input type="radio" name="account_type" value="attendee" defaultChecked={!organizerFirst} className="accent-brand-600" /> Attend events</span>
                <span className="mt-1 text-xs text-slate-500">Book and show tickets</span>
              </label>
              {features.organizerApplicationsOpen && (
                <label className="flex cursor-pointer flex-col rounded-2xl border border-moss-200 p-3.5 text-sm has-[:checked]:border-moss-800 has-[:checked]:bg-moss-50">
                  <span className="flex items-center gap-2 font-semibold"><input id="type-organizer" type="radio" name="account_type" value="organizer" defaultChecked={organizerFirst} className="accent-brand-600" /> Organise events</span>
                  <span className="mt-1 text-xs text-slate-500">Plan, sell and check in</span>
                </label>
              )}
            </fieldset>
            <label className="field">Full name<input name="full_name" autoComplete="name" required className="input" /></label>
            <label className="field">Email<input name="email" type="email" autoComplete="email" required className="input" /></label>
            <label className="field">Phone (optional)<input name="phone" type="tel" autoComplete="tel" className="input" /></label>
            <label className="field">Password<input name="password" type="password" autoComplete="new-password" minLength={10} required className="input" /></label>
            <div className="hidden flex-col gap-4 rounded-2xl bg-moss-50 p-4 group-has-[#type-organizer:checked]:flex">
              <label className="field">Organisation name<input name="org_name" placeholder="e.g. Department of Computer Science" className="input" /></label>
              <label className="field">Organisation type
                <select name="org_kind" className="input">{ORG_KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              </label>
              <p className="text-xs text-slate-500">Your organisation can draft events straight away. A FUTICK administrator verifies it before events can be published.</p>
            </div>
            <button className="btn-primary mt-2 py-3">Create account</button>
          </form>
        )}
    </AuthFrame>
  )
}
