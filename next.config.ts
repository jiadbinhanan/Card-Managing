import type {NextConfig} from 'next';
import withPWAInit from '@ducanh2912/next-pwa';

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
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      // Supabase Storage Domain Added
      {
        protocol: 'https',
        hostname: 'mredhrvxhcdhityoouxa.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  transpilePackages: ['motion'],
};

const withPWA = withPWAInit({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
});

export default withPWA(nextConfig);
