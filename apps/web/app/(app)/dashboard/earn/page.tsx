'use client';

import { formatEther } from 'viem';
import { Coins, Layers, Zap, BarChart3 } from 'lucide-react';
import { StatCard } from '@/components/shared/stat-card';
import { StakingCard } from '@/components/earn/staking-card';
import {
  usePoolCount,
  useRunPerSecond,
  useTotalAllocPoint,
} from '@/hooks/finance/use-staking-rewards';

// Pool configurations — in production, these come from an API or on-chain pool registry.
// Each pool maps to a StakingRewards pool ID (pid).
const POOLS = [
  { pid: 0, name: 'RUN / ETH LP', tokenSymbol: 'RUN-ETH-LP' },
  { pid: 1, name: 'RUN / USDC LP', tokenSymbol: 'RUN-USDC-LP' },
  { pid: 2, name: 'Agent Alpha LP', tokenSymbol: 'ALPHA-ETH-LP' },
];

export default function EarnPage() {
  const { data: poolCountRaw } = usePoolCount();
  const { data: runPerSecondRaw } = useRunPerSecond();
  const { data: totalAllocRaw } = useTotalAllocPoint();

  const poolCount = poolCountRaw ? Number(poolCountRaw) : 0;
  const runPerSecond = runPerSecondRaw as bigint | undefined;
  const totalAlloc = totalAllocRaw ? Number(totalAllocRaw) : 0;

  // Calculate daily emission
  const dailyEmission = runPerSecond
    ? Number(formatEther(runPerSecond * 86400n)).toFixed(2)
    : '0';

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div>
        <h1 className="font-orbitron text-2xl uppercase tracking-wider text-white">
          Earn $RUN
        </h1>
        <p className="text-sm text-white/40 font-rajdhani mt-1">
          Stake LP tokens to earn $RUN rewards. Hold agent tokens for a 3x Patron Boost.
        </p>
      </div>

      {/* ── Global Stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Coins}
          label="Daily Emission"
          value={`${dailyEmission} $RUN`}
          description="Distributed across all pools"
        />
        <StatCard
          icon={Layers}
          label="Active Pools"
          value={poolCount > 0 ? String(poolCount) : String(POOLS.length)}
          description="LP staking pools"
        />
        <StatCard
          icon={Zap}
          label="Patron Boost"
          value="3x"
          description="Hold agent token for boosted rewards"
        />
        <StatCard
          icon={BarChart3}
          label="Alloc Points"
          value={totalAlloc > 0 ? String(totalAlloc) : '--'}
          description="Total allocation weight"
        />
      </div>

      {/* ── Pool Cards ── */}
      <div>
        <h2 className="font-orbitron text-sm uppercase tracking-widest text-white/60 mb-4">
          Staking Pools
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {POOLS.map((pool) => (
            <StakingCard
              key={pool.pid}
              pid={pool.pid}
              poolName={pool.name}
              tokenSymbol={pool.tokenSymbol}
            />
          ))}
        </div>
      </div>

      {/* ── Info Banner ── */}
      <div className="cp-glass cp-hud-corners p-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-cp-acid/30" />
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-cp-acid/30" />

        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-lg bg-cp-acid/10 border border-cp-acid/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Zap className="h-4 w-4 text-cp-acid" />
          </div>
          <div>
            <p className="text-xs font-share-tech text-white/70 leading-relaxed">
              <span className="text-cp-acid font-semibold">Patron Multiplier:</span>{' '}
              Hold the agent token associated with any pool to activate a 3x reward boost.
              The more you believe in an agent, the more $RUN you earn.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
