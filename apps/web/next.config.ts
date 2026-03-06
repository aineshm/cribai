import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@campusnest/types', '@campusnest/utils', '@campusnest/supabase'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.apartments.com' },
      { protocol: 'https', hostname: 'images1.apartments.com' },
      { protocol: 'https', hostname: 'cdngeneral.rentcafe.com' },
    ],
  },
};

export default nextConfig;
