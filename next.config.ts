import type {NextConfig} from 'next';

const replitDevDomain = process.env.REPLIT_DEV_DOMAIN || '';
const replitDomains = (process.env.REPLIT_DOMAINS || replitDevDomain)
  .split(',')
  .map(d => d.trim())
  .filter(Boolean);

// Replit preview iframe uses both .replit.dev and .repl.co variants
const replCoVariants = replitDomains
  .filter(d => d.includes('.replit.dev'))
  .map(d => d.replace('.replit.dev', '.repl.co'));

const allowedDevOrigins = [...new Set([...replitDomains, ...replCoVariants])];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  allowedDevOrigins,
  // Allow access to remote image placeholder.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  transpilePackages: ['motion'],
};

export default nextConfig;
