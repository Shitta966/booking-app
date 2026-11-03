import 'server-only'
import { transaction } from './db'
import { getSecret } from './secrets'
import { formatTicketCode, parseScan } from './tickets'

export type CheckInResult = {
  result: 'admitted' | 'already_used' | 'cancelled' | 'wrong_event' | 'invalid'
  message: string
  ticket?: {
    code: string
    attendeeName: string
    ticketType: string
    holderEmail: string
    checkedInAt: string | null
    eventTitle: string
  }
}

type TicketRow = {
  id: string
  code: string
  event_id: string
  status: string
  attendee_name: string
  checked_in_at: Date | null
  ticket_type: string
  holder_email: string
  event_title: string
  event_org_id: string
}

/**
 * Verifies a scanned QR payload or typed ticket code for one event and admits the holder once.
 * The status update is conditional (`status = 'valid'`), so two gates scanning the same ticket
 * at the same moment cannot both admit it. Every attempt is written to check_ins.
 */
export async function checkInTicket(input: { orgId: string; eventId: string; scannedBy: string; payload: string }): Promise<CheckInResult> {
  const parsed = parseScan(input.payload, getSecret('TICKET_SIGNING_SECRET'))

  return transaction(async (db) => {
    const log = async (result: CheckInResult['result'], ticketId: string | null) => {
      await db.query('insert into check_ins (event_id, ticket_id, scanned_by, result) values ($1, $2, $3, $4)', [input.eventId, ticketId, input.scannedBy, result])
    }
    const [event] = await db.query<{ id: string }>('select id from events where id = $1 and org_id = $2', [input.eventId, input.orgId])
    if (!event) return { result: 'invalid', message: 'This event does not belong to your organisation.' }

    if (parsed.kind === 'invalid') {
      await log('invalid', null)
      return { result: 'invalid', message: 'Not a FUTICK ticket, or the QR code has been altered.' }
    }

    const [ticket] = await db.query<TicketRow>(
      `select t.id, t.code, t.event_id, t.status, t.attendee_name, t.checked_in_at, tt.name as ticket_type,
              u.email as holder_email, e.title as event_title, e.org_id as event_org_id
       from tickets t join ticket_types tt on tt.id = t.ticket_type_id join users u on u.id = t.user_id
       join events e on e.id = t.event_id
       where ${parsed.kind === 'qr' ? 't.id = $1' : 't.code = $1'} for update of t`,
      [parsed.kind === 'qr' ? parsed.ticketId : parsed.code],
    )
    if (!ticket) {
      await log('invalid', null)
      return { result: 'invalid', message: 'No ticket matches this code.' }
    }

    const summary = (checkedInAt: Date | null) => ({
      code: formatTicketCode(ticket.code),
      attendeeName: ticket.attendee_name,
      ticketType: ticket.ticket_type,
      holderEmail: ticket.holder_email,
      checkedInAt: checkedInAt ? new Date(checkedInAt).toISOString() : null,
      eventTitle: ticket.event_title,
    })

    if (ticket.event_id !== input.eventId) {
      await log('wrong_event', ticket.id)
      // Do not reveal details of another organisation's attendees.
      const details = ticket.event_org_id === input.orgId ? summary(ticket.checked_in_at) : undefined
      return { result: 'wrong_event', message: details ? `This ticket is for ${ticket.event_title}.` : 'This ticket is for a different event.', ticket: details }
    }
    if (ticket.status === 'cancelled') {
      await log('cancelled', ticket.id)
      return { result: 'cancelled', message: 'This ticket was cancelled. Do not admit.', ticket: summary(null) }
    }
    const [admitted] = await db.query<{ checked_in_at: Date }>(
      `update tickets set status = 'checked_in', checked_in_at = now(), checked_in_by = $2
       where id = $1 and status = 'valid' returning checked_in_at`,
      [ticket.id, input.scannedBy],
    )
    if (!admitted) {
      await log('already_used', ticket.id)
      return { result: 'already_used', message: 'Already checked in. Do not admit again.', ticket: summary(ticket.checked_in_at) }
    }
    await log('admitted', ticket.id)
    return { result: 'admitted', message: 'Valid ticket. Admit.', ticket: summary(admitted.checked_in_at) }
  })
}
