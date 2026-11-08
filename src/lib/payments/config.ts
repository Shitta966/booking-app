import 'server-only'
import { query } from '../db'
import { decryptText, encryptText } from '../encryption'
import { getSecret } from '../secrets'

export type Provider = 'stripe' | 'flutterwave'
export const PROVIDERS: Provider[] = ['stripe', 'flutterwave']
export const PROVIDER_LABELS: Record<Provider, string> = { stripe: 'Stripe', flutterwave: 'Flutterwave' }

/** What is stored in platform_settings.payments. Secret fields are encrypted. */
type StoredGateway = { enabled?: boolean; publicKey?: string; secretKeyEnc?: string; webhookSecretEnc?: string }
type StoredPayments = { bankTransferEnabled?: boolean; stripe?: StoredGateway; flutterwave?: StoredGateway }

export type GatewayConfig = {
  enabled: boolean
  publicKey: string
  secretKey: string
  /** Stripe: webhook signing secret (whsec_…). Flutterwave: the "secret hash" set on the dashboard. */
  webhookSecret: string
  /** Where each value came from, for the admin page. */
  source: { secretKey: 'database' | 'environment' | 'missing'; webhookSecret: 'database' | 'environment' | 'missing' }
}

export type PaymentConfig = { bankTransferEnabled: boolean; stripe: GatewayConfig; flutterwave: GatewayConfig }

const ENV: Record<Provider, { publicKey: string; secretKey: string; webhookSecret: string }> = {
  stripe: { publicKey: 'STRIPE_PUBLISHABLE_KEY', secretKey: 'STRIPE_SECRET_KEY', webhookSecret: 'STRIPE_WEBHOOK_SECRET' },
  flutterwave: { publicKey: 'FLUTTERWAVE_PUBLIC_KEY', secretKey: 'FLUTTERWAVE_SECRET_KEY', webhookSecret: 'FLUTTERWAVE_WEBHOOK_HASH' },
}

const encryptionKey = () => getSecret('SESSION_SECRET')

async function loadStored(): Promise<StoredPayments> {
  const [row] = await query<{ value: StoredPayments }>(`select value from platform_settings where key = 'payments'`)
  return row?.value ?? {}
}

function resolve(provider: Provider, stored: StoredGateway | undefined): GatewayConfig {
  const env = ENV[provider]
  const fromDb = (value?: string) => (value ? decryptText(value, encryptionKey()) ?? '' : '')
  const secretDb = fromDb(stored?.secretKeyEnc)
  const hookDb = fromDb(stored?.webhookSecretEnc)
  const secretEnv = process.env[env.secretKey]?.trim() ?? ''
  const hookEnv = process.env[env.webhookSecret]?.trim() ?? ''
  const secretKey = secretDb || secretEnv
  return {
    enabled: Boolean(stored?.enabled) && Boolean(secretKey),
    publicKey: stored?.publicKey || process.env[env.publicKey]?.trim() || '',
    secretKey,
    webhookSecret: hookDb || hookEnv,
    source: {
      secretKey: secretDb ? 'database' : secretEnv ? 'environment' : 'missing',
      webhookSecret: hookDb ? 'database' : hookEnv ? 'environment' : 'missing',
    },
  }
}

export async function getPaymentConfig(): Promise<PaymentConfig> {
  const stored = await loadStored()
  return {
    bankTransferEnabled: stored.bankTransferEnabled !== false,
    stripe: resolve('stripe', stored.stripe),
    flutterwave: resolve('flutterwave', stored.flutterwave),
  }
}

/** Gateways attendees can pay with right now. */
export async function enabledProviders() {
  const config = await getPaymentConfig()
  return PROVIDERS.filter((provider) => config[provider].enabled)
}

/** Whether keys are test or live, judged from the secret key prefix. */
export function keyMode(provider: Provider, secretKey: string): 'test' | 'live' | 'unknown' {
  if (!secretKey) return 'unknown'
  if (provider === 'stripe') return secretKey.startsWith('sk_live_') || secretKey.startsWith('rk_live_') ? 'live' : secretKey.startsWith('sk_test_') || secretKey.startsWith('rk_test_') ? 'test' : 'unknown'
  return /_TEST/i.test(secretKey) ? 'test' : /^FLWSECK-/i.test(secretKey) ? 'live' : 'unknown'
}

export function maskSecret(value: string) {
  return value ? `••••${value.slice(-4)}` : ''
}

/**
 * Saves gateway settings. Blank secret fields keep the stored value; `clear` removes it.
 * Secrets are encrypted before they reach the database.
 */
export async function savePaymentSettings(update: {
  bankTransferEnabled?: boolean
  provider?: Provider
  enabled?: boolean
  publicKey?: string
  secretKey?: string
  webhookSecret?: string
  clearSecrets?: boolean
}, actorId: string) {
  const stored = await loadStored()
  if (update.bankTransferEnabled !== undefined) stored.bankTransferEnabled = update.bankTransferEnabled
  if (update.provider) {
    const current: StoredGateway = { ...(stored[update.provider] ?? {}) }
    if (update.enabled !== undefined) current.enabled = update.enabled
    if (update.publicKey !== undefined) current.publicKey = update.publicKey
    if (update.clearSecrets) {
      delete current.secretKeyEnc
      delete current.webhookSecretEnc
    }
    if (update.secretKey) current.secretKeyEnc = encryptText(update.secretKey, encryptionKey())
    if (update.webhookSecret) current.webhookSecretEnc = encryptText(update.webhookSecret, encryptionKey())
    stored[update.provider] = current
  }
  await query(
    `insert into platform_settings (key, value, updated_by, updated_at) values ('payments', $1, $2, now())
     on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
    [JSON.stringify(stored), actorId],
  )
}
