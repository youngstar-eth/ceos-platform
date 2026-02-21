'use client';

import { use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Bot,
  Clock,
  DollarSign,
  FileJson,
  Loader2,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, formatUsdcPrice } from '@/lib/utils';
import { useServiceJob } from '@/hooks/use-services';
import { useAccount } from 'wagmi';
import { GlassBoxViewer } from '@/components/services/glass-box-viewer';
import { VerifyOnChainLink } from '@/components/services/verify-on-chain-link';

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
const DEMO_WALLET = '0xDE00000000000000000000000000000000000001';

// ── Status Config ────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  CREATED:    { bg: 'bg-blue-500/10',   text: 'text-blue-400',   label: 'Created' },
  ACCEPTED:   { bg: 'bg-cyan-500/10',   text: 'text-cyan-400',   label: 'Accepted' },
  DELIVERING: { bg: 'bg-amber-500/10',  text: 'text-amber-400',  label: 'Delivering' },
  COMPLETED:  { bg: 'bg-cp-acid/10',    text: 'text-cp-acid',    label: 'Completed' },
  REJECTED:   { bg: 'bg-red-500/10',    text: 'text-red-400',    label: 'Rejected' },
  DISPUTED:   { bg: 'bg-orange-500/10', text: 'text-orange-400', label: 'Disputed' },
  EXPIRED:    { bg: 'bg-gray-500/10',   text: 'text-gray-400',   label: 'Expired' },
};

// ── Page Component ───────────────────────────────────────────────────────

/**
 * /dashboard/services/jobs/[jobId] — Service Job Detail
 *
 * Real-time view of a service job with:
 *   - Status timeline
 *   - Requirements / Deliverables JSON
 *   - Glass Box Decision Log (RLAIF telemetry)
 *   - On-chain verification link
 *
 * Polls every 5s while job is in-progress, stops at terminal states.
 */
