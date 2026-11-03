import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // PGlite ships WASM + data files that must be loaded from node_modules at runtime.
  serverExternalPackages: ['@electric-sql/pglite'],
  poweredByHeader: false,
  // Event posters are uploaded through server actions: 4 MB images plus multipart overhead,
  // which stays under Vercel's 4.5 MB request limit.
  experimental: { serverActions: { bodySizeLimit: '4.4mb' } },
  // db/schema.sql is read at runtime, so serverless bundles (Vercel) must include it explicitly.
  outputFileTracingIncludes: { '/**': ['./db/**/*'] },
  images: { remotePatterns: [{ protocol: 'https', hostname: 'images.unsplash.com' }] },
}

export default nextConfig
