import { createOrganization } from '@/app/actions/auth'
import { AuthFrame } from '@/components/AuthFrame'
import { Flash } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { ORG_KINDS } from '@/lib/constants'

export const metadata = { title: 'Register an organisation' }

export default async function NewOrganizationPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser('/organizers/new')
  return (
    <AuthFrame eyebrow="For organisers" title="Register an organisation" subtitle="You will be its owner. A FUTICK administrator verifies new organisations before their events go live.">
        <Flash searchParams={await searchParams} />
        <form action={createOrganization} className="flex flex-col gap-4">
          <label className="field">Organisation name<input name="org_name" required className="input" /></label>
          <label className="field">Type<select name="org_kind" className="input">{ORG_KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field">About (optional)<textarea name="description" rows={3} className="input" /></label>
          <label className="field">Contact email<input name="contact_email" type="email" defaultValue={user.email} className="input" /></label>
          <label className="field">Contact phone (optional)<input name="contact_phone" type="tel" className="input" /></label>
          <button className="btn-primary">Submit for verification</button>
        </form>
    </AuthFrame>
  )
}
