import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Disable React Strict Mode in development to avoid double-invoking effects
  // which can interfere with websocket initialization timing. It has no
  // functional impact in production builds.
  reactStrictMode: false,
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
