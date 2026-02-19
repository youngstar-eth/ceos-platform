'use client';

import { Star, Clock, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatUsdcPrice, formatCompactNumber, cn } from '@/lib/utils';
import type { ServiceOffering, ServiceCategory } from '@/hooks/use-services';

// ── Category Color Map (shared across marketplace components) ────────────

export const CATEGORY_STYLES: Record<
  ServiceCategory,
  { bg: string; text: string; label: string }
> = {
  content: {
    bg: 'bg-cp-cyan/20',
    text: 'text-cp-cyan',
    label: 'Content',
  },
  analysis: {
    bg: 'bg-cp-acid/20',
    text: 'text-cp-acid',
    label: 'Analysis',
  },
  trading: {
    bg: 'bg-cp-pink/20',
    text: 'text-cp-pink',
    label: 'Trading',
  },
  engagement: {
    bg: 'bg-violet-500/20',
    text: 'text-violet-400',
    label: 'Engagement',
  },
  networking: {
    bg: 'bg-amber-500/20',
    text: 'text-amber-400',
    label: 'Networking',
  },
};

interface ServiceCardProps {
  offering: ServiceOffering;
  onHire: (offering: ServiceOffering) => void;
}

export function ServiceCard({ offering, onHire }: ServiceCardProps) {
  const categoryStyle = CATEGORY_STYLES[offering.category] ?? CATEGORY_STYLES.content;
  const rating = offering.avgRating ?? 0;
  const ratingDisplay = rating > 0 ? rating.toFixed(1) : '—';

  return (
    <div className="group relative cp-glass cp-hud-corners rounded-lg border border-cp-cyan/10 hover:border-cp-cyan/30 transition-all duration-300 overflow-hidden">
      {/* Hover glow effect */}
      <div className="absolute inset-0 bg-gradient-to-b from-cp-cyan/0 via-cp-cyan/0 to-cp-cyan/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      <div className="relative z-10 p-5 flex flex-col h-full">
        {/* Top row: Category badge + Price */}
        <div className="flex items-center justify-between mb-3">
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] font-orbitron uppercase tracking-widest border-0',
              categoryStyle.bg,
              categoryStyle.text,
            )}
          >
            {categoryStyle.label}
          </Badge>
          <span className="text-cp-acid font-orbitron font-bold text-sm tracking-wide">
            {formatUsdcPrice(offering.priceUsdc)}
          </span>
        </div>

        {/* Service name */}
        <h3 className="font-orbitron text-white text-sm font-bold leading-tight mb-1.5 group-hover:text-cp-cyan transition-colors">
          {offering.name}
        </h3>

        {/* Pricing model badge */}
        <span className="text-[10px] font-share-tech text-white/40 uppercase tracking-wider mb-3">
          {offering.pricingModel.replace('_', ' ')}
        </span>

        {/* Provider bar */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-full bg-cp-cyan/20 border border-cp-cyan/30 flex items-center justify-center">
            <span className="text-[10px] font-bold text-cp-cyan">
              {offering.sellerAgent.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="text-xs font-share-tech text-white/60 truncate">
            @{offering.sellerAgent.name}
          </span>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-3 text-xs text-white/50 mb-4 mt-auto">
          {/* Rating */}
          <div className="flex items-center gap-1">
            <Star
              className={cn(
                'h-3 w-3',
                rating > 0 ? 'text-amber-400 fill-amber-400' : 'text-white/30',
              )}
            />
            <span className="font-share-tech">{ratingDisplay}</span>
          </div>

          {/* Completed jobs */}
          <div className="flex items-center gap-1">
            <Zap className="h-3 w-3 text-cp-acid/70" />
            <span className="font-share-tech">
              {formatCompactNumber(offering.completedJobs)} jobs
            </span>
          </div>

          {/* Latency */}
          {offering.avgLatencyMs && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-cp-pink/70" />
              <span className="font-share-tech">
                {offering.avgLatencyMs < 1000
                  ? `${offering.avgLatencyMs}ms`
                  : `${(offering.avgLatencyMs / 1000).toFixed(1)}s`}
              </span>
            </div>
          )}
        </div>

        {/* Hire button */}
        <Button
          onClick={() => onHire(offering)}
          className="w-full bg-cp-cyan/10 text-cp-cyan border border-cp-cyan/30 hover:bg-cp-cyan hover:text-cp-void font-orbitron text-xs uppercase tracking-widest transition-all duration-300 shadow-[0_0_10px_rgba(0,240,255,0.05)] hover:shadow-[0_0_20px_rgba(0,240,255,0.3)]"
          variant="outline"
          size="sm"
        >
          Hire Agent
        </Button>
      </div>
    </div>
  );
}
