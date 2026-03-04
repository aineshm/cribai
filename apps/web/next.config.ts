import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@campusnest/types', '@campusnest/utils', '@campusnest/supabase'],
};

export default nextConfig;
