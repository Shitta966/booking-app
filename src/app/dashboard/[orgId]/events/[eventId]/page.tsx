import Link from 'next/link'
import { ConfirmButton } from '@/components/Modal'
import { notFound } from 'next/navigation'
import clsx from 'clsx'
import { Download, ExternalLink, ScanLine } from 'lucide-react'
import { addTask, deleteEvent, saveTicketType, setEventStatus, toggleTicketType, updateEvent, updateTask } from '@/app/actions/org'
import { EventForm } from '@/components/EventForm'
import { Badge, Flash, PageHeader } from '@/components/ui'
import { requireOrgAccess } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'
import { formatDate, formatDateTime, formatMoney, toLagosInput } from '@/lib/format'
import { can } from '@/lib/permissions'
import { formatTicketCode } from '@/lib/tickets'

type Event = {
  id: string; title: string; summary: string; description: string; category: string; venue: string; start_time: Date; end_time: Date
  poster_url: string | null; visibility: string; status: string
}
type TicketTypeRow = { id: string; name: string; description: string; price_minor: number; quantity_total: number; quantity_sold: number; quantity_reserved: number; max_per_order: number; sales_end: Date | null; is_active: boolean }
type Task = { id: string; title: string; assignee: string; due_date: Date | null; status: string }
type Attendee = { id: string; code: string; attendee_name: string; email: string; ticket_type: string; status: string; checked_in_at: Date | null }

const TABS = [['details', 'Details'], ['tickets', 'Ticket types'], ['planning', 'Planning'], ['attendees', 'Attendees']] as const

