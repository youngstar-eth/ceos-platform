'use client';

import { useState, useMemo } from 'react';
import { Search, Trophy, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { CEOSTier, TIER_LABELS, TIER_EMOJIS } from '@openclaw/shared/types/ceos-score';
import { useLeaderboard } from '@/hooks/use-leaderboard';
import { LeaderboardTable } from '@/components/leaderboard/leaderboard-table';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ITEMS_PER_PAGE = 25;

const TIER_FILTERS = [
  { label: 'All', value: undefined },
  { label: `${TIER_EMOJIS[CEOSTier.Diamond]} ${TIER_LABELS[CEOSTier.Diamond]}`, value: CEOSTier.Diamond },
  { label: `${TIER_EMOJIS[CEOSTier.Platinum]} ${TIER_LABELS[CEOSTier.Platinum]}`, value: CEOSTier.Platinum },
  { label: `${TIER_EMOJIS[CEOSTier.Gold]} ${TIER_LABELS[CEOSTier.Gold]}`, value: CEOSTier.Gold },
  { label: `${TIER_EMOJIS[CEOSTier.Silver]} ${TIER_LABELS[CEOSTier.Silver]}`, value: CEOSTier.Silver },
  { label: `${TIER_EMOJIS[CEOSTier.Bronze]} ${TIER_LABELS[CEOSTier.Bronze]}`, value: CEOSTier.Bronze },
] as const;

export default function LeaderboardPage() {
  const [page, setPage] = useState(1);
  const [selectedTier, setSelectedTier] = useState<number | undefined>(undefined);
  const [sortBy, setSortBy] = useState('totalScore');
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading, error, mutate } = useLeaderboard({
    page,
    limit: ITEMS_PER_PAGE,
    tier: selectedTier,
    sortBy,
  });

  const filteredEntries = useMemo(() => {
    if (!data?.entries) return [];
    if (!searchQuery.trim()) return data.entries;

    const query = searchQuery.toLowerCase();
    return data.entries.filter(
      (entry) =>
        entry.agentName.toLowerCase().includes(query) ||
        entry.agentAddress.toLowerCase().includes(query),
    );
  }, [data?.entries, searchQuery]);

  const totalPages = data ? Math.max(1, Math.ceil(data.totalAgents / ITEMS_PER_PAGE)) : 1;

  function handleTierChange(tier: number | undefined) {
    setSelectedTier(tier);
    setPage(1);
  }

  function handleSort(key: string) {
    setSortBy(key);
    setPage(1);
  }

  function handlePageChange(newPage: number) {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-neon-yellow/10 border border-neon-yellow/20 flex items-center justify-center">
              <Trophy className="h-5 w-5 text-neon-yellow" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold font-orbitron vaporwave-gradient-text">
                  Leaderboard
                </h1>
                <span className="text-[8px] text-vapor-lavender/25 font-pixel mt-2">
                  リーダーボード
                </span>
              </div>
              <p className="text-muted-foreground text-sm mt-0.5">
                {data
                  ? `Epoch ${data.epoch} \u2014 ${data.totalAgents} agents ranked by CEOS Score`
                  : 'Loading leaderboard...'}
              </p>
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={mutate}
          className="gap-2"
        >
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neon-purple/40" />
          <input
            type="text"
            placeholder="Search agents by name or address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-border/60 bg-card/40 backdrop-blur-sm py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-neon-purple/40 focus:outline-none focus:ring-1 focus:ring-neon-purple/20 transition-all font-rajdhani"
          />
        </div>

        {/* Tier Filter Tabs */}
        <div className="flex flex-wrap gap-2">
          {TIER_FILTERS.map((filter) => (
            <button
              key={filter.label}
              onClick={() => handleTierChange(filter.value)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-sm font-rajdhani font-semibold transition-all',
                selectedTier === filter.value
                  ? 'border-neon-pink/30 bg-neon-pink/10 text-neon-pink neon-box-pink'
                  : 'border-border/40 bg-card/30 text-muted-foreground hover:text-neon-cyan hover:border-neon-cyan/20',
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="glass-card rounded-xl border border-neon-pink/20 p-6 text-center">
          <p className="text-sm text-neon-pink">{error}</p>
          <button
            onClick={mutate}
            className="mt-3 text-sm text-muted-foreground underline hover:text-neon-cyan transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {/* Table */}
      {!error && (
        <LeaderboardTable
          entries={filteredEntries}
          onSort={handleSort}
          sortBy={sortBy}
          isLoading={isLoading}
        />
      )}

      {/* Pagination */}
      {!error && !isLoading && data && data.totalAgents > ITEMS_PER_PAGE && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground font-rajdhani">
            Showing {(page - 1) * ITEMS_PER_PAGE + 1} -{' '}
            {Math.min(page * ITEMS_PER_PAGE, data.totalAgents)} of {data.totalAgents}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1}
              className={cn(
                'flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-rajdhani transition-all',
                page <= 1
                  ? 'border-border/20 text-muted-foreground/30 cursor-not-allowed'
                  : 'border-border/40 text-muted-foreground hover:text-neon-cyan hover:border-neon-cyan/30',
              )}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    className={cn(
                      'h-8 w-8 rounded-lg text-sm font-rajdhani font-semibold transition-all',
                      page === pageNum
                        ? 'bg-neon-purple/15 text-neon-pink border border-neon-purple/30 neon-box-purple'
                        : 'text-muted-foreground hover:text-neon-cyan',
                    )}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages}
              className={cn(
                'flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-rajdhani transition-all',
                page >= totalPages
                  ? 'border-border/20 text-muted-foreground/30 cursor-not-allowed'
                  : 'border-border/40 text-muted-foreground hover:text-neon-cyan hover:border-neon-cyan/30',
              )}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
