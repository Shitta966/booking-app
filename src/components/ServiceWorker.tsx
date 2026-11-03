'use client'

import { useEffect } from 'react'

/** Registers the service worker that powers push notifications and lets FUTICK install as an app. */
export function ServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined)
  }, [])
  return null
}
