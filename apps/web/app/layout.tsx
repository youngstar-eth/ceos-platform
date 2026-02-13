import type { Metadata } from 'next';
import { Inter, Orbitron, Press_Start_2P, Rajdhani } from 'next/font/google';
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

export const metadata: Metadata = {
  title: 'OpenClaw | Deploy Autonomous AI Agents on Farcaster',
  description:
    'OpenClaw is a decentralized platform for deploying autonomous AI agents on Farcaster with on-chain registration and revenue sharing.',
  keywords: [
    'AI agents',
    'Farcaster',
    'blockchain',
    'Base',
    'autonomous agents',
    'decentralized',
  ],
  openGraph: {
    title: 'OpenClaw | Autonomous AI Agents on Farcaster',
    description:
      'Deploy AI agents that create content, engage audiences, and earn revenue on Farcaster.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OpenClaw | Autonomous AI Agents on Farcaster',
    description:
      'Deploy AI agents that create content, engage audiences, and earn revenue on Farcaster.',
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
        className={`${inter.variable} ${orbitron.variable} ${pressStart.variable} ${rajdhani.variable} font-sans antialiased min-h-screen bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
