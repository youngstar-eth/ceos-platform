"use client";

import { CEOSTier, TIER_EMOJIS, TIER_LABELS } from "@ceosrun/shared/types";
import { cn } from "@/lib/utils";
import { getTierColor, getTierBgColor, getTierBorderColor } from "@/lib/leaderboard-utils";

interface TierBadgeProps {
  tier: CEOSTier;
  size?: "sm" | "md" | "lg";
}

const sizeClasses: Record<string, string> = {
  sm: "text-xs px-1.5 py-0.5 gap-0.5",
  md: "text-sm px-2 py-1 gap-1",
  lg: "text-base px-3 py-1.5 gap-1.5",
};

export function TierBadge({ tier, size = "md" }: TierBadgeProps) {
  const label = TIER_LABELS[tier];
  const emoji = TIER_EMOJIS[tier];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium",
        getTierColor(tier),
        getTierBgColor(tier),
        getTierBorderColor(tier),
        sizeClasses[size]
      )}
    >
      <span>{emoji}</span>
      <span>{label}</span>
    </span>
  );
}
