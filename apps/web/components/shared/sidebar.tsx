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
    jp: 'ダッシュ',
  },
  {
    href: '/dashboard/agents',
    label: 'Agents',
    icon: Bot,
    jp: 'エージェント',
  },
  {
    href: '/dashboard/deploy',
    label: 'Deploy',
    icon: Rocket,
    jp: 'デプロイ',
  },
  {
    href: '/dashboard/revenue',
    label: 'Revenue',
    icon: DollarSign,
    jp: '収益',
  },
  {
    href: '/dashboard/skills',
    label: 'Skills',
    icon: Sparkles,
    jp: 'スキル',
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
                'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all group',
                isActive
                  ? 'bg-neon-pink/10 text-neon-pink border border-neon-pink/20'
                  : 'text-muted-foreground hover:text-neon-cyan hover:bg-neon-cyan/5 border border-transparent'
              )}
            >
              {/* Active indicator bar */}
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-neon-pink rounded-full shadow-[0_0_6px_#ff71ce]" />
              )}
              <link.icon
                className={cn(
                  'h-5 w-5',
                  isActive ? 'text-neon-pink' : 'text-muted-foreground group-hover:text-neon-cyan'
                )}
              />
              <span className="flex-1">{link.label}</span>
              <span className={cn(
                'text-[7px] font-pixel transition-opacity',
                isActive ? 'text-neon-pink/40' : 'text-vapor-lavender/20 opacity-0 group-hover:opacity-100'
              )}>
                {link.jp}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-4 border-t border-neon-purple/10">
        <div className="rounded-xl border border-neon-purple/20 bg-neon-purple/5 p-4 relative overflow-hidden">
          {/* Memphis dot pattern */}
          <div className="absolute inset-0 memphis-dots opacity-10" />
          <div className="relative">
            <h4 className="text-sm font-semibold font-orbitron vaporwave-gradient-text mb-1">
              Deploy
            </h4>
            <p className="text-xs text-muted-foreground mb-3">
              Launch your autonomous AI agent on Farcaster for 0.005 ETH.
            </p>
            <Link
              href="/dashboard/deploy"
              className="inline-flex items-center justify-center rounded-lg text-xs font-medium brand-gradient text-white px-3 py-1.5 hover:opacity-90 transition-all"
            >
              Get Started
            </Link>
          </div>
        </div>
      </div>
    </aside>
  );
}
