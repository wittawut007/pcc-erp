import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow all typical dev origins for testing
  allowedDevOrigins: [
    '192.168.1.142',
    'arizona-positive-vault-discharge.trycloudflare.com',
    'localhost',
  ],
} as NextConfig; // Type casting as Next.js types might complain if it's new

export default nextConfig;
