import type { MetadataRoute } from 'next'

/** Web app manifest: lets FUTICK install to a phone's home screen and open full-screen like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'FUTICK — Events & Tickets at FUT Minna',
    short_name: 'FUTICK',
    description: 'Book event tickets, show QR codes at the gate, and run events at FUT Minna.',
    start_url: '/tickets',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f5f5ef',
    theme_color: '#2b3fd9',
    categories: ['events', 'education', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'My tickets', url: '/tickets' },
      { name: 'Find events', url: '/events' },
      { name: 'Dashboard', url: '/dashboard' },
    ],
  }
}