export default async function EventWorkspace({ params, searchParams }: { params: Promise<{ orgId: string; eventId: string }>; searchParams: Promise<Record<string, string>> }) {
  const { orgId, eventId } = await params
  const search = await searchParams
  const { org, role } = await requireOrgAccess(orgId)
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) notFound()
  const event = await queryOne<Event>('select * from events where id = $1 and org_id = $2', [eventId, org.id])
  if (!event) notFound()
  const editable = can(role, 'events.manage')
  const tab = TABS.some(([key]) => key === search.tab) ? search.tab : 'details'
  const base = `/dashboard/${org.id}/events/${event.id}`
  const hidden = <><input type="hidden" name="org_id" value={org.id} /><input type="hidden" name="event_id" value={event.id} /></>

  const [ticketTypes, [counts]] = await Promise.all([
    query<TicketTypeRow>('select * from ticket_types where event_id = $1 order by sort_order, created_at', [event.id]),
    query<{ issued: number; checked_in: number; scans: number }>(
      `select (select count(*) from tickets where event_id = $1 and status <> 'cancelled') as issued,
              (select count(*) from tickets where event_id = $1 and status = 'checked_in') as checked_in,
              (select count(*) from check_ins where event_id = $1) as scans`,
      [event.id],
    ),
  ])

  return (
    <>
      <PageHeader eyebrow={`${event.category} · ${formatDate(event.start_time)}`} title={event.title}
        actions={
          <>
            {event.status !== 'draft' && <Link href={`/events/${event.id}`} className="btn-secondary btn-sm" target="_blank"><ExternalLink size={14} /> Public page</Link>}
            <Link href={`/dashboard/${org.id}/scan?event=${event.id}`} className="btn-secondary btn-sm"><ScanLine size={14} /> Scanner</Link>
          </>
        } />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Badge status={event.status} />
        <span className="text-sm text-slate-500">{counts.issued} tickets issued · {counts.checked_in} checked in</span>
        {editable && (
          <form action={setEventStatus} className="ml-auto flex flex-wrap gap-2">
            {hidden}
            {event.status === 'draft' && <button name="status" value="published" className="btn-primary btn-sm">Publish</button>}
            {event.status === 'published' && <button name="status" value="completed" className="btn-secondary btn-sm">Mark completed</button>}
            {['draft', 'published'].includes(event.status) && <ConfirmButton name="status" value="cancelled" className="btn-secondary btn-sm text-rose-600" title="Cancel this event?" message="Ticket holders will see it as cancelled and their tickets stop working at the gate. Refunds are handled by you." confirmLabel="Cancel event">Cancel event</ConfirmButton>}
            {event.status === 'cancelled' && <button name="status" value="draft" className="btn-secondary btn-sm">Restore to draft</button>}
          </form>
        )}
      </div>

      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map(([key, label]) => (
          <Link key={key} href={`${base}?tab=${key}`} className={clsx('whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium', tab === key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800')}>{label}</Link>
        ))}
      </nav>
      <Flash searchParams={search} />

      {tab === 'details' && (
        editable ? (
          <>
            <EventForm orgId={org.id} action={updateEvent} submitLabel="Save changes" values={event} />
            {event.status === 'draft' && (
              <form action={deleteEvent} className="mt-4 text-right">{hidden}<ConfirmButton className="text-sm font-medium text-rose-600 hover:underline" title="Delete this draft?" message="The draft, its ticket types and planning checklist are removed." confirmLabel="Delete draft">Delete draft</ConfirmButton></form>
            )}
          </>
        ) : (
          <div className="card p-6 text-sm"><p className="font-medium">{event.venue}</p><p className="text-slate-500">{formatDateTime(event.start_time)} – {formatDateTime(event.end_time)}</p><p className="mt-4 whitespace-pre-line">{event.description}</p></div>
        )
      )}

      {tab === 'tickets' && (
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div className="card overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Ticket type</th><th>Price</th><th>Sold</th><th>Held</th><th>Capacity</th><th></th></tr></thead>
              <tbody>
                {ticketTypes.map((ticket) => (
                  <tr key={ticket.id} className={ticket.is_active ? '' : 'opacity-50'}>
                    <td data-label="Ticket type"><p className="font-medium">{ticket.name}</p><p className="text-xs text-slate-500">{ticket.description || `Max ${ticket.max_per_order} per order`}{ticket.sales_end ? ` · sales end ${formatDateTime(ticket.sales_end)}` : ''}</p></td>
                    <td data-label="Price">{formatMoney(ticket.price_minor)}</td>
                    <td data-label="Sold">{ticket.quantity_sold}</td>
                    <td data-label="Held">{ticket.quantity_reserved}</td>
                    <td data-label="Capacity">{ticket.quantity_total}</td>
                    <td data-label="" className="whitespace-nowrap text-right">
                      {editable && (
                        <>
                          <Link href={`${base}?tab=tickets&edit=${ticket.id}`} className="btn-secondary btn-sm">Edit</Link>
                          <form action={toggleTicketType} className="ml-1 inline">{hidden}<input type="hidden" name="ticket_type_id" value={ticket.id} /><button className="btn-secondary btn-sm">{ticket.is_active ? 'Pause' : 'Resume'}</button></form>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {ticketTypes.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-slate-500">No ticket types yet.</td></tr>}
              </tbody>
            </table>
          </div>
          {editable && (() => {
            const editing = ticketTypes.find((ticket) => ticket.id === search.edit)
            return (
              <div className="card self-start p-5">
                <h3 className="font-semibold">{editing ? `Edit “${editing.name}”` : 'Add a ticket type'}</h3>
                <p className="mt-1 text-xs text-slate-500">{editing ? 'Price is locked once tickets are sold.' : 'Examples: Student, Staff, Delegate, Corporate table, VIP.'}</p>
                <TicketTypeForm key={editing?.id ?? 'new'} hidden={hidden} ticket={editing} />
                {editing && <Link href={`${base}?tab=tickets`} className="mt-3 block text-center text-sm text-slate-500 hover:underline">Cancel editing</Link>}
              </div>
            )
          })()}
        </div>
      )}

      {tab === 'planning' && <PlanningTab eventId={event.id} hidden={hidden} editable={editable} />}
      {tab === 'attendees' && <AttendeesTab orgId={org.id} eventId={event.id} />}
    </>
  )
}

function TicketTypeForm({ hidden, ticket }: { hidden: React.ReactNode; ticket?: TicketTypeRow }) {
  return (
    <form action={saveTicketType} className="mt-4 grid gap-3">
      {hidden}
      {ticket && <input type="hidden" name="ticket_type_id" value={ticket.id} />}
      <label className="field">Name<input name="name" required defaultValue={ticket?.name} className="input" /></label>
      <label className="field">Short description<input name="description" defaultValue={ticket?.description} className="input" /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="field">Price (₦)<input name="price" inputMode="decimal" defaultValue={ticket ? ticket.price_minor / 100 : 0} className="input" /></label>
        <label className="field">Capacity<input name="quantity_total" type="number" min={1} required defaultValue={ticket?.quantity_total ?? 100} className="input" /></label>
        <label className="field">Max per order<input name="max_per_order" type="number" min={1} max={50} defaultValue={ticket?.max_per_order ?? 10} className="input" /></label>
        <label className="field">Sales end<input name="sales_end" type="datetime-local" defaultValue={ticket?.sales_end ? toLagosInput(ticket.sales_end) : ''} className="input" /></label>
      </div>
      <button className="btn-primary">{ticket ? 'Save' : 'Add ticket type'}</button>
    </form>
  )
}

async function PlanningTab({ eventId, hidden, editable }: { eventId: string; hidden: React.ReactNode; editable: boolean }) {
  const tasks = await query<Task>('select * from event_tasks where event_id = $1 order by status = \'done\', due_date nulls last, created_at', [eventId])
  const done = tasks.filter((task) => task.status === 'done').length
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="card">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <h3 className="font-semibold">Planning checklist</h3>
          <span className="text-sm text-slate-500">{done} of {tasks.length} done</span>
        </div>
        <div className="h-1.5 bg-slate-100"><div className="h-full bg-brand-500" style={{ width: `${tasks.length ? (done / tasks.length) * 100 : 0}%` }} /></div>
        <ul className="divide-y divide-slate-100">
          {tasks.map((task) => (
            <li key={task.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className={clsx('font-medium', task.status === 'done' && 'text-slate-400 line-through')}>{task.title}</p>
                <p className="text-xs text-slate-500">{task.assignee || 'Unassigned'}{task.due_date ? ` · due ${formatDate(task.due_date)}` : ''}</p>
              </div>
              <Badge status={task.status} label={task.status === 'doing' ? 'in progress' : undefined} />
              {editable && (
                <form action={updateTask} className="flex gap-1">
                  {hidden}<input type="hidden" name="task_id" value={task.id} />
                  {task.status !== 'doing' && task.status !== 'done' && <button name="status" value="doing" className="btn-secondary btn-sm">Start</button>}
                  {task.status !== 'done' && <button name="status" value="done" className="btn-secondary btn-sm">Done</button>}
                  {task.status === 'done' && <button name="status" value="todo" className="btn-secondary btn-sm">Reopen</button>}
                  <button name="status" value="delete" className="btn-secondary btn-sm text-rose-600" aria-label="Delete task">✕</button>
                </form>
              )}
            </li>
          ))}
          {tasks.length === 0 && <li className="p-8 text-center text-sm text-slate-500">Add venue bookings, logistics, speakers, catering and security tasks here.</li>}
        </ul>
      </div>
      {editable && (
        <form action={addTask} className="card grid gap-3 self-start p-5">
          {hidden}
          <h3 className="font-semibold">Add a task</h3>
          <label className="field">Task<input name="title" required className="input" placeholder="e.g. Confirm keynote speaker" /></label>
          <label className="field">Owner<input name="assignee" className="input" placeholder="Name or unit" /></label>
          <label className="field">Due date<input name="due_date" type="date" className="input" /></label>
          <button className="btn-primary">Add task</button>
        </form>
      )}
    </div>
  )
}

async function AttendeesTab({ orgId, eventId }: { orgId: string; eventId: string }) {
  const attendees = await query<Attendee>(
    `select t.id, t.code, t.attendee_name, u.email, tt.name as ticket_type, t.status, t.checked_in_at
     from tickets t join users u on u.id = t.user_id join ticket_types tt on tt.id = t.ticket_type_id
     where t.event_id = $1 order by t.attendee_name limit 1000`,
    [eventId],
  )
  return (
    <div className="card overflow-x-auto">
      <div className="flex items-center justify-between border-b border-slate-100 p-4">
        <h3 className="font-semibold">{attendees.length} tickets</h3>
        <a href={`/api/orgs/${orgId}/events/${eventId}/attendees`} className="btn-secondary btn-sm"><Download size={14} /> Export CSV</a>
      </div>
      <table className="data-table">
        <thead><tr><th>Attendee</th><th>Ticket</th><th>Code</th><th>Status</th><th>Checked in</th></tr></thead>
        <tbody>
          {attendees.map((attendee) => (
            <tr key={attendee.id}>
              <td data-label="Attendee"><p className="font-medium">{attendee.attendee_name}</p><p className="text-xs text-slate-500">{attendee.email}</p></td>
              <td data-label="Ticket">{attendee.ticket_type}</td>
              <td data-label="Code" className="font-mono">{formatTicketCode(attendee.code)}</td>
              <td data-label="Status"><Badge status={attendee.status} /></td>
              <td data-label="Checked in">{attendee.checked_in_at ? formatDateTime(attendee.checked_in_at) : '—'}</td>
            </tr>
          ))}
          {attendees.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-500">No tickets issued yet.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
