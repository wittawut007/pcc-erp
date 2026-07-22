import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Compression & Optimization
  compress: true,
  
  // Package import optimization for tree-shaking icon libraries & utilities
  experimental: {
    optimizePackageImports: ['lucide-react', 'react-hot-toast', 'chart.js', 'recharts'],
  },

  // Remove console logs in production except errors & warnings
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },

  // Allow all typical dev origins for testing
  allowedDevOrigins: [
    '192.168.1.142',
    'arizona-positive-vault-discharge.trycloudflare.com',
    'localhost',
    '127.0.0.1',
  ],
} as NextConfig;

export default nextConfig;
