import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  typescript: {
    ignoreBuildErrors: process.env.NODE_ENV !== 'production',
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  transpilePackages: ['@ceosrun/shared'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.fal.ai',
      },
      {
        protocol: 'https',
        hostname: 'fal.media',
      },
      {
        protocol: 'https',
        hostname: 'i.imgur.com',
      },
      {
        protocol: 'https',
        hostname: '*.fal.run',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
      {
        protocol: 'https',
        hostname: 'imagedelivery.net',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
  // Coinbase AgentKit + CDP SDK use native Node crypto and ESM-only deps
  // that webpack struggles to bundle.  Keep them external on the server.
  serverExternalPackages: [
    '@coinbase/agentkit',
    '@coinbase/cdp-sdk',
    '@coinbase/coinbase-sdk',
    '@coinbase/agentkit-langchain',
    '@langchain/core',
    '@langchain/langgraph',
  ],
  webpack: (config, { isServer }) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };

    // pino-pretty is an optional dependency of pino used by WalletConnect internals.
    // It's not needed at runtime in the browser, so we externalize it to avoid build errors.
    if (!isServer) {
      config.externals = [...(config.externals || []), 'pino-pretty'];
    }
    return config;
  },
};

export default nextConfig;
