import { queryOne } from '@/lib/db'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 })
  const upload = await queryOne<{ content_type: string; data: Uint8Array }>('select content_type, data from uploads where id = $1', [id])
  if (!upload) return new Response('Not found', { status: 404 })
  return new Response(Buffer.from(upload.data), {
    headers: {
      'content-type': upload.content_type,
      // Each upload gets a new id, so the bytes behind a URL never change.
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; img-src 'self'; sandbox",
    },
  })
}
