'use client';

import { useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { useAgentDeploy } from '@/hooks/use-agent-deploy';
import { syncDeployedAgent } from '@/app/actions/sync-agent';

/**
 * 🚨 DEBUG ONLY — Remove after testing.
 *
 * Renders a fixed red button that fires AgentFactory.deployAgent()
 * directly with hardcoded test values. No form, no API, no signMessage.
 * If MetaMask opens with a 0.005 ETH tx → hook works.
 * After tx confirms, auto-syncs to Prisma via server action.
 */
export function DebugDeploy() {
  const { address, isConnected } = useAccount();
  const {
    deployAgent,
    hash,
    isWalletConfirming,
    isMining,
    isDeployed,
    isFailed,
    error,
    status,
  } = useAgentDeploy();

  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'failed'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const hasSynced = useRef(false);

  // ── Auto-sync to DB when tx is confirmed ──
  useEffect(() => {
    if (isDeployed && hash && address && !hasSynced.current) {
      hasSynced.current = true;
      console.log('✅ DEBUG DEPLOY SUCCESS! Hash:', hash);
      console.log('🔄 Syncing to database...');

      setSyncStatus('syncing');

      syncDeployedAgent(hash, address, {
        name: 'TestAgent',
        description: 'Debug test agent',
        persona: {
          tone: 'informative',
          style: 'engaging',
          topics: ['general'],
          language: 'en',
        },
        skills: ['general'],
        strategy: {
          postingFrequency: 6,
          engagementMode: 'active',
          trendTracking: true,
          replyProbability: 0.3,
          mediaGeneration: true,
        },
      }).then((result) => {
        if (result.success) {
          console.log('✅ DB SYNC SUCCESS!', result);
          setSyncStatus('synced');
        } else {
          console.error('❌ DB SYNC FAILED:', result.error);
          setSyncError(result.error ?? 'Unknown sync error');
          setSyncStatus('failed');
        }
      }).catch((err) => {
        console.error('❌ DB SYNC ERROR:', err);
        setSyncError(err instanceof Error ? err.message : 'Sync error');
        setSyncStatus('failed');
      });
    }

    if (isFailed && error) {
      console.error('❌ DEBUG DEPLOY FAILED:', error);
    }
  }, [isDeployed, isFailed, hash, error, address]);

  const handleClick = () => {
    if (!isConnected) {
      console.warn('⚠️ Wallet not connected');
      return;
    }
    console.log('🚀 Firing deployAgent() to AgentFactory...');
    deployAgent('TestAgent', 'TEST', 'ipfs://QmDebugTest');
  };

  const label = isWalletConfirming
    ? '⏳ Check Wallet...'
    : isMining
    ? '⛏️ Mining...'
    : syncStatus === 'syncing'
    ? '🔄 Syncing DB...'
    : syncStatus === 'synced'
    ? '✅ Deployed & Synced!'
    : syncStatus === 'failed'
    ? '❌ Sync Failed'
    : isDeployed
    ? '✅ Deployed!'
    : isFailed
    ? '❌ Failed — Retry'
    : '🚨 FORCE DEPLOY (DEBUG)';

  return (
    <div className="fixed bottom-10 right-10 z-[9999] flex flex-col items-end gap-2">
      <button
        onClick={handleClick}
        disabled={isWalletConfirming || isMining || syncStatus === 'syncing'}
        className="bg-red-600 hover:bg-red-500 disabled:bg-red-800 text-white font-bold text-sm px-6 py-4 rounded-xl shadow-2xl shadow-red-500/30 transition-all active:scale-95 disabled:cursor-not-allowed"
      >
        {label}
      </button>

      {/* Status line */}
      <div className="bg-black/80 text-[10px] font-mono text-white/70 px-3 py-1.5 rounded max-w-xs">
        <p>wallet: {isConnected ? address?.slice(0, 6) + '...' + address?.slice(-4) : 'not connected'}</p>
        <p>status: {status}</p>
        <p>sync: {syncStatus}</p>
        {hash && (
          <a
            href={`https://sepolia.basescan.org/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 underline"
          >
            tx: {hash.slice(0, 10)}...
          </a>
        )}
        {error && <p className="text-red-400 break-all">err: {error}</p>}
        {syncError && <p className="text-orange-400 break-all">sync-err: {syncError}</p>}
      </div>
    </div>
  );
}
