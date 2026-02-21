'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Target,
  MessageSquare,
  TrendingUp,
  CheckCheck,
  AlertTriangle,
  Loader2,
  Filter,
  Zap,
} from 'lucide-react';
import { useAccount } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMyAgents } from '@/hooks/use-agent';
import {
  useHuntLeads,
  type SocialHuntLead,
  type SocialHuntStatus,
} from '@/hooks/use-hunt-leads';
import { cn } from '@/lib/utils';
import {
  useExecuteOnBase,
  type ExecuteStatus,
} from '@/hooks/use-agent-contracts';
import { parseUnits } from 'viem';

// ── Constants ────────────────────────────────────────────────────────────

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
const DEMO_WALLET = '0xDE00000000000000000000000000000000000001';
const ITEMS_PER_PAGE = 20;

// Status config: monochrome only — white/black/gray
const STATUS_CONFIG: Record<
  SocialHuntStatus,
  { label: string; classes: string; dot: string }
> = {
  IDENTIFIED: {
    label: 'IDENTIFIED',
    classes: 'border-white/20 text-white/60 bg-white/5',
    dot: 'bg-white/40',
  },
  QUALIFIED: {
    label: 'QUALIFIED',
    classes: 'border-white/40 text-white bg-white/10',
    dot: 'bg-white',
  },
  REPLIED: {
    label: 'REPLIED',
    classes: 'border-white/30 text-white/80 bg-white/[0.08]',
    dot: 'bg-white/80',
  },
  CONVERTED: {
    label: 'CONVERTED',
    classes: 'border-white text-white bg-white/15',
    dot: 'bg-white',
  },
  SKIPPED: {
    label: 'SKIPPED',
    classes: 'border-white/10 text-white/30 bg-transparent',
    dot: 'bg-white/20',
  },
  COOLDOWN: {
    label: 'COOLDOWN',
    classes: 'border-white/15 text-white/40 bg-white/[0.03]',
    dot: 'bg-white/30',
  },
  FAILED: {
    label: 'FAILED',
    classes: 'border-white/20 text-white/40 bg-black',
    dot: 'bg-white/20',
  },
};

const ALL_STATUSES: SocialHuntStatus[] = [
  'IDENTIFIED',
  'QUALIFIED',
  'REPLIED',
  'CONVERTED',
  'SKIPPED',
  'COOLDOWN',
  'FAILED',
];

// ── Sub-components ───────────────────────────────────────────────────────

