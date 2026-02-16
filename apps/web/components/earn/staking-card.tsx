'use client';

import { useState } from 'react';
import { formatEther, parseEther } from 'viem';
import { useAccount } from 'wagmi';
import {
  Coins,
  ArrowUpCircle,
  ArrowDownCircle,
  Zap,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  usePoolInfo,
  useUserInfo,
  usePendingRewards,
  useBoostStatus,
  usePoolAPY,
  useStakingTokenBalance,
  useStakingAllowance,
  useApproveStakingToken,
  useStake,
  useWithdraw,
  useHarvest,
  type PoolInfo,
} from '@/hooks/finance/use-staking-rewards';

interface StakingCardProps {
  pid: number;
  poolName: string;
  tokenSymbol: string;
  className?: string;
}

type TabMode = 'deposit' | 'withdraw';

export function StakingCard({ pid, poolName, tokenSymbol, className }: StakingCardProps) {
  const { isConnected } = useAccount();
  const [tab, setTab] = useState<TabMode>('deposit');
  const [amount, setAmount] = useState('');

  // ── On-chain reads ──
  const { data: poolInfoRaw, isLoading: poolLoading } = usePoolInfo(pid);
  const { data: userInfoRaw, isLoading: userLoading } = useUserInfo(pid);
  const { data: pendingRaw, isLoading: rewardsLoading } = usePendingRewards(pid);
  const { data: isBoosted } = useBoostStatus(pid);
  const { apy, isLoading: apyLoading } = usePoolAPY(pid);

  const poolInfo = poolInfoRaw as PoolInfo | undefined;
  const userStaked = (userInfoRaw as { amount: bigint } | undefined)?.amount ?? 0n;
  const pending = (pendingRaw as bigint) ?? 0n;

  const { data: walletBalance } = useStakingTokenBalance(poolInfo?.stakingToken);
  const { data: allowance } = useStakingAllowance(poolInfo?.stakingToken);

  // ── Write hooks ──
  const { approve, isPending: approving } = useApproveStakingToken(poolInfo?.stakingToken);
  const { stake, isPending: staking } = useStake(pid);
  const { withdraw, isPending: withdrawing } = useWithdraw(pid);
  const { harvest, isPending: harvesting } = useHarvest(pid);

  // ── Derived state ──
  const parsedAmount = amount ? parseEther(amount) : 0n;
  const needsApproval = tab === 'deposit' && parsedAmount > 0n && (allowance as bigint ?? 0n) < parsedAmount;
  const isProcessing = approving || staking || withdrawing || harvesting;
  const tvl = poolInfo ? formatEther(poolInfo.totalStaked) : '0';
  const isLoading = poolLoading || userLoading;

  const handleAction = () => {
    if (parsedAmount === 0n) return;

    if (tab === 'deposit') {
      if (needsApproval) {
        approve(parsedAmount);
      } else {
        stake(parsedAmount);
      }
    } else {
      withdraw(parsedAmount);
    }
  };

  const handleMax = () => {
    if (tab === 'deposit') {
      const bal = walletBalance as bigint | undefined;
      if (bal) setAmount(formatEther(bal));
    } else {
      if (userStaked > 0n) setAmount(formatEther(userStaked));
    }
  };

  // ── Skeleton ──
  if (isLoading) {
    return (
      <div className={cn('cp-glass cp-hud-corners p-6 animate-pulse', className)}>
        <div className="h-6 bg-white/5 rounded w-1/2 mb-4" />
        <div className="h-10 bg-white/5 rounded mb-3" />
        <div className="h-10 bg-white/5 rounded mb-3" />
        <div className="h-10 bg-white/5 rounded" />
      </div>
    );
  }

  return (
    <div className={cn('cp-glass cp-hud-corners p-6 relative group overflow-hidden', className)}>
      {/* Decorative corners */}
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-cp-cyan/30" />
      <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-cp-cyan/30" />
      <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-cp-cyan/30" />
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-cp-cyan/30" />

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-orbitron text-sm uppercase tracking-widest text-white">
            {poolName}
          </h3>
          <p className="text-[10px] font-share-tech text-white/40 mt-0.5">
            Stake {tokenSymbol} &middot; Earn $RUN
          </p>
        </div>

        {/* Patron Boost Badge */}
        {isBoosted && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-cp-acid/40 bg-cp-acid/10 animate-pulse">
            <Zap className="h-3 w-3 text-cp-acid" />
            <span className="text-[10px] font-share-tech uppercase tracking-wider text-cp-acid">
              3x Boost
            </span>
          </div>
        )}
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div>
          <p className="text-[9px] uppercase tracking-[0.2em] text-white/30 font-share-tech">APY</p>
          <p className="text-lg font-share-tech text-cp-acid">
            {apyLoading ? '...' : apy === Infinity ? '∞' : `${apy?.toFixed(1)}%`}
          </p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-[0.2em] text-white/30 font-share-tech">TVL</p>
          <p className="text-lg font-share-tech text-white">
            {Number(tvl).toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-[0.2em] text-white/30 font-share-tech">Earned</p>
          <p className="text-lg font-share-tech text-cp-cyan">
            {rewardsLoading ? '...' : Number(formatEther(pending)).toFixed(4)}
          </p>
        </div>
      </div>

      {/* ── Harvest Button ── */}
      {pending > 0n && (
        <button
          onClick={() => harvest()}
          disabled={harvesting}
          className="w-full mb-4 py-2 rounded border border-cp-cyan/30 bg-cp-cyan/5 text-cp-cyan text-xs font-share-tech uppercase tracking-wider hover:bg-cp-cyan/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {harvesting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Coins className="h-3.5 w-3.5" />
          )}
          Harvest {Number(formatEther(pending)).toFixed(4)} $RUN
        </button>
      )}

      {/* ── Tab Switcher ── */}
      <div className="flex mb-4 border border-white/10 rounded overflow-hidden">
        <button
          onClick={() => setTab('deposit')}
          className={cn(
            'flex-1 py-2 text-[10px] font-share-tech uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5',
            tab === 'deposit'
              ? 'bg-cp-cyan/10 text-cp-cyan border-r border-white/10'
              : 'text-white/40 hover:text-white/60 border-r border-white/10',
          )}
        >
          <ArrowUpCircle className="h-3 w-3" />
          Deposit
        </button>
        <button
          onClick={() => setTab('withdraw')}
          className={cn(
            'flex-1 py-2 text-[10px] font-share-tech uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5',
            tab === 'withdraw'
              ? 'bg-cp-pink/10 text-cp-pink'
              : 'text-white/40 hover:text-white/60',
          )}
        >
          <ArrowDownCircle className="h-3 w-3" />
          Withdraw
        </button>
      </div>

      {/* ── Input ── */}
      <div className="relative mb-3">
        <input
          type="text"
          inputMode="decimal"
          placeholder="0.0"
          value={amount}
          onChange={(e) => {
            const val = e.target.value;
            if (/^\d*\.?\d*$/.test(val)) setAmount(val);
          }}
          className="w-full bg-white/[0.03] border border-white/10 rounded px-4 py-3 text-white font-share-tech text-sm placeholder:text-white/20 focus:outline-none focus:border-cp-cyan/40"
        />
        <button
          onClick={handleMax}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-share-tech uppercase text-cp-cyan/60 hover:text-cp-cyan px-2 py-0.5 border border-cp-cyan/20 rounded"
        >
          Max
        </button>
      </div>

      {/* ── Balance info ── */}
      <div className="flex justify-between text-[10px] font-share-tech text-white/30 mb-4">
        <span>
          Wallet: {walletBalance ? Number(formatEther(walletBalance as bigint)).toFixed(4) : '0'} {tokenSymbol}
        </span>
        <span>
          Staked: {Number(formatEther(userStaked)).toFixed(4)} {tokenSymbol}
        </span>
      </div>

      {/* ── Action Button ── */}
      {!isConnected ? (
        <div className="w-full py-3 rounded bg-white/[0.03] border border-white/10 text-center text-xs text-white/30 font-share-tech">
          Connect Wallet
        </div>
      ) : (
        <button
          onClick={handleAction}
          disabled={isProcessing || parsedAmount === 0n}
          className={cn(
            'w-full py-3 rounded text-xs font-share-tech uppercase tracking-wider transition-all disabled:opacity-40 flex items-center justify-center gap-2',
            tab === 'deposit'
              ? 'bg-cp-cyan/20 border border-cp-cyan/30 text-cp-cyan hover:bg-cp-cyan/30'
              : 'bg-cp-pink/20 border border-cp-pink/30 text-cp-pink hover:bg-cp-pink/30',
          )}
        >
          {isProcessing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {tab === 'deposit'
            ? needsApproval
              ? 'Approve'
              : 'Deposit'
            : 'Withdraw'}
        </button>
      )}
    </div>
  );
}
