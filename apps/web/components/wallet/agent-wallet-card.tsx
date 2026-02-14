'use client';

import { useState } from 'react';
import { useAgentWallet } from '@/hooks/use-agent-wallet';

interface AgentWalletCardProps {
  agentId: string;
}

export function AgentWalletCard({ agentId }: AgentWalletCardProps) {
  const { wallet, isLoading, error, updateLimits, refresh } = useAgentWallet(agentId);
  const [editMode, setEditMode] = useState(false);
  const [sessionLimit, setSessionLimit] = useState<number>(50);
  const [txLimit, setTxLimit] = useState<number>(10);
  const [copied, setCopied] = useState(false);

  const isTestnet = process.env.NEXT_PUBLIC_CHAIN_ID !== '8453';

  const copyAddress = async () => {
    if (!wallet?.address) return;
    await navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveLimits = async () => {
    await updateLimits(sessionLimit, txLimit);
    setEditMode(false);
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/40 p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-32 rounded bg-white/10" />
          <div className="h-8 w-48 rounded bg-white/10" />
          <div className="h-4 w-24 rounded bg-white/10" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-950/20 p-6">
        <p className="text-sm text-red-400">Wallet Error: {error}</p>
        <button
          onClick={refresh}
          className="mt-2 text-xs text-red-300 underline hover:text-red-200"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!wallet?.address) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/40 p-6">
        <h3 className="text-sm font-medium text-white/60">Agent Wallet</h3>
        <p className="mt-2 text-sm text-white/40">
          No wallet provisioned. Wallet will be created on next deployment.
        </p>
      </div>
    );
  }

  const shortAddress = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`;

  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white/60">Agent Wallet</h3>
        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">
          Active
        </span>
      </div>

      {/* Address */}
      <div className="flex items-center gap-2">
        <code className="text-sm font-mono text-white">{shortAddress}</code>
        <button
          onClick={copyAddress}
          className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white transition-colors"
          title="Copy address"
        >
          {copied ? (
            <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )}
        </button>
      </div>

      {/* USDC Balance */}
      {wallet.usdcBalance !== null && (
        <div>
          <p className="text-xs text-white/40">USDC Balance</p>
          <p className="text-lg font-semibold text-white">${wallet.usdcBalance}</p>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-xs text-white/40">Transactions</p>
          <p className="text-sm font-medium text-white">{wallet.transactionCount}</p>
        </div>
        <div>
          <p className="text-xs text-white/40">Total Spent</p>
          <p className="text-sm font-medium text-white">${wallet.totalSpent ?? '0'}</p>
        </div>
        <div>
          <p className="text-xs text-white/40">Auto-Fund</p>
          <p className="text-sm font-medium text-white">{wallet.autoFund ? 'On' : 'Off'}</p>
        </div>
      </div>

      {/* Limits */}
      {editMode ? (
        <div className="space-y-3 rounded-lg bg-white/5 p-3">
          <div>
            <label className="block text-xs text-white/40 mb-1">Session Limit (max 1000)</label>
            <input
              type="number"
              value={sessionLimit}
              onChange={(e) => setSessionLimit(Number(e.target.value))}
              min={1}
              max={1000}
              className="w-full rounded bg-black/60 border border-white/10 px-3 py-1.5 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-white/40 mb-1">TX Limit / day (max 100)</label>
            <input
              type="number"
              value={txLimit}
              onChange={(e) => setTxLimit(Number(e.target.value))}
              min={1}
              max={100}
              className="w-full rounded bg-black/60 border border-white/10 px-3 py-1.5 text-sm text-white"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSaveLimits}
              className="flex-1 rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => setEditMode(false)}
              className="flex-1 rounded bg-white/10 px-3 py-1.5 text-xs font-medium text-white/60 hover:bg-white/20 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="text-xs text-white/40">
            Limits: {wallet.sessionLimit} session / {wallet.txLimit} tx/day
          </div>
          <button
            onClick={() => {
              setSessionLimit(wallet.sessionLimit);
              setTxLimit(wallet.txLimit);
              setEditMode(true);
            }}
            className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            Edit
          </button>
        </div>
      )}

      {/* Fund button — testnet only */}
      {isTestnet && (
        <button
          onClick={async () => {
            try {
              await fetch(`/api/agents/${agentId}/wallet/fund`, { method: 'POST' });
              refresh();
            } catch { /* silent */ }
          }}
          className="w-full rounded bg-cyan-600/20 border border-cyan-500/30 px-3 py-2 text-xs font-medium text-cyan-400 hover:bg-cyan-600/30 transition-colors"
        >
          Fund via Faucet (Testnet)
        </button>
      )}
    </div>
  );
}
