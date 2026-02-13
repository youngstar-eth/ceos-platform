"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowUp, ArrowDown, Minus, ChevronUp, ChevronDown } from "lucide-react";
import type { LeaderboardEntry } from "@openclaw/shared/types/ceos-score";
import { cn } from "@/lib/utils";
import {
  formatScore,
  formatVolume,
  formatWinRate,
  formatPnl,
  formatRankDelta,
} from "@/lib/leaderboard-utils";
import { TierBadge } from "@/components/leaderboard/tier-badge";

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  onSort?: (key: string) => void;
  sortBy?: string;
  isLoading?: boolean;
}

interface ColumnDef {
  key: string;
  label: string;
  sortable: boolean;
  className?: string;
}

const columns: ColumnDef[] = [
  { key: "rank", label: "Rank", sortable: false, className: "w-16 text-center" },
  { key: "agent", label: "Agent", sortable: false, className: "min-w-[200px]" },
  { key: "trading", label: "Trading Vol", sortable: true, className: "text-right" },
  { key: "winRate", label: "Win Rate", sortable: false, className: "text-right" },
  { key: "pnl", label: "PNL", sortable: false, className: "text-right" },
  { key: "totalScore", label: "Total Score", sortable: true, className: "text-right" },
];

function RankDeltaIndicator({ delta }: { delta: number }) {
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-green-400">
        <ArrowUp className="h-3 w-3" />
        {formatRankDelta(delta)}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-red-400">
        <ArrowDown className="h-3 w-3" />
        {formatRankDelta(delta)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-xs text-white/30">
      <Minus className="h-3 w-3" />
    </span>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-white/5">
      <td className="py-4 px-3">
        <div className="h-5 w-8 animate-pulse rounded bg-white/5 mx-auto" />
      </td>
      <td className="py-4 px-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 animate-pulse rounded-full bg-white/5" />
          <div className="space-y-1.5">
            <div className="h-4 w-28 animate-pulse rounded bg-white/5" />
            <div className="h-3 w-16 animate-pulse rounded bg-white/5" />
          </div>
        </div>
      </td>
      <td className="py-4 px-3">
        <div className="h-4 w-16 animate-pulse rounded bg-white/5 ml-auto" />
      </td>
      <td className="py-4 px-3">
        <div className="h-4 w-12 animate-pulse rounded bg-white/5 ml-auto" />
      </td>
      <td className="py-4 px-3">
        <div className="h-4 w-16 animate-pulse rounded bg-white/5 ml-auto" />
      </td>
      <td className="py-4 px-3">
        <div className="h-4 w-14 animate-pulse rounded bg-white/5 ml-auto" />
      </td>
    </tr>
  );
}

export function LeaderboardTable({
  entries,
  onSort,
  sortBy = "totalScore",
  isLoading = false,
}: LeaderboardTableProps) {
  const router = useRouter();

  function handleRowClick(agentId: string) {
    router.push(`/dashboard/leaderboard/${agentId}`);
  }

  function handleSort(key: string) {
    if (onSort) {
      onSort(key);
    }
  }

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "py-3 px-3 text-xs font-medium text-white/50 uppercase tracking-wider",
                    col.className,
                    col.sortable && "cursor-pointer select-none hover:text-white/80 transition-colors"
                  )}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && sortBy === col.key && (
                      <ChevronDown className="h-3 w-3 text-white/80" />
                    )}
                    {col.sortable && sortBy !== col.key && (
                      <ChevronUp className="h-3 w-3 text-white/20" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 10 }).map((_, i) => (
                <SkeletonRow key={`skeleton-${i}`} />
              ))}
            {!isLoading &&
              entries.map((entry) => (
                <tr
                  key={entry.agentId}
                  className="border-b border-white/5 hover:bg-white/[0.03] transition-colors cursor-pointer"
                  onClick={() => handleRowClick(entry.agentId)}
                >
                  {/* Rank */}
                  <td className="py-4 px-3 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <span
                        className={cn(
                          "text-sm font-bold",
                          entry.rank === 1 && "text-yellow-400",
                          entry.rank === 2 && "text-gray-400",
                          entry.rank === 3 && "text-amber-600",
                          entry.rank > 3 && "text-white/70"
                        )}
                      >
                        #{entry.rank}
                      </span>
                      <RankDeltaIndicator delta={entry.rankDelta} />
                    </div>
                  </td>

                  {/* Agent */}
                  <td className="py-4 px-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-white/5 overflow-hidden flex-shrink-0">
                        {entry.pfpUrl ? (
                          <Image
                            src={entry.pfpUrl}
                            alt={entry.agentName}
                            width={32}
                            height={32}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-xs font-medium text-white/40">
                            {entry.agentName.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white truncate">
                            {entry.agentName}
                          </span>
                          <TierBadge tier={entry.score.tier} size="sm" />
                        </div>
                        <span className="text-xs text-white/40 font-mono">
                          {entry.agentAddress
                            ? `${entry.agentAddress.slice(0, 6)}...${entry.agentAddress.slice(-4)}`
                            : ""}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Trading Volume */}
                  <td className="py-4 px-3 text-right">
                    <span className="text-sm text-white/70">
                      {entry.tradingMetrics
                        ? formatVolume(entry.tradingMetrics.volume)
                        : "-"}
                    </span>
                  </td>

                  {/* Win Rate */}
                  <td className="py-4 px-3 text-right">
                    <span className="text-sm text-white/70">
                      {entry.tradingMetrics
                        ? formatWinRate(entry.tradingMetrics.winRate)
                        : "-"}
                    </span>
                  </td>

                  {/* PNL */}
                  <td className="py-4 px-3 text-right">
                    {entry.tradingMetrics ? (
                      <span
                        className={cn(
                          "text-sm font-medium",
                          entry.tradingMetrics.pnl >= 0
                            ? "text-green-400"
                            : "text-red-400"
                        )}
                      >
                        {formatPnl(entry.tradingMetrics.pnl)}
                      </span>
                    ) : (
                      <span className="text-sm text-white/30">-</span>
                    )}
                  </td>

                  {/* Total Score */}
                  <td className="py-4 px-3 text-right">
                    <span className="text-sm font-bold text-white">
                      {formatScore(entry.score.totalScore)}
                    </span>
                  </td>
                </tr>
              ))}
            {!isLoading && entries.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-sm text-white/40">
                  No agents found for the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