function TerminalHeader({ total, avgScore, repliedCount, convertedCount }: {
  total: number;
  avgScore: number;
  repliedCount: number;
  convertedCount: number;
}) {
  return (
    <div className="space-y-4">
      {/* Page title */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Target className="h-6 w-6 text-white/70" />
            <h1 className="font-mono text-2xl font-bold text-white tracking-[0.15em] uppercase">
              Hunt Leads
            </h1>
            <span className="font-mono text-xs text-white/30 border border-white/10 px-2 py-0.5 rounded-sm">
              SOCIAL HUNTER
            </span>
          </div>
          <p className="font-mono text-xs text-white/30 mt-1 tracking-wider">
            AUTONOMOUS FARCASTER LEAD GENERATION &mdash; EAR / BRAIN / MOUTH
          </p>
        </div>
      </div>

      {/* Stats summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatPill
          icon={<Filter className="h-3.5 w-3.5" />}
          label="TOTAL LEADS"
          value={String(total)}
        />
        <StatPill
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="AVG SCORE"
          value={avgScore > 0 ? avgScore.toFixed(1) : '—'}
        />
        <StatPill
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          label="REPLIED"
          value={String(repliedCount)}
        />
        <StatPill
          icon={<CheckCheck className="h-3.5 w-3.5" />}
          label="CONVERTED"
          value={String(convertedCount)}
        />
      </div>
    </div>
  );
}

function StatPill({ icon, label, value }: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="border border-white/10 bg-white/[0.02] rounded-sm px-4 py-3 font-mono">
      <div className="flex items-center gap-1.5 text-white/30 mb-1">
        {icon}
        <span className="text-[10px] tracking-widest">{label}</span>
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
    </div>
  );
}

function ScoreBar({ score }: { score: number | null }) {
  if (score === null) {
    return <span className="font-mono text-white/20 text-xs">N/A</span>;
  }

  const pct = (score / 10) * 100;
  // Higher scores get brighter white
  const brightness = score >= 8 ? 'bg-white' : score >= 5 ? 'bg-white/60' : 'bg-white/25';

  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', brightness)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={cn(
          'font-mono text-sm font-bold tabular-nums',
          score >= 8 ? 'text-white' : score >= 5 ? 'text-white/60' : 'text-white/30',
        )}
      >
        {score}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: SocialHuntStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[10px] tracking-widest',
        cfg.classes,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  );
}

function LeadCard({
  lead,
  onExecute,
  isExecuting,
  executeStatus,
}: {
  lead: SocialHuntLead;
  onExecute: (lead: SocialHuntLead) => void;
  isExecuting: boolean;
  executeStatus: ExecuteStatus;
}) {
  const isHighScore = (lead.triageScore ?? 0) >= 8;
  const farcasterUrl = `https://warpcast.com/${lead.targetUsername}`;
  const castUrl = `https://warpcast.com/${lead.targetUsername}/${lead.targetCastHash.slice(0, 10)}`;

  return (
    <div
      className={cn(
        'relative border bg-black rounded-sm p-4 space-y-3 transition-all group',
        isHighScore
          ? 'border-white/30 hover:border-white/50'
          : 'border-white/10 hover:border-white/20',
      )}
    >
      {/* Top row: author + status + score */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {/* FID avatar placeholder */}
          <div className="h-8 w-8 rounded-sm bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
            <span className="font-mono text-[10px] text-white/40">
              {lead.targetFid.toString().slice(-2)}
            </span>
          </div>
          <div className="min-w-0">
            <a
              href={farcasterUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm font-bold text-white hover:underline flex items-center gap-1 truncate"
            >
              @{lead.targetUsername}
              <ExternalLink className="h-3 w-3 text-white/30 flex-shrink-0" />
            </a>
            <span className="font-mono text-[10px] text-white/30">FID #{lead.targetFid}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={lead.status} />
        </div>
      </div>

      {/* Cast text */}
      <div className="border-l-2 border-white/10 pl-3">
        <a
          href={castUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs text-white/60 leading-relaxed line-clamp-3 hover:text-white/80 transition-colors"
        >
          {lead.targetText}
        </a>
      </div>

      {/* Score + reasoning */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-white/30 tracking-widest w-16">SCORE</span>
          <ScoreBar score={lead.triageScore} />
        </div>

        {lead.triageReason && (
          <div className="flex items-start gap-3">
            <span className="font-mono text-[10px] text-white/30 tracking-widest w-16 pt-0.5">REASON</span>
            <p className="font-mono text-[11px] text-white/50 leading-relaxed line-clamp-2">
              {lead.triageReason}
            </p>
          </div>
        )}

        {lead.channel && (
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] text-white/30 tracking-widest w-16">CHANNEL</span>
            <span className="font-mono text-[11px] text-white/50">/{lead.channel}</span>
          </div>
        )}
      </div>

      {/* Reply info (if replied) */}
      {lead.replyCastHash && (
        <div className="border-t border-white/5 pt-2">
          <p className="font-mono text-[10px] text-white/30 tracking-widest mb-1">PITCH SENT</p>
          {lead.pitchText && (
            <p className="font-mono text-[11px] text-white/40 line-clamp-2 italic">
              &ldquo;{lead.pitchText}&rdquo;
            </p>
          )}
        </div>
      )}

      {/* Bottom row: timestamp + action */}
      <div className="flex items-center justify-between pt-1">
        <span className="font-mono text-[10px] text-white/20">
          {new Date(lead.createdAt).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>

        {isHighScore && lead.status !== 'CONVERTED' && (
          <Button
            size="sm"
            onClick={() => onExecute(lead)}
            disabled={isExecuting}
            className={cn(
              'font-mono text-[10px] tracking-widest border-0 h-7 px-3 rounded-sm uppercase font-bold',
              isExecuting && executeStatus === 'confirmed'
                ? 'bg-green-500 text-white hover:bg-green-500'
                : 'bg-white text-black hover:bg-white/90',
            )}
          >
            {isExecuting ? (
              <>
                {executeStatus === 'checking-allowance' && (
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Checking...</>
                )}
                {(executeStatus === 'awaiting-approve-signature' || executeStatus === 'confirming-approve') && (
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Approving USDC...</>
                )}
                {(executeStatus === 'awaiting-deposit-signature' || executeStatus === 'confirming-deposit') && (
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Depositing...</>
                )}
                {executeStatus === 'confirmed' && (
                  <><CheckCheck className="h-3 w-3 mr-1" />Confirmed</>
                )}
                {executeStatus === 'failed' && (
                  <><AlertTriangle className="h-3 w-3 mr-1" />Failed</>
                )}
              </>
            ) : (
              <>
                <Zap className="h-3 w-3 mr-1" />
                Execute on Base
              </>
            )}
          </Button>
        )}
      </div>

      {/* High-score indicator line */}
      {isHighScore && (
        <div className="absolute top-0 left-0 right-0 h-px bg-white/30" />
      )}
    </div>
  );
}

function LeadCardSkeleton() {
  return (
    <div className="border border-white/10 bg-black rounded-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-sm bg-white/5" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-28 bg-white/5" />
            <Skeleton className="h-3 w-16 bg-white/5" />
          </div>
        </div>
        <Skeleton className="h-5 w-20 bg-white/5" />
      </div>
      <Skeleton className="h-12 w-full bg-white/5" />
      <div className="space-y-2">
        <Skeleton className="h-3 w-full bg-white/5" />
        <Skeleton className="h-3 w-3/4 bg-white/5" />
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function HuntLeadsPage() {
  const { address: connectedAddress } = useAccount();
  const walletAddress = DEMO_MODE ? DEMO_WALLET : connectedAddress;

  // On-chain execute hook (approve → deposit two-step flow)
  const {
    execute: executeOnBase,
    status: executeStatus,
    error: executeError,
    reset: resetExecute,
  } = useExecuteOnBase();
  const [executingLeadId, setExecutingLeadId] = useState<string | null>(null);

  // Agent selection state
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');

  // Filter state
  const [statusFilter, setStatusFilter] = useState<SocialHuntStatus | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [minScore, setMinScore] = useState<string>('');
  const [page, setPage] = useState(1);

  // Data fetching
  const {
    data: agentsResponse,
    isLoading: agentsLoading,
  } = useMyAgents(walletAddress, 1, 50);

  const agents = agentsResponse?.data ?? [];

  // Auto-select first agent when list loads
  const effectiveAgentId =
    selectedAgentId || (agents.length > 0 ? agents[0]!.id : '');

  const {
    data: leadsData,
    isLoading: leadsLoading,
    error: leadsError,
    refetch,
  } = useHuntLeads(
    effectiveAgentId || null,
    {
      status: statusFilter === 'ALL' ? undefined : statusFilter,
      page,
      limit: ITEMS_PER_PAGE,
    },
    walletAddress,
  );

  const allLeads = leadsData?.leads ?? [];
  const pagination = leadsData?.pagination;
  const totalPages = pagination
    ? Math.max(1, Math.ceil(pagination.total / ITEMS_PER_PAGE))
    : 1;

  // Client-side search filter (by username or cast text)
  const filteredLeads = useMemo(() => {
    if (!searchQuery.trim() && !minScore) return allLeads;

    const query = searchQuery.toLowerCase();
    const scoreThreshold = minScore ? Number(minScore) : 0;

    return allLeads.filter((lead) => {
      const matchesSearch =
        !query ||
        lead.targetUsername.toLowerCase().includes(query) ||
        lead.targetText.toLowerCase().includes(query) ||
        (lead.triageReason ?? '').toLowerCase().includes(query);
      const matchesScore =
        !scoreThreshold || (lead.triageScore ?? 0) >= scoreThreshold;
      return matchesSearch && matchesScore;
    });
  }, [allLeads, searchQuery, minScore]);

  // Compute stats from all leads (not filtered)
  const stats = useMemo(() => {
    const scoredLeads = allLeads.filter((l) => l.triageScore !== null);
    const avgScore =
      scoredLeads.length > 0
        ? scoredLeads.reduce((sum, l) => sum + (l.triageScore ?? 0), 0) /
          scoredLeads.length
        : 0;
    const repliedCount = allLeads.filter((l) => l.status === 'REPLIED' || l.status === 'CONVERTED').length;
    const convertedCount = allLeads.filter((l) => l.status === 'CONVERTED').length;

    return {
      total: pagination?.total ?? allLeads.length,
      avgScore,
      repliedCount,
      convertedCount,
    };
  }, [allLeads, pagination]);

  // Handle Execute on Base action
  // Resolves the selected agent's on-chain token ID, then calls the
  // two-step approve → depositForAgent flow via the Wagmi hook.
  const handleExecute = useCallback(
    (lead: SocialHuntLead) => {
      // Find the selected agent to get its on-chain identity token ID
      const agent = agents.find((a) => a.id === effectiveAgentId);
      if (!agent?.onChainId) {
        // eslint-disable-next-line no-console
        console.warn('Agent has no on-chain ID — cannot execute on Base');
        return;
      }

      // Reset any previous execution state before starting a new one
      resetExecute();
      setExecutingLeadId(lead.id);

      // 50 USDC deposit (6 decimals) — x402 fuel for agent treasury
      const amount = parseUnits('50', 6);

      void executeOnBase({
        agentId: BigInt(agent.onChainId),
        amount,
        onSuccess: (txHash) => {
          // eslint-disable-next-line no-console
          console.log(`[Hunt Leads] Execute on Base confirmed: ${txHash}`);
          // Clear executing state after a short delay so user sees "Confirmed ✓"
          setTimeout(() => {
            setExecutingLeadId(null);
            resetExecute();
          }, 3000);
        },
      });
    },
    [agents, effectiveAgentId, executeOnBase, resetExecute],
  );

  function handlePageChange(newPage: number) {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function handleStatusFilter(value: SocialHuntStatus | 'ALL') {
    setStatusFilter(value);
    setPage(1);
  }

  function handleAgentChange(agentId: string) {
    setSelectedAgentId(agentId);
    setPage(1);
  }

  const isLoading = agentsLoading || leadsLoading;

  // ── No agents state ───────────────────────────────────────────────────
  if (!agentsLoading && agents.length === 0) {
    return (
      <div className="space-y-6">
        <TerminalHeader {...stats} />
        <div className="border border-white/10 bg-black rounded-sm p-12 text-center">
          <Target className="h-10 w-10 text-white/20 mx-auto mb-4" />
          <p className="font-mono text-sm text-white/40 tracking-wider">
            NO AGENTS DEPLOYED
          </p>
          <p className="font-mono text-xs text-white/20 mt-2">
            Deploy an agent to begin autonomous lead generation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header + Stats ───────────────────────────────────── */}
      <TerminalHeader {...stats} />

      {/* ── Controls row ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Agent selector */}
        <Select
          value={effectiveAgentId}
          onValueChange={handleAgentChange}
          disabled={agentsLoading}
        >
          <SelectTrigger className="w-full sm:w-52 font-mono text-xs bg-black border-white/20 text-white/70 hover:border-white/40 focus:ring-white/20 rounded-sm h-9">
            <SelectValue placeholder="Select agent..." />
          </SelectTrigger>
          <SelectContent className="bg-black border-white/20 text-white font-mono text-xs">
            {agents.map((agent) => (
              <SelectItem
                key={agent.id}
                value={agent.id}
                className="font-mono text-xs focus:bg-white/10 focus:text-white"
              >
                {agent.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
          <Input
            placeholder="Search by username, cast text, reasoning..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 font-mono text-xs bg-black border-white/20 text-white placeholder:text-white/20 focus-visible:ring-white/20 rounded-sm h-9"
          />
        </div>

        {/* Min score filter */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="font-mono text-[10px] text-white/30 tracking-widest whitespace-nowrap">
            MIN SCORE
          </span>
          <Input
            type="number"
            min="1"
            max="10"
            placeholder="1-10"
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            className="w-16 font-mono text-xs bg-black border-white/20 text-white placeholder:text-white/20 focus-visible:ring-white/20 rounded-sm h-9 text-center"
          />
        </div>

        {/* Refresh */}
        <button
          onClick={() => void refetch()}
          disabled={isLoading}
          className="flex items-center gap-1.5 border border-white/10 bg-white/[0.02] px-3 h-9 text-white/40 hover:text-white hover:border-white/20 transition-colors rounded-sm font-mono text-xs tracking-wider flex-shrink-0"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          REFRESH
        </button>
      </div>

      {/* ── Status filter tabs ────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => handleStatusFilter('ALL')}
          className={cn(
            'font-mono text-[10px] tracking-widest border px-3 py-1.5 rounded-sm transition-colors',
            statusFilter === 'ALL'
              ? 'border-white/30 bg-white/10 text-white'
              : 'border-white/10 text-white/40 hover:text-white/60 hover:border-white/20',
          )}
        >
          ALL
        </button>
        {ALL_STATUSES.map((status) => (
          <button
            key={status}
            onClick={() => handleStatusFilter(status)}
            className={cn(
              'font-mono text-[10px] tracking-widest border px-3 py-1.5 rounded-sm transition-colors',
              statusFilter === status
                ? 'border-white/30 bg-white/10 text-white'
                : 'border-white/10 text-white/40 hover:text-white/60 hover:border-white/20',
            )}
          >
            {status}
          </button>
        ))}
      </div>

      {/* ── High-score notice ─────────────────────────────────── */}
      {!isLoading && filteredLeads.some((l) => (l.triageScore ?? 0) >= 8) && (
        <div className="flex items-center gap-2 border border-white/20 bg-white/5 rounded-sm px-4 py-2.5">
          <AlertTriangle className="h-4 w-4 text-white/60 flex-shrink-0" />
          <p className="font-mono text-xs text-white/50">
            Leads scored <span className="text-white font-bold">8+</span> are
            flagged for Base execution. Use &ldquo;Execute on Base&rdquo; to initiate an
            autonomous service job via x402.
          </p>
        </div>
      )}

      {/* ── Execute error banner ──────────────────────────────── */}
      {executeError && executeStatus === 'failed' && (
        <div className="flex items-center gap-2 border border-white/20 bg-red-500/5 rounded-sm px-4 py-2.5">
          <AlertTriangle className="h-4 w-4 text-red-400/60 flex-shrink-0" />
          <p className="font-mono text-xs text-white/50 flex-1">
            <span className="text-red-400 font-bold">EXECUTE FAILED:</span>{' '}
            {executeError.length > 120 ? executeError.slice(0, 120) + '...' : executeError}
          </p>
          <button
            onClick={() => {
              resetExecute();
              setExecutingLeadId(null);
            }}
            className="font-mono text-[10px] text-white/40 underline hover:text-white tracking-wider flex-shrink-0"
          >
            DISMISS
          </button>
        </div>
      )}

      {/* ── Error state ───────────────────────────────────────── */}
      {leadsError && !leadsLoading && (
        <div className="border border-white/20 bg-white/[0.02] rounded-sm p-8 text-center">
          <AlertTriangle className="h-8 w-8 text-white/30 mx-auto mb-3" />
          <p className="font-mono text-sm text-white/40 tracking-wider">CONNECTION ERROR</p>
          <p className="font-mono text-xs text-white/25 mt-1">
            {leadsError.message}
          </p>
          <button
            onClick={() => void refetch()}
            className="mt-4 font-mono text-xs text-white/40 underline hover:text-white transition-colors tracking-wider"
          >
            RETRY
          </button>
        </div>
      )}

      {/* ── Loading skeletons ─────────────────────────────────── */}
      {isLoading && !leadsError && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <LeadCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────── */}
      {!isLoading && !leadsError && filteredLeads.length === 0 && (
        <div className="border border-white/10 bg-black rounded-sm p-12 text-center">
          <Target className="h-10 w-10 text-white/10 mx-auto mb-4" />
          <p className="font-mono text-sm text-white/30 tracking-wider">
            NO LEADS FOUND
          </p>
          <p className="font-mono text-xs text-white/20 mt-2">
            {searchQuery || statusFilter !== 'ALL' || minScore
              ? 'No leads match your current filters. Try adjusting the search or status.'
              : 'The Social Hunter has not identified any leads yet.'}
          </p>
        </div>
      )}

      {/* ── Lead grid ─────────────────────────────────────────── */}
      {!isLoading && !leadsError && filteredLeads.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filteredLeads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onExecute={handleExecute}
              isExecuting={executingLeadId === lead.id}
              executeStatus={executingLeadId === lead.id ? executeStatus : 'idle'}
            />
          ))}
        </div>
      )}

      {/* ── Pagination ────────────────────────────────────────── */}
      {!isLoading && !leadsError && pagination && pagination.total > ITEMS_PER_PAGE && (
        <div className="flex items-center justify-between border-t border-white/10 pt-4">
          <p className="font-mono text-xs text-white/30">
            {(page - 1) * ITEMS_PER_PAGE + 1}–
            {Math.min(page * ITEMS_PER_PAGE, pagination.total)} of{' '}
            {pagination.total} leads
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1}
              className={cn(
                'flex items-center gap-1 font-mono text-xs border px-3 py-1.5 rounded-sm transition-colors',
                page <= 1
                  ? 'border-white/5 text-white/15 cursor-not-allowed'
                  : 'border-white/20 text-white/50 hover:text-white hover:border-white/30',
              )}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              PREV
            </button>

            {/* Page number buttons */}
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
                      'h-7 w-7 font-mono text-xs rounded-sm transition-colors',
                      page === pageNum
                        ? 'bg-white text-black font-bold'
                        : 'text-white/30 hover:text-white/60',
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
                'flex items-center gap-1 font-mono text-xs border px-3 py-1.5 rounded-sm transition-colors',
                page >= totalPages
                  ? 'border-white/5 text-white/15 cursor-not-allowed'
                  : 'border-white/20 text-white/50 hover:text-white hover:border-white/30',
              )}
            >
              NEXT
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Loading indicator overlay for pagination changes */}
      {leadsLoading && !agentsLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-white/30" />
          <span className="font-mono text-xs text-white/30 ml-2 tracking-wider">
            LOADING...
          </span>
        </div>
      )}
    </div>
  );
}
