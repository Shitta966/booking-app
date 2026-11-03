import 'server-only'
import fs from 'node:fs'
import path from 'node:path'
import webpush from 'web-push'
import { dataDir } from './dataDir'
import { query } from './db'

type VapidKeys = { publicKey: string; privateKey: string }
let cached: VapidKeys | null | undefined

/**
 * VAPID keys identify this server to browser push services. Production reads VAPID_PUBLIC_KEY and
 * VAPID_PRIVATE_KEY; without them push is switched off and in-app notifications still work.
 * Development generates a pair once and keeps it in ~/.futick/.vapid.json.
 */
export function getVapidKeys(): VapidKeys | null {
  if (cached !== undefined) return cached
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  if (publicKey && privateKey) cached = { publicKey, privateKey }
  else if (process.env.NODE_ENV === 'production') cached = null
  else {
    const file = path.join(dataDir(), '.vapid.json')
    if (!fs.existsSync(file)) {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, JSON.stringify(webpush.generateVAPIDKeys()), { mode: 0o600 })
    }
    cached = JSON.parse(fs.readFileSync(file, 'utf8')) as VapidKeys
  }
  if (cached) webpush.setVapidDetails(process.env.VAPID_SUBJECT?.trim() || 'mailto:support@futick.ng', cached.publicKey, cached.privateKey)
  return cached
}

type Subscription = { id: string; endpoint: string; p256dh: string; auth: string }

export type PushResult = { devices: number; delivered: number; removed: number; failed: number }

/**
 * Sends a push message to every device the users have subscribed and reports what the push services
 * accepted. Subscriptions the service says are gone (404/410) are removed.
 */
export async function sendPush(userIds: string[], message: { title: string; body: string; href?: string | null; tag?: string }): Promise<PushResult> {
  const result: PushResult = { devices: 0, delivered: 0, removed: 0, failed: 0 }
  if (!userIds.length || !getVapidKeys()) return result
  const subscriptions = await query<Subscription>('select id, endpoint, p256dh, auth from push_subscriptions where user_id = any($1::uuid[])', [userIds])
  result.devices = subscriptions.length
  const payload = JSON.stringify({ title: message.title, body: message.body, href: message.href ?? '/', tag: message.tag })
  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, { TTL: 60 * 60 * 12, urgency: 'high' })
      await query('update push_subscriptions set last_used_at = now() where id = $1', [subscription.id])
      result.delivered += 1
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        await query('delete from push_subscriptions where id = $1', [subscription.id])
        result.removed += 1
      } else {
        result.failed += 1
        console.error('Push delivery failed', status, (error as Error).message)
      }
    }
  }))
  return result
}
