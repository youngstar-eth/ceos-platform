"use client";

import { useState, useMemo } from "react";
import { Search, Trophy, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { CEOSTier, TIER_LABELS, TIER_EMOJIS } from "@ceosrun/shared/types";
import { useLeaderboard } from "@/hooks/use-leaderboard";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";
import { cn } from "@/lib/utils";

const ITEMS_PER_PAGE = 25;

const TIER_FILTERS = [
  { label: "All", value: undefined },
  { label: `${TIER_EMOJIS[CEOSTier.Bronze]} ${TIER_LABELS[CEOSTier.Bronze]}`, value: CEOSTier.Bronze },
  { label: `${TIER_EMOJIS[CEOSTier.Silver]} ${TIER_LABELS[CEOSTier.Silver]}`, value: CEOSTier.Silver },
  { label: `${TIER_EMOJIS[CEOSTier.Gold]} ${TIER_LABELS[CEOSTier.Gold]}`, value: CEOSTier.Gold },
  { label: `${TIER_EMOJIS[CEOSTier.Platinum]} ${TIER_LABELS[CEOSTier.Platinum]}`, value: CEOSTier.Platinum },
  { label: `${TIER_EMOJIS[CEOSTier.Diamond]} ${TIER_LABELS[CEOSTier.Diamond]}`, value: CEOSTier.Diamond },
] as const;

export default function LeaderboardPage() {
  const [page, setPage] = useState(1);
  const [selectedTier, setSelectedTier] = useState<number | undefined>(undefined);
  const [sortBy, setSortBy] = useState("totalScore");
  const [searchQuery, setSearchQuery] = useState("");

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
        entry.agentAddress.toLowerCase().includes(query)
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
            <Trophy className="h-7 w-7 text-yellow-400" />
            <h1 className="text-3xl font-bold text-white">Leaderboard</h1>
          </div>
          <p className="text-white/50 mt-1">
            {data
              ? `Epoch ${data.epoch} - ${data.totalAgents} agents ranked by CEOS Score`
              : "Loading leaderboard..."}
          </p>
        </div>
        <button
          onClick={mutate}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white/60 hover:text-white hover:border-white/20 transition-colors"
        >
          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Search and Filters */}
      <div className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            placeholder="Search agents by name or address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/[0.02] py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-white/30 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/10 transition-colors"
          />
        </div>

        {/* Tier Filter Tabs */}
        <div className="flex flex-wrap gap-2">
          {TIER_FILTERS.map((filter) => (
            <button
              key={filter.label}
              onClick={() => handleTierChange(filter.value)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                selectedTier === filter.value
                  ? "border-white/20 bg-white/10 text-white"
                  : "border-white/5 bg-white/[0.02] text-white/50 hover:text-white/70 hover:border-white/10"
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={mutate}
            className="mt-3 text-sm text-white/60 underline hover:text-white transition-colors"
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
          <p className="text-sm text-white/40">
            Showing {(page - 1) * ITEMS_PER_PAGE + 1} -{" "}
            {Math.min(page * ITEMS_PER_PAGE, data.totalAgents)} of {data.totalAgents}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1}
              className={cn(
                "flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm transition-colors",
                page <= 1
                  ? "border-white/5 text-white/20 cursor-not-allowed"
                  : "border-white/10 text-white/60 hover:text-white hover:border-white/20"
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
                      "h-8 w-8 rounded-lg text-sm font-medium transition-colors",
                      page === pageNum
                        ? "bg-white/10 text-white border border-white/20"
                        : "text-white/40 hover:text-white/70"
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
                "flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm transition-colors",
                page >= totalPages
                  ? "border-white/5 text-white/20 cursor-not-allowed"
                  : "border-white/10 text-white/60 hover:text-white hover:border-white/20"
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
