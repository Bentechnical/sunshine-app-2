import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Enable TypeScript incremental builds for faster builds
  typescript: {
    ignoreBuildErrors: false,
  },
  // Custom 404 page
  exportPathMap: async function () {
    return {
      '/': { page: '/' },
      '/dashboard': { page: '/dashboard' },
      // Add other routes as needed
      '/_not-found': { page: '/not-found.page' },
    }
  },
  // Add any additional config options here
};

export default nextConfig;
