import { ImageResponse } from 'next/og'

const SIZES: Record<string, { size: number; maskable?: boolean; badge?: boolean }> = {
  'icon-180.png': { size: 180 },
  'icon-192.png': { size: 192 },
  'icon-512.png': { size: 512 },
  'maskable-512.png': { size: 512, maskable: true },
  'badge-72.png': { size: 72, badge: true },
}

/** App icons drawn from the FUTICK ticket mark, rendered to PNG on request and cached by browsers. */
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  const spec = SIZES[name]
  if (!spec) return new Response('Not found', { status: 404 })
  const { size, maskable, badge } = spec
  const mark = Math.round(size * (maskable ? 0.5 : 0.62))
  const icon = (
    <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', background: badge ? 'transparent' : '#2b3fd9', borderRadius: maskable || badge ? 0 : size * 0.22 }}>
      <svg width={mark} height={mark * 0.8} viewBox="0 0 40 32" fill="none">
        <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h27A2.5 2.5 0 0 1 36 6.5v5.2a4.5 4.5 0 0 0 0 8.6v5.2a2.5 2.5 0 0 1-2.5 2.5h-27A2.5 2.5 0 0 1 4 25.5v-5.2a4.5 4.5 0 0 0 0-8.6V6.5Z" stroke={badge ? '#000' : '#fff'} strokeWidth="2.6" strokeLinejoin="round" />
        <path d="M26 8.5v15" stroke={badge ? '#000' : '#ffc93c'} strokeWidth="2.2" strokeLinecap="round" strokeDasharray="2.2 3.2" />
        <path d="M11 13h9M11 18.5h6" stroke={badge ? '#000' : '#fff'} strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    </div>
  )
  return new ImageResponse(icon, { width: size, height: size, headers: { 'cache-control': 'public, max-age=604800, immutable' } })
}
