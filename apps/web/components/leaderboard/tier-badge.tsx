'use client';

import { CEOSTier, TIER_EMOJIS, TIER_LABELS } from '@openclaw/shared/types/ceos-score';
import { cn } from '@/lib/utils';
import { getTierColor, getTierBgColor, getTierBorderColor, getTierGlow } from '@/lib/leaderboard-utils';

interface TierBadgeProps {
  tier: CEOSTier;
  size?: 'sm' | 'md' | 'lg';
  showGlow?: boolean;
}

const sizeClasses: Record<string, string> = {
  sm: 'text-[10px] px-1.5 py-0.5 gap-0.5',
  md: 'text-xs px-2.5 py-1 gap-1',
  lg: 'text-sm px-3 py-1.5 gap-1.5',
};

export function TierBadge({ tier, size = 'md', showGlow = false }: TierBadgeProps) {
  const label = TIER_LABELS[tier];
  const emoji = TIER_EMOJIS[tier];
  const glow = getTierGlow(tier);

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-semibold font-rajdhani tracking-wide transition-all',
        getTierColor(tier),
        getTierBgColor(tier),
        getTierBorderColor(tier),
        sizeClasses[size],
      )}
      style={showGlow ? { boxShadow: glow } : undefined}
    >
      <span>{emoji}</span>
      <span>{label}</span>
    </span>
  );
}
