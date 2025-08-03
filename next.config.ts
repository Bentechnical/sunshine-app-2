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
      // Suppress font preload warnings (optional)
      {
        message: /was preloaded using link preload but not used within a few seconds/i,
      },
    ];
    return config;
  },
};

export default nextConfig;
