import type {Metadata} from 'next';
import './globals.css';
import { Geist, Space_Grotesk } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});
const spaceGrotesk = Space_Grotesk({subsets:['latin'],variable:'--font-space'});

export const metadata: Metadata = {
  title: 'NexLimit Dashboard',
  description: 'High-end Credit Card Limit Management PWA',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={cn("font-sans dark", geist.variable, spaceGrotesk.variable)}>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
