import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Suspense } from 'react'
import { ServiceWorker } from '@/components/ServiceWorker'
import { FlashToast, ToastProvider } from '@/components/Toaster'
import { getSettings } from '@/lib/settings'

export async function generateMetadata(): Promise<Metadata> {
  const { branding } = await getSettings()
  return {
    title: { default: `${branding.appName} — ${branding.tagline}`, template: `%s · ${branding.appName}` },
    description: 'Corporate event planning, ticketing and QR check-in for FUT Minna faculties, departments and partners.',
    icons: { icon: '/favicon.svg', apple: '/icons/icon-180.png' },
    appleWebApp: { capable: true, title: branding.appName, statusBarStyle: 'default' },
    applicationName: branding.appName,
  }
}

export const viewport: Viewport = { themeColor: '#2b3fd9', viewportFit: 'cover', width: 'device-width', initialScale: 1 }

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { branding } = await getSettings()
  // Super admins can change the primary brand colour from platform settings.
  const brandColor = /^#[0-9a-f]{6}$/i.test(branding.primaryColor) ? branding.primaryColor : '#2b3fd9'
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" />
        <style>{`:root { --color-brand-600: ${brandColor}; }`}</style>
      </head>
      <body className="min-h-screen">
        <ToastProvider>
          {children}
          <Suspense fallback={null}><FlashToast /></Suspense>
          <ServiceWorker />
        </ToastProvider>
      </body>
    </html>
  )
}
