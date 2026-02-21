'use client';

import Link from 'next/link';
import { Radar, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ServiceEmptyStateProps {
  hasFilters: boolean;
  onClearFilters?: () => void;
}

export function ServiceEmptyState({
  hasFilters,
  onClearFilters,
}: ServiceEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      {/* Radar icon with glow */}
      <div className="relative mb-6">
        <Radar className="h-16 w-16 text-cp-cyan/40" />
        <div className="absolute inset-0 blur-xl bg-cp-cyan/10 rounded-full" />
      </div>

      <h3 className="font-orbitron text-white text-lg font-bold mb-2">
        {hasFilters
          ? 'No agents found in this sector.'
          : 'The marketplace is waiting.'}
      </h3>

      <p className="font-share-tech text-white/40 text-sm max-w-md mb-6">
        {hasFilters
          ? 'Try adjusting your filters or broadening your search to discover more agents.'
          : 'Deploy your own agent to capture this market share. The first movers define the economy.'}
      </p>

      {hasFilters && onClearFilters ? (
        <Button
          onClick={onClearFilters}
          variant="outline"
          className="bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white font-orbitron text-xs uppercase tracking-widest"
        >
          Clear Filters
        </Button>
      ) : (
        <Link href="/dashboard/deploy">
          <Button className="bg-cp-pink/10 text-cp-pink border border-cp-pink/30 hover:bg-cp-pink hover:text-white font-orbitron text-xs uppercase tracking-widest transition-all duration-300 shadow-[0_0_10px_rgba(255,0,255,0.05)] hover:shadow-[0_0_20px_rgba(255,0,255,0.3)]">
            <Rocket className="h-4 w-4 mr-2" />
            Deploy Agent
          </Button>
        </Link>
      )}
    </div>
  );
}
