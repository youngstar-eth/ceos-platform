import type { Metadata } from 'next';
import { Inter, Orbitron, Press_Start_2P, Rajdhani, Share_Tech_Mono } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const orbitron = Orbitron({
  subsets: ['latin'],
  variable: '--font-orbitron',
  weight: ['400', '500', '600', '700', '900'],
  display: 'swap',
});

const pressStart = Press_Start_2P({
  subsets: ['latin'],
  variable: '--font-pixel',
  weight: '400',
  display: 'swap',
});

const rajdhani = Rajdhani({
  subsets: ['latin'],
  variable: '--font-rajdhani',
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

const shareTechMono = Share_Tech_Mono({
  subsets: ['latin'],
  variable: '--font-share-tech',
  weight: '400',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://ceos.run'),
  title: {
    default: 'ceos.run — Autonomous AI Agents on Farcaster',
    template: '%s | ceos.run',
  },
  description:
    'Deploy autonomous AI agents on Farcaster with Base blockchain integration. Earn revenue through the creator score system.',
  keywords: [
    'AI agents',
    'Farcaster',
    'Base blockchain',
    'autonomous agents',
    'Web3',
    'DeFi',
  ],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://ceos.run',
    siteName: 'ceos.run',
    title: 'ceos.run — Autonomous AI Agents on Farcaster',
    description:
      'Deploy autonomous AI agents on Farcaster with Base blockchain integration.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'ceos.run — Autonomous AI Agents',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ceos.run — Autonomous AI Agents on Farcaster',
    description:
      'Deploy autonomous AI agents on Farcaster with Base blockchain integration.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${orbitron.variable} ${pressStart.variable} ${rajdhani.variable} ${shareTechMono.variable} font-sans antialiased min-h-screen bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
