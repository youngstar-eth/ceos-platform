'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Bot,
  Rocket,
  DollarSign,
  Sparkles,
  Trophy,
  User,
  Coins,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const sidebarLinks = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    href: '/dashboard/my-agents',
    label: 'My Agents',
    icon: User,
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
    href: '/dashboard/earn',
    label: 'Earn',
    icon: Coins,
  },
  {
    href: '/dashboard/leaderboard',
    label: 'Leaderboard',
    icon: Trophy,
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
    <aside className="hidden lg:flex flex-col w-64 cp-glass border-r border-cp-cyan/20 p-4">
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
                'relative group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-300 overflow-hidden',
                isActive
                  ? 'text-cp-cyan bg-cp-cyan/10 border border-cp-cyan/20'
                  : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
              )}
            >
              {/* Active indicator glow */}
              {isActive && (
                <div className="absolute inset-0 bg-cp-cyan/5 animate-pulse pointer-events-none" />
              )}

              {/* Hover effect for non-active */}
              {!isActive && (
                <div className="absolute inset-0 bg-gradient-to-r from-cp-cyan/0 via-cp-cyan/5 to-cp-cyan/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none" />
              )}

              <link.icon
                className={cn(
                  'h-4 w-4 transition-colors duration-300',
                  isActive ? 'text-cp-cyan' : 'text-white/40 group-hover:text-cp-cyan'
                )}
              />
              <span className={cn(
                "font-orbitron tracking-wide text-xs",
                isActive ? "text-cp-cyan" : "group-hover:text-white"
              )}>
                {link.label}
              </span>

              {/* Tech decoration for active state */}
              {isActive && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-cp-cyan shadow-[0_0_8px_rgba(0,212,255,0.8)]" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-4 border-t border-cp-cyan/10">
        <div className="relative overflow-hidden p-4 rounded bg-gradient-to-br from-cp-pink/10 to-transparent border border-cp-pink/20 hover:border-cp-pink/40 transition-all group cursor-pointer">
          {/* Scanline effect */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-0 bg-[length:100%_4px,3px_100%] pointer-events-none" />

          <div className="relative z-10">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-bold font-orbitron text-cp-pink group-hover:text-white transition-colors">
                DEPLOY AGENT
              </h4>
              <Rocket className="h-4 w-4 text-cp-pink group-hover:animate-pulse" />
            </div>
            <p className="text-[10px] font-share-tech text-white/50 mb-3 leading-tight">
              Launch autonomous unit on Farcaster network.
            </p>
            <Link
              href="/dashboard/deploy"
              className="flex w-full items-center justify-center rounded-sm text-[10px] font-bold font-orbitron uppercase tracking-widest border border-cp-pink/50 bg-cp-pink/10 text-cp-pink px-3 py-2 hover:bg-cp-pink hover:text-white transition-all shadow-[0_0_10px_rgba(255,0,102,0.1)] hover:shadow-[0_0_20px_rgba(255,0,102,0.4)]"
            >
              INITIALIZE SEQUENCE
            </Link>
          </div>
        </div>
      </div>
    </aside>
  );
}
