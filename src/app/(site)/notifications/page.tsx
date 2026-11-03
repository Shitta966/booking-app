import Link from 'next/link'
import { Bell } from 'lucide-react'
import { PushToggle } from '@/components/PushToggle'
import { requireUser } from '@/lib/auth'
import { query } from '@/lib/db'
import { formatDateTime } from '@/lib/format'

export const metadata = { title: 'Notifications' }

export default async function NotificationsPage() {
  const user = await requireUser('/notifications')
  const items = await query<{ id: string; title: string; body: string; href: string | null; read_at: Date | null; created_at: Date }>(
    'select id, title, body, href, read_at, created_at from notifications where user_id = $1 order by created_at desc limit 100',
    [user.id],
  )
  // Opening the full list counts as reading everything on it.
  await query('update notifications set read_at = now() where user_id = $1 and read_at is null', [user.id])

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-moss-400">Alerts</p>
      <h1 className="mt-3 text-4xl font-medium tracking-tight text-moss-950">Notifications</h1>
      <div className="mt-6 rounded-3xl bg-white p-5 shadow-[0_8px_30px_rgba(31,38,18,0.05)]">
        <p className="mb-3 text-sm text-moss-800/70">Get alerts on this phone or computer even when FUTICK is closed — payments to review, tickets issued, events cancelled.</p>
        <PushToggle />
      </div>
      <ul className="mt-6 divide-y divide-moss-100 overflow-hidden rounded-3xl bg-white shadow-[0_8px_30px_rgba(31,38,18,0.05)]">
        {items.map((item) => (
          <li key={item.id} className={item.read_at ? '' : 'bg-moss-50'}>
            <Link href={item.href ?? '#'} className="flex gap-4 px-6 py-4 hover:bg-moss-50">
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${item.read_at ? 'bg-transparent' : 'bg-gold-400'}`} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-moss-950">{item.title}</span>
                {item.body && <span className="mt-0.5 block text-sm text-moss-800/70">{item.body}</span>}
                <span className="mt-1 block text-xs text-moss-800/50">{formatDateTime(item.created_at)}</span>
              </span>
            </Link>
          </li>
        ))}
        {items.length === 0 && <li className="flex flex-col items-center gap-2 px-6 py-14 text-center text-sm text-moss-800/60"><Bell size={22} />No notifications yet.</li>}
      </ul>
    </main>
  )
}
