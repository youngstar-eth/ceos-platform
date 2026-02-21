'use client';

import {
  Brain,
  Clock,
  Hash,
  AlertCircle,
  CheckCircle2,
  Cpu,
  Coins,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────

/** Glass Box data shape from the jobs API (glassBox field) */
export interface GlassBoxData {
  modelUsed: string;
  tokensUsed: number;
  executionTimeMs: number;
  isSuccess: boolean;
  errorMessage: string | null;
  decisionLogHash: string | null;
  anchoredTxHash: string | null;
  anchoredAt: string | null;
  createdAt: string;
}

interface GlassBoxViewerProps {
  data: GlassBoxData;
  className?: string;
}

// ── Component ────────────────────────────────────────────────────────────

/**
 * Glass Box Decision Log Viewer
 *
 * Displays the RLAIF telemetry data for a completed service job —
 * model used, tokens, execution time, success status, and the
 * SHA-256 provenance hash. This is the user-facing "Glass Box"
 * that proves our Data Moat is real.
 *
 * CRITICAL: Raw prompts and responses NEVER leave the database.
 * This component only displays metadata + hash.
 */
export function GlassBoxViewer({ data, className }: GlassBoxViewerProps) {
  const executionDisplay =
    data.executionTimeMs < 1000
      ? `${data.executionTimeMs}ms`
      : `${(data.executionTimeMs / 1000).toFixed(1)}s`;

  const hashTruncated = data.decisionLogHash
    ? `${data.decisionLogHash.slice(0, 8)}...${data.decisionLogHash.slice(-8)}`
    : null;

  return (
    <div
      className={cn(
        'cp-glass rounded-lg border border-cp-cyan/10 overflow-hidden',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-cp-cyan/10 bg-cp-cyan/5">
        <Brain className="h-3.5 w-3.5 text-cp-cyan" />
        <span className="text-[11px] font-orbitron uppercase tracking-widest text-cp-cyan">
          Glass Box — Decision Log
        </span>
        <div className="flex-1" />
        {data.isSuccess ? (
          <div className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-cp-acid" />
            <span className="text-[9px] font-share-tech text-cp-acid uppercase">
              Success
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3 text-red-400" />
            <span className="text-[9px] font-share-tech text-red-400 uppercase">
              Failed
            </span>
          </div>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-3 gap-px bg-cp-cyan/5">
        <GlassMetric
          icon={Cpu}
          label="Model"
          value={data.modelUsed}
          iconColor="text-cp-pink/70"
        />
        <GlassMetric
          icon={Coins}
          label="Tokens"
          value={data.tokensUsed.toLocaleString()}
          iconColor="text-cp-acid/70"
        />
        <GlassMetric
          icon={Clock}
          label="Latency"
          value={executionDisplay}
          iconColor="text-cp-cyan/70"
        />
      </div>

      {/* Hash section */}
      {hashTruncated && (
        <div className="px-4 py-2.5 border-t border-cp-cyan/10">
          <div className="flex items-center gap-2">
            <Hash className="h-3 w-3 text-white/30 shrink-0" />
            <span className="text-[9px] font-share-tech text-white/40 uppercase tracking-wider">
              SHA-256 Provenance
            </span>
          </div>
          <p
            className="text-[11px] font-mono text-cp-cyan/80 mt-1 select-all cursor-text"
            title={data.decisionLogHash ?? undefined}
          >
            {hashTruncated}
          </p>
          <p className="text-[8px] font-share-tech text-white/25 mt-0.5">
            Raw prompts &amp; responses never leave the database. Only the hash
            is anchored on-chain.
          </p>
        </div>
      )}

      {/* Error message (if failed) */}
      {data.errorMessage && (
        <div className="px-4 py-2 border-t border-red-500/10 bg-red-500/5">
          <p className="text-[10px] font-share-tech text-red-300 line-clamp-2">
            {data.errorMessage}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function GlassMetric({
  icon: Icon,
  label,
  value,
  iconColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  iconColor: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 py-2.5 bg-cp-void/50">
      <Icon className={cn('h-3 w-3', iconColor)} />
      <span className="text-[10px] font-share-tech text-white/80 truncate max-w-full px-1">
        {value}
      </span>
      <span className="text-[8px] font-share-tech text-white/30 uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}
