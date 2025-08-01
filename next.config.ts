import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    domains: ['img.clerk.com', 'rodqnqzfjixznlblnlpe.supabase.co'],
  },
  webpack: (config) => {
    config.ignoreWarnings = [
      {
        message: /require\.extensions is not supported by webpack/i,
      },
    ];
    return config;
  },
};

export default nextConfig;
