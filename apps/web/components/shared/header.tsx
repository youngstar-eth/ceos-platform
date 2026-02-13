'use client';

import Link from 'next/link';
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
];

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full neon-border-bottom bg-void/90 backdrop-blur-xl supports-[backdrop-filter]:bg-void/70">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="relative h-8 w-8 rounded-lg brand-gradient flex items-center justify-center transition-all group-hover:neon-box-pink">
              <span className="text-void font-bold text-sm font-orbitron">OC</span>
            </div>
            <span className="text-lg font-bold font-orbitron vaporwave-gradient-text tracking-wider">
              OpenClaw
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="relative px-3 py-2 text-sm font-medium text-muted-foreground hover:text-neon-cyan transition-colors rounded-md hover:bg-neon-cyan/5 group"
              >
                {link.label}
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-[1px] bg-neon-cyan group-hover:w-3/4 transition-all duration-300" />
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <WalletButton />
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden text-neon-purple hover:bg-neon-purple/10"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        className={cn(
          'md:hidden border-t border-neon-purple/10 overflow-hidden transition-all bg-void/95',
          mobileMenuOpen ? 'max-h-64' : 'max-h-0'
        )}
      >
        <nav className="container flex flex-col gap-1 py-3">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-neon-cyan transition-colors rounded-md hover:bg-neon-cyan/5"
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
