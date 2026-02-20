'use client';

import { ExternalLink, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Constants ────────────────────────────────────────────────────────────

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? '8453');

/**
 * Build the block explorer URL for a transaction hash.
 *
 * Production (chainId 8453): https://basescan.org/tx/0x...
 * Testnet  (chainId 84532): https://sepolia.basescan.org/tx/0x...
 * Demo mode: No real tx — link goes to basescan homepage with a toast.
 */
function getExplorerUrl(txHash: string): string {
  if (CHAIN_ID === 84532) {
    return `https://sepolia.basescan.org/tx/${txHash}`;
  }
  return `https://basescan.org/tx/${txHash}`;
}

// ── Types ────────────────────────────────────────────────────────────────

interface VerifyOnChainLinkProps {
  /** The on-chain transaction hash (from anchoredTxHash) */
  txHash: string | null;
  /** ISO-8601 timestamp of when the anchor was committed */
  anchoredAt?: string | null;
  className?: string;
}

// ── Component ────────────────────────────────────────────────────────────

/**
 * "Verify on Base L2" — Cyberpunk-style on-chain verification link.
 *
 * When a job's decision log has been anchored on-chain via ERC-8004,
 * this component renders a glowing link to the Base block explorer
 * where the user can verify the SHA-256 hash was committed.
 *
 * Demo mode: Shows the link as disabled with a "Demo Mode" tooltip.
 */
export function VerifyOnChainLink({
  txHash,
  anchoredAt,
  className,
}: VerifyOnChainLinkProps) {
  // No anchor data → don't render
  if (!txHash) return null;

  const isDemoTx = txHash.startsWith('0x' + '0'.repeat(10));
  const explorerUrl = isDemoTx ? '#' : getExplorerUrl(txHash);
  const isClickable = !isDemoTx;

  const anchoredDate = anchoredAt
    ? new Date(anchoredAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {isClickable ? (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'inline-flex items-center gap-2 px-3 py-1.5 rounded-md',
            'bg-cp-cyan/5 border border-cp-cyan/20',
            'text-cp-cyan text-[11px] font-orbitron uppercase tracking-widest',
            'hover:bg-cp-cyan/15 hover:border-cp-cyan/40 hover:shadow-[0_0_12px_rgba(0,240,255,0.15)]',
            'transition-all duration-300',
          )}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Verify on Base L2</span>
          <ExternalLink className="h-3 w-3 opacity-50" />
        </a>
      ) : (
        <span
          className={cn(
            'inline-flex items-center gap-2 px-3 py-1.5 rounded-md',
            'bg-white/5 border border-white/10',
            'text-white/30 text-[11px] font-orbitron uppercase tracking-widest',
            'cursor-not-allowed',
          )}
          title="Demo mode — no real on-chain transaction"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Anchored (Demo)</span>
        </span>
      )}

      {anchoredDate && (
        <span className="text-[9px] font-share-tech text-white/30">
          {anchoredDate}
        </span>
      )}
    </div>
  );
}
