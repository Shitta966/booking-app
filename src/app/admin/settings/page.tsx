import { saveSettings } from '@/app/actions/admin'
import { Flash, PageHeader } from '@/components/ui'
import { databaseKind } from '@/lib/db'
import { getSettings } from '@/lib/settings'

export default async function AdminSettings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const [{ branding, homepage, features, referrals }, database] = await Promise.all([getSettings(), databaseKind()])
  return (
    <>
      <PageHeader eyebrow="Platform" title="Platform settings" description="Branding, homepage content and platform switches. Changes go live immediately." />
      <Flash searchParams={await searchParams} />
      <div className="grid gap-6 xl:grid-cols-2">
        <form action={saveSettings} className="card grid gap-3 p-5">
          <input type="hidden" name="section" value="branding" />
          <h2 className="font-semibold">Branding</h2>
          <label className="field">App name<input name="appName" defaultValue={branding.appName} className="input" /></label>
          <label className="field">Tagline<input name="tagline" defaultValue={branding.tagline} className="input" /></label>
          <label className="field">Support email<input name="supportEmail" type="email" defaultValue={branding.supportEmail} className="input" /></label>
          <label className="field">Primary colour<input name="primaryColor" type="color" defaultValue={branding.primaryColor} className="h-10 w-24 rounded border border-slate-200" /></label>
          <button className="btn-primary justify-self-start">Save branding</button>
        </form>
        <form action={saveSettings} className="card grid gap-3 p-5">
          <input type="hidden" name="section" value="homepage" />
          <h2 className="font-semibold">Homepage</h2>
          <label className="field">Hero title<input name="heroTitle" defaultValue={homepage.heroTitle} className="input" /></label>
          <label className="field">Hero text<textarea name="heroSubtitle" rows={3} defaultValue={homepage.heroSubtitle} className="input" /></label>
          <label className="field">Announcement bar (empty to hide)<input name="announcement" defaultValue={homepage.announcement} className="input" placeholder="e.g. Convocation tickets open Monday 9am" /></label>
          <button className="btn-primary justify-self-start">Save homepage</button>
        </form>
        <form action={saveSettings} className="card grid gap-3 p-5">
          <input type="hidden" name="section" value="features" />
          <h2 className="font-semibold">Switches</h2>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="signupsOpen" defaultChecked={features.signupsOpen} className="accent-brand-600" /> Allow new account sign-ups</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="organizerApplicationsOpen" defaultChecked={features.organizerApplicationsOpen} className="accent-brand-600" /> Accept new organisation applications</label>
          <label className="field">Unpaid reservation hold (minutes)<input name="reservationMinutes" type="number" min={5} max={1440} defaultValue={features.reservationMinutes} className="input w-32" /></label>
          <button className="btn-primary justify-self-start">Save switches</button>
        </form>
        <form action={saveSettings} className="card grid gap-3 p-5 xl:col-span-2 md:grid-cols-3">
          <input type="hidden" name="section" value="referrals" />
          <div className="md:col-span-3">
            <h2 className="font-semibold">Refer & earn</h2>
            <p className="text-xs text-slate-500">A friend counts once they sign up with an invite link and their first order is paid. Organisers earn Pro credit equal to the ticket value each reward covers.</p>
          </div>
          <label className="flex items-center gap-2 text-sm md:col-span-3"><input type="checkbox" name="enabled" defaultChecked={referrals.enabled} className="accent-brand-600" /> Programme is on (earned rewards stay usable when off)</label>
          <label className="field">Friends per free ticket<input name="friendsPerReward" type="number" min={1} max={50} defaultValue={referrals.friendsPerReward} className="input" /></label>
          <label className="field">Free ticket covers up to (₦)<input name="couponCap" inputMode="decimal" defaultValue={referrals.couponCapMinor / 100} className="input" /></label>
          <label className="field">Reward valid for (days)<input name="couponValidDays" type="number" min={7} max={365} defaultValue={referrals.couponValidDays} className="input" /></label>
          <label className="field">Max rewards per person per month<input name="maxRewardsPerMonth" type="number" min={1} max={50} defaultValue={referrals.maxRewardsPerMonth} className="input" /></label>
          <label className="field">Organiser credit for Pro (₦)<input name="proThreshold" inputMode="decimal" defaultValue={referrals.proThresholdMinor / 100} className="input" /></label>
          <label className="field">Months of Pro per redemption<input name="proMonthsPerRedemption" type="number" min={1} max={12} defaultValue={referrals.proMonthsPerRedemption} className="input" /></label>
          <button className="btn-primary justify-self-start md:col-span-3">Save programme</button>
        </form>
        <div className="card p-5 text-sm text-slate-600">
          <h2 className="font-semibold text-slate-900">System</h2>
          <p className="mt-3">Database engine: <b>{database === 'pglite' ? 'Embedded (development only)' : 'PostgreSQL'}</b></p>
          <p className="mt-1">Health check: <code className="rounded bg-slate-100 px-1">/api/health</code></p>
        </div>
      </div>
    </>
  )
}
