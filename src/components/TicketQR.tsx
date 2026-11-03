'use client'

import { QRCodeSVG } from 'qrcode.react'

export function TicketQR({ payload, size = 220 }: { payload: string; size?: number }) {
  return <QRCodeSVG value={payload} size={size} level="M" marginSize={2} className="h-auto w-full max-w-[260px]" title="Ticket QR code" />
}
