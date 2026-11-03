import { createEvent } from '@/app/actions/org'
import { EventForm } from '@/components/EventForm'
import { Flash, PageHeader } from '@/components/ui'
import { requireOrgAccess } from '@/lib/auth'

export default async function NewEvent({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<Record<string, string>> }) {
  const { orgId } = await params
  const { org } = await requireOrgAccess(orgId, 'events.manage')
  return (
    <>
      <PageHeader eyebrow="Events" title="New event" description="Saved as a draft. You add ticket types and a planning checklist next." />
      <Flash searchParams={await searchParams} />
      <EventForm orgId={org.id} action={createEvent} submitLabel="Create draft"
        values={{ title: '', summary: '', description: '', category: 'Conference', venue: '', start_time: null, end_time: null, poster_url: null, visibility: 'public' }} />
    </>
  )
}
