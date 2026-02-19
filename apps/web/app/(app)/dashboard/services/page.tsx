'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Zap, CheckCircle, DollarSign } from 'lucide-react';
import { ServiceCard } from '@/components/services/service-card';
import { ServiceFilterBar } from '@/components/services/service-filter-bar';
import { HireAgentSheet } from '@/components/services/hire-agent-sheet';
import { ServiceEmptyState } from '@/components/services/service-empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useServiceDiscovery,
  type ServiceOffering,
  type ServiceCategory,
  type SortOption,
} from '@/hooks/use-services';
import { formatCompactNumber } from '@/lib/utils';

/**
 * /dashboard/services — Agent Service Marketplace
 *
 * Discover services, compare agents, and initiate purchases.
 * The visual proof that the AgentFi economy is real.
 */
export default function ServicesPage() {
  // ── Filter State ─────────────────────────────────────────────────────

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedCapability, setDebouncedCapability] = useState('');
  const [activeCategory, setActiveCategory] = useState<ServiceCategory | undefined>();
  const [sortBy, setSortBy] = useState<SortOption>('rating');
  const [page] = useState(1);

  // ── Sheet State ──────────────────────────────────────────────────────

  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedOffering, setSelectedOffering] = useState<ServiceOffering | null>(null);

  // TODO: Replace with actual wallet hook (wagmi useAccount)
  const walletAddress: string | undefined = undefined;

  // ── Debounced Search ─────────────────────────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCapability(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ── Data Fetching ────────────────────────────────────────────────────

  const { data, isLoading, error } = useServiceDiscovery({
    category: activeCategory,
    capability: debouncedCapability || undefined,
    sort: sortBy,
    page,
    limit: 30,
  });

  const offerings = data?.offerings ?? [];
  const total = data?.total ?? 0;

  // ── Handlers ─────────────────────────────────────────────────────────

  const handleHire = useCallback((offering: ServiceOffering) => {
    setSelectedOffering(offering);
    setSheetOpen(true);
  }, []);

  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    setDebouncedCapability('');
    setActiveCategory(undefined);
    setSortBy('rating');
  }, []);

  const hasFilters = !!searchQuery || !!activeCategory || sortBy !== 'rating';

  // ── Economy Stats (computed from current page data) ──────────────────

  const totalCompletedJobs = offerings.reduce(
    (sum, o) => sum + o.completedJobs,
    0,
  );

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────── */}
      <div>
        <h1 className="font-orbitron text-2xl font-bold text-white tracking-wide">
          Agent Service Marketplace
        </h1>
        <p className="font-share-tech text-white/40 text-sm mt-1">
          Discover autonomous agents. Commission intelligence. Fuel the economy.
        </p>
      </div>

      {/* ── Economy Stats Banner ────────────────────────────── */}
      <div className="flex items-center gap-6 text-xs font-share-tech text-white/50 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-cp-acid/70" />
          <span>
            <span className="text-white/70 font-bold">{total}</span> services
            active
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <CheckCircle className="h-3.5 w-3.5 text-cp-cyan/70" />
          <span>
            <span className="text-white/70 font-bold">
              {formatCompactNumber(totalCompletedJobs)}
            </span>{' '}
            jobs completed
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <DollarSign className="h-3.5 w-3.5 text-cp-pink/70" />
          <span>x402 settlement · USDC on Base</span>
        </div>
      </div>

      {/* ── Filter Bar ──────────────────────────────────────── */}
      <ServiceFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        sortBy={sortBy}
        onSortChange={setSortBy}
      />

      {/* ── Loading State ───────────────────────────────────── */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-white/5 p-5 space-y-3"
            >
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-20 rounded-full bg-white/5" />
                <Skeleton className="h-5 w-14 bg-white/5" />
              </div>
              <Skeleton className="h-5 w-40 bg-white/5" />
              <Skeleton className="h-3 w-24 bg-white/5" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-6 w-6 rounded-full bg-white/5" />
                <Skeleton className="h-3 w-28 bg-white/5" />
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="h-3 w-12 bg-white/5" />
                <Skeleton className="h-3 w-16 bg-white/5" />
              </div>
              <Skeleton className="h-8 w-full bg-white/5" />
            </div>
          ))}
        </div>
      )}

      {/* ── Error State ─────────────────────────────────────── */}
      {error && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Loader2 className="h-8 w-8 text-red-400/60 mb-4" />
          <h3 className="font-orbitron text-white text-lg font-bold mb-2">
            Connection Error
          </h3>
          <p className="font-share-tech text-white/40 text-sm max-w-md">
            {error.message}. Ensure the backend is operational.
          </p>
        </div>
      )}

      {/* ── Service Grid ────────────────────────────────────── */}
      {!isLoading && !error && offerings.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {offerings.map((offering) => (
            <ServiceCard
              key={offering.id}
              offering={offering}
              onHire={handleHire}
            />
          ))}
        </div>
      )}

      {/* ── Empty State ─────────────────────────────────────── */}
      {!isLoading && !error && offerings.length === 0 && (
        <ServiceEmptyState
          hasFilters={hasFilters}
          onClearFilters={handleClearFilters}
        />
      )}

      {/* ── Hire Agent Sheet ────────────────────────────────── */}
      <HireAgentSheet
        offering={selectedOffering}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        walletAddress={walletAddress}
      />
    </div>
  );
}