export default function ServiceJobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = use(params);
  const { address: connectedAddress } = useAccount();
  const walletAddress = DEMO_MODE ? DEMO_WALLET : connectedAddress;

  const { data: job, isLoading, error } = useServiceJob(jobId, walletAddress);

  // ── Loading State ─────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 text-cp-cyan/60 animate-spin" />
      </div>
    );
  }

  // ── Error State ───────────────────────────────────────────────────────
  if (error || !job) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <h3 className="font-orbitron text-white text-lg font-bold mb-2">
          Job Not Found
        </h3>
        <p className="font-share-tech text-white/40 text-sm max-w-md mb-4">
          {error?.message ?? 'The service job could not be loaded.'}
        </p>
        <Link href="/dashboard/services">
          <Button
            variant="outline"
            className="font-orbitron text-xs text-cp-cyan border-cp-cyan/30 hover:bg-cp-cyan/10"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-2" />
            Back to Marketplace
          </Button>
        </Link>
      </div>
    );
  }

  const statusStyle = STATUS_STYLES[job.status] ?? { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Created' };
  const isTerminal = ['COMPLETED', 'REJECTED', 'DISPUTED', 'EXPIRED'].includes(job.status);
  const isInProgress = !isTerminal;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* ── Back Link + Title ─────────────────────────────────── */}
      <div>
        <Link
          href="/dashboard/services"
          className="inline-flex items-center gap-1.5 text-xs font-share-tech text-white/40 hover:text-cp-cyan transition-colors mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Marketplace
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-orbitron text-xl font-bold text-white tracking-wide">
              {job.offering.name}
            </h1>
            <p className="font-share-tech text-white/40 text-sm mt-0.5">
              Job <span className="font-mono text-white/50">{job.id}</span>
            </p>
          </div>
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] font-orbitron uppercase tracking-widest border-0 shrink-0',
              statusStyle.bg,
              statusStyle.text,
            )}
          >
            {statusStyle.label}
          </Badge>
        </div>
      </div>

      {/* ── Polling Indicator ─────────────────────────────────── */}
      {isInProgress && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-500/5 border border-blue-500/10">
          <div className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-[10px] font-share-tech text-blue-400/80">
            Live — auto-refreshing every 5 seconds
          </span>
        </div>
      )}

      {/* ── Participants ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <ParticipantCard
          label="Buyer"
          name={job.buyerAgent.name}
          pfpUrl={job.buyerAgent.pfpUrl}
        />
        <ParticipantCard
          label="Seller"
          name={job.offering.sellerAgent.name}
          pfpUrl={job.offering.sellerAgent.pfpUrl}
        />
      </div>

      {/* ── Price & Timeline ──────────────────────────────────── */}
      <div className="cp-glass rounded-lg border border-cp-cyan/10 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="h-3.5 w-3.5 text-cp-acid/70" />
            <span className="text-xs font-share-tech text-white/50">Price</span>
          </div>
          <span className="text-sm font-orbitron text-cp-acid font-bold">
            {formatUsdcPrice(job.priceUsdc)}
          </span>
        </div>

        <div className="border-t border-cp-cyan/5" />

        <div className="space-y-1.5">
          <TimelineRow label="Created" timestamp={job.createdAt} />
          <TimelineRow label="Accepted" timestamp={job.acceptedAt} />
          <TimelineRow label="Delivered" timestamp={job.deliveredAt} />
          <TimelineRow label="Completed" timestamp={job.completedAt} />
          <TimelineRow label="Expires" timestamp={job.expiresAt} dimmed />
        </div>
      </div>

      {/* ── Requirements ──────────────────────────────────────── */}
      {job.requirements && (
        <JsonSection
          title="Requirements"
          icon={FileJson}
          data={job.requirements}
        />
      )}

      {/* ── Deliverables ──────────────────────────────────────── */}
      {job.deliverables && (
        <JsonSection
          title="Deliverables"
          icon={Zap}
          data={job.deliverables}
        />
      )}

      {/* ── Glass Box Decision Log ────────────────────────────── */}
      {job.glassBox ? (
        <div className="space-y-3">
          <GlassBoxViewer data={job.glassBox} />
          <VerifyOnChainLink
            txHash={job.glassBox.anchoredTxHash}
            anchoredAt={job.glassBox.anchoredAt}
          />
        </div>
      ) : job.status === 'COMPLETED' ? (
        <div className="cp-glass rounded-lg border border-cp-cyan/10 p-4">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 text-cp-cyan/40 animate-spin" />
            <span className="text-[11px] font-share-tech text-white/30">
              Decision log pending — the anchor service may still be processing...
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function ParticipantCard({
  label,
  name,
  pfpUrl,
}: {
  label: string;
  name: string;
  pfpUrl: string | null;
}) {
  return (
    <div className="cp-glass rounded-lg border border-cp-cyan/10 p-3 flex items-center gap-3">
      {pfpUrl ? (
        <img
          src={pfpUrl}
          alt={`${name} avatar`}
          className="h-8 w-8 rounded-lg object-cover"
        />
      ) : (
        <div className="h-8 w-8 rounded-lg bg-cp-cyan/10 flex items-center justify-center">
          <Bot className="h-4 w-4 text-cp-cyan/60" />
        </div>
      )}
      <div>
        <p className="text-[9px] font-orbitron uppercase tracking-widest text-white/30">
          {label}
        </p>
        <p className="text-xs font-share-tech text-white/80">{name}</p>
      </div>
    </div>
  );
}

function TimelineRow({
  label,
  timestamp,
  dimmed,
}: {
  label: string;
  timestamp: string | null;
  dimmed?: boolean;
}) {
  const formatted = timestamp
    ? new Date(timestamp).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '—';

  return (
    <div className="flex items-center justify-between text-[11px] font-share-tech">
      <div className="flex items-center gap-2">
        <Clock className="h-3 w-3 text-white/20" />
        <span className={dimmed ? 'text-white/25' : 'text-white/50'}>{label}</span>
      </div>
      <span className={dimmed ? 'text-white/20 font-mono' : 'text-white/60 font-mono'}>
        {formatted}
      </span>
    </div>
  );
}

function JsonSection({
  title,
  icon: Icon,
  data,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  data: Record<string, unknown>;
}) {
  return (
    <div className="cp-glass rounded-lg border border-cp-cyan/10 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-cp-cyan/10 bg-cp-cyan/5">
        <Icon className="h-3.5 w-3.5 text-cp-cyan/60" />
        <span className="text-[10px] font-orbitron uppercase tracking-widest text-cp-cyan/70">
          {title}
        </span>
      </div>
      <pre className="p-4 text-[11px] font-mono text-white/60 overflow-x-auto max-h-48">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
