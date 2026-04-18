import type {Metadata} from 'next';
import './globals.css';
import { Geist, Space_Grotesk } from "next/font/google";
import { cn } from "@/lib/utils";
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

const geist = Geist({subsets:['latin'],variable:'--font-sans'});
const spaceGrotesk = Space_Grotesk({subsets:['latin'],variable:'--font-space'});

export const metadata: Metadata = {
  title: 'Credics: Your Complete Credit Management Ecosystem',
  description: 'Manage shared card limits, track personal dues, and effortlessly coordinate card rotations within your financial community.',
icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
  },
  openGraph: {
    title: 'Credics: Your Complete Credit Management Ecosystem',
    description: 'Manage shared card limits, track personal dues, and effortlessly coordinate card rotations within your financial community.',
    images: [
      {
        url: '/og.webp',
        width: 1200,
        height: 630,
        alt: 'Credics',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Credics: Your Complete Credit Management Ecosystem',
    description: 'Manage shared card limits, track personal dues, and effortlessly coordinate card rotations within your financial community.',
    images: ['/og.webp'],
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={cn("font-sans dark", geist.variable, spaceGrotesk.variable)}>
      <body suppressHydrationWarning>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
