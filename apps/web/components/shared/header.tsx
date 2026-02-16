'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { WalletButton } from '@/components/shared/wallet-button';
import { cn } from '@/lib/utils';

const navLinks = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/agents', label: 'Agents' },
  { href: '/dashboard/deploy', label: 'Deploy' },
  { href: '/dashboard/revenue', label: 'Revenue' },
  { href: '/dashboard/leaderboard', label: 'Leaderboard' },
];

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 w-full cp-glass border-b border-cp-cyan/20">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative h-9 w-9 bg-cp-cyan/10 border border-cp-cyan/30 flex items-center justify-center transition-all group-hover:bg-cp-cyan/20 group-hover:shadow-[0_0_15px_rgba(0,212,255,0.3)]">
              <span className="text-cp-cyan font-bold text-xs font-orbitron tracking-widest">OC</span>
              {/* Corner accents */}
              <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-cp-cyan/50" />
              <div className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r border-cp-cyan/50" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-black font-orbitron text-white tracking-widest leading-none group-hover:text-cp-cyan transition-colors">
                CEOS.RUN
              </span>
              <span className="text-[9px] font-share-tech text-white/30 tracking-[0.3em] leading-none">
                PROTOCOL v2.4
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "relative px-4 py-2 text-[10px] uppercase tracking-widest font-orbitron transition-all duration-300 group overflow-hidden",
                  pathname === link.href ? "text-cp-cyan" : "text-white/60 hover:text-white"
                )}
              >
                <span className="relative z-10">{link.label}</span>
                {pathname === link.href && (
                  <span className="absolute inset-0 bg-cp-cyan/5 border-b border-cp-cyan/50" />
                )}
                <span className="absolute bottom-0 left-0 w-0 h-[1px] bg-cp-cyan group-hover:w-full transition-all duration-300" />
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-black/40 border border-white/5 rounded-sm">
            <div className="h-1.5 w-1.5 rounded-full bg-cp-acid animate-pulse" />
            <span className="text-[9px] font-share-tech text-white/40 tracking-widest">
              GAS: <span className="text-cp-acid">0.02 GWEI</span>
            </span>
          </div>
          <WalletButton />
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden text-cp-cyan hover:bg-cp-cyan/10 hover:text-cp-cyan"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        className={cn(
          'md:hidden border-t border-cp-cyan/10 overflow-hidden transition-all bg-[#030014]/95 backdrop-blur-xl',
          mobileMenuOpen ? 'max-h-64' : 'max-h-0'
        )}
      >
        <nav className="container flex flex-col gap-1 py-3">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-4 py-3 text-xs font-orbitron uppercase tracking-widest text-white/70 hover:text-cp-cyan hover:bg-cp-cyan/5 border-l-2 border-transparent hover:border-cp-cyan transition-all"
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
