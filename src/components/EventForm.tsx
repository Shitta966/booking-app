import { EVENT_CATEGORIES } from '@/lib/events'
import { PosterInput } from './PosterInput'
import { toLagosInput } from '@/lib/format'

export type EventFormValues = {
  id?: string; title: string; summary: string; description: string; category: string; venue: string
  start_time: Date | null; end_time: Date | null; poster_url: string | null; visibility: string
  accepts_reward_coupons?: boolean
}

export function EventForm({ orgId, action, values, submitLabel }: { orgId: string; action: (form: FormData) => Promise<void>; values: EventFormValues; submitLabel: string }) {
  return (
    <form action={action} className="card grid gap-4 p-6 md:grid-cols-2">
      <input type="hidden" name="org_id" value={orgId} />
      {values.id && <input type="hidden" name="event_id" value={values.id} />}
      <PosterInput current={values.poster_url} />
      <label className="field md:col-span-2">Title<input name="title" required defaultValue={values.title} className="input" placeholder="e.g. Career & Industry Fair 2026" /></label>
      <label className="field md:col-span-2">One-line summary<input name="summary" defaultValue={values.summary} maxLength={280} className="input" /></label>
      <label className="field md:col-span-2">Full description<textarea name="description" rows={6} defaultValue={values.description} className="input" placeholder="Agenda, speakers, dress code, what to bring…" /></label>
      <label className="field">Category
        <select name="category" defaultValue={values.category} className="input">{EVENT_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select>
      </label>
      <label className="field">Venue<input name="venue" required defaultValue={values.venue} className="input" placeholder="e.g. Main Auditorium, Gidan Kwano" /></label>
      <label className="field">Starts (Lagos time)<input type="datetime-local" name="start_time" required defaultValue={values.start_time ? toLagosInput(values.start_time) : ''} className="input" /></label>
      <label className="field">Ends (Lagos time)<input type="datetime-local" name="end_time" required defaultValue={values.end_time ? toLagosInput(values.end_time) : ''} className="input" /></label>
      <label className="field md:col-span-2">Visibility
        <select name="visibility" defaultValue={values.visibility} className="input"><option value="public">Public — listed on FUTICK</option><option value="unlisted">Unlisted — only people with the link</option></select>
      </label>
      <label className="flex items-start gap-3 rounded-2xl bg-gold-400/15 p-4 text-sm md:col-span-2">
        <input type="checkbox" name="accepts_reward_coupons" defaultChecked={values.accepts_reward_coupons ?? true} className="mt-0.5 size-4 accent-brand-600" />
        <span>
          <span className="block font-semibold text-slate-900">Accept FUTICK reward tickets</span>
          <span className="block text-xs text-slate-600">Attendees who earned a free ticket by inviting friends can use it here. You don’t lose out: each reward used adds its value to your Pro credit, which unlocks free months of FUTICK Pro.</span>
        </span>
      </label>
      <div className="md:col-span-2"><button className="btn-primary">{submitLabel}</button></div>
    </form>
  )
}
