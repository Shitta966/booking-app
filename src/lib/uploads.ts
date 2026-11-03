import 'server-only'
import { query } from './db'

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

/** Identify the image type from its first bytes; the browser-supplied type and file name are not trusted. */
function sniffImageType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end))
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  return null
}

export class UploadError extends Error {}

/** Saves an uploaded image and returns the URL it is served from. */
export async function saveImageUpload(file: File, orgId: string, userId: string) {
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError('The poster must be 4 MB or smaller.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const contentType = sniffImageType(bytes)
  if (!contentType) throw new UploadError('Upload a JPG, PNG or WebP image.')
  const [row] = await query<{ id: string }>(
    'insert into uploads (org_id, content_type, size_bytes, data, uploaded_by) values ($1, $2, $3, $4, $5) returning id',
    [orgId, contentType, bytes.length, Buffer.from(bytes), userId],
  )
  return `/api/uploads/${row.id}`
}
