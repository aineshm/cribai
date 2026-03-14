import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@campusnest/types', '@campusnest/utils', '@campusnest/supabase'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.apartments.com' },
      { protocol: 'https', hostname: 'images1.apartments.com' },
      { protocol: 'https', hostname: 'cdngeneral.rentcafe.com' },
      { protocol: 'https', hostname: 'photos.zillowstatic.com' },
      { protocol: 'https', hostname: '**.zillowstatic.com' },
    ],
  },
  async redirects() {
    return [
      {
        source: '/listings',
        destination: '/explore',
        permanent: true,
      },
      {
        source: '/cribai',
        destination: '/explore',
        permanent: true,
      },
      {
        source: '/subleases',
        destination: '/sublease',
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://api.mapbox.com",
              "style-src 'self' 'unsafe-inline' https://api.mapbox.com",
              "img-src 'self' data: blob: https://*.apartments.com https://images1.apartments.com https://cdngeneral.rentcafe.com https://*.zillowstatic.com https://api.mapbox.com https://*.tiles.mapbox.com",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mapbox.com https://events.mapbox.com",
              "worker-src 'self' blob:",
              "frame-ancestors 'none'",
            ].join('; '),
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self)',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
