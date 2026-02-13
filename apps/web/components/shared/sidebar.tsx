'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Bot,
  Rocket,
  DollarSign,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const sidebarLinks = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    href: '/dashboard/agents',
    label: 'Agents',
    icon: Bot,
  },
  {
    href: '/dashboard/deploy',
    label: 'Deploy',
    icon: Rocket,
  },
  {
    href: '/dashboard/revenue',
    label: 'Revenue',
    icon: DollarSign,
  },
  {
    href: '/dashboard/skills',
    label: 'Skills',
    icon: Sparkles,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex flex-col w-64 neon-border-right bg-void/50 p-4">
      <nav className="flex flex-col gap-1">
        {sidebarLinks.map((link) => {
          const isActive =
            pathname === link.href ||
            (link.href !== '/dashboard' && pathname.startsWith(link.href));

          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                isActive
                  ? 'bg-neon-pink/10 text-neon-pink border border-neon-pink/20'
                  : 'text-muted-foreground hover:text-neon-cyan hover:bg-neon-cyan/5 border border-transparent'
              )}
            >
              {/* Active indicator bar */}
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-neon-pink rounded-full shadow-[0_0_6px_#ff2a6d]" />
              )}
              <link.icon
                className={cn(
                  'h-5 w-5',
                  isActive ? 'text-neon-pink' : 'text-muted-foreground'
                )}
              />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-4 border-t border-neon-cyan/10">
        <div className="rounded-lg border border-neon-pink/20 bg-neon-pink/5 p-4 relative overflow-hidden">
          {/* Subtle grid texture */}
          <div className="absolute inset-0 opacity-5 bg-[linear-gradient(to_right,rgba(255,42,109,0.3)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,42,109,0.3)_1px,transparent_1px)] bg-[length:20px_20px]" />
          <div className="relative">
            <h4 className="text-sm font-semibold font-orbitron text-neon-pink mb-1">
              Deploy
            </h4>
            <p className="text-xs text-muted-foreground mb-3">
              Launch your autonomous AI agent on Farcaster for 0.005 ETH.
            </p>
            <Link
              href="/dashboard/deploy"
              className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-neon-pink/40 bg-neon-pink/10 text-neon-pink px-3 py-1.5 hover:bg-neon-pink/20 transition-all"
            >
              Get Started
            </Link>
          </div>
        </div>
      </div>
    </aside>
  );
}
