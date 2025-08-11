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
    // Suppress known dev-only warnings from supabase realtime client
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      { message: /Critical dependency: the request of a dependency is an expression/ },
    ];
    config.ignoreWarnings.push(
      { message: /require\.extensions is not supported by webpack/i },
      { message: /was preloaded using link preload but not used within a few seconds/i },
    );
    return config;
  },
};

export default nextConfig;
