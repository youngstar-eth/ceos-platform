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
    <aside className="hidden lg:flex flex-col w-64 border-r border-border bg-card/50 p-4">
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
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )}
            >
              <link.icon
                className={cn(
                  'h-5 w-5',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
              />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-4 border-t border-border">
        <div className="rounded-lg bg-brand-gradient-subtle p-4">
          <h4 className="text-sm font-semibold mb-1">Deploy an Agent</h4>
          <p className="text-xs text-muted-foreground mb-3">
            Create your autonomous AI agent on Farcaster for just 0.005 ETH.
          </p>
          <Link
            href="/dashboard/deploy"
            className="inline-flex items-center justify-center rounded-md text-xs font-medium brand-gradient text-white px-3 py-1.5 hover:opacity-90 transition-opacity"
          >
            Get Started
          </Link>
        </div>
      </div>
    </aside>
  );
}
