'use client';

import { useReadContract, useWriteContract, useAccount } from 'wagmi';
import { type Address } from 'viem';
import { useQueryClient } from '@tanstack/react-query';
import {
  getStakingRewardsContract,
  ERC20_ABI,
  CONTRACT_ADDRESSES,
} from '@/lib/contracts';

// ── Pool Info ────────────────────────────────────────

export interface PoolInfo {
  stakingToken: Address;
  agentToken: Address;
  agentTokenThreshold: bigint;
  totalStaked: bigint;
  allocPoint: bigint;
  lastRewardTime: bigint;
  accRunPerShare: bigint;
}

export interface UserInfo {
  amount: bigint;
  rewardDebt: bigint;
  lastDepositTime: bigint;
}

// ── Read Hooks ───────────────────────────────────────

export function usePoolInfo(pid: number) {
  const contract = getStakingRewardsContract();

  return useReadContract({
    ...contract,
    functionName: 'getPoolInfo',
    args: [BigInt(pid)],
    query: {
      enabled: contract.address !== '0x',
      refetchInterval: 30_000,
    },
  });
}

export function useUserInfo(pid: number) {
  const { address } = useAccount();
  const contract = getStakingRewardsContract();

  return useReadContract({
    ...contract,
    functionName: 'getUserInfo',
    args: address ? [BigInt(pid), address] : undefined,
    query: {
      enabled: !!address && contract.address !== '0x',
      refetchInterval: 15_000,
    },
  });
}

export function usePendingRewards(pid: number) {
  const { address } = useAccount();
  const contract = getStakingRewardsContract();

  return useReadContract({
    ...contract,
    functionName: 'pendingRewards',
    args: address ? [BigInt(pid), address] : undefined,
    query: {
      enabled: !!address && contract.address !== '0x',
      refetchInterval: 10_000,
    },
  });
}

export function useBoostStatus(pid: number) {
  const { address } = useAccount();
  const contract = getStakingRewardsContract();

  return useReadContract({
    ...contract,
    functionName: 'getUserBoostStatus',
    args: address ? [BigInt(pid), address] : undefined,
    query: {
      enabled: !!address && contract.address !== '0x',
    },
  });
}

export function useRunPerSecond() {
  const contract = getStakingRewardsContract();

  return useReadContract({
    ...contract,
    functionName: 'runPerSecond',
    query: {
      enabled: contract.address !== '0x',
    },
  });
}

export function useTotalAllocPoint() {
  const contract = getStakingRewardsContract();

  return useReadContract({
    ...contract,
    functionName: 'totalAllocPoint',
    query: {
      enabled: contract.address !== '0x',
    },
  });
}

export function usePoolCount() {
  const contract = getStakingRewardsContract();

  return useReadContract({
    ...contract,
    functionName: 'poolCount',
    query: {
      enabled: contract.address !== '0x',
    },
  });
}

// ── Token Balance / Allowance ────────────────────────

export function useStakingTokenBalance(tokenAddress?: Address) {
  const { address } = useAccount();

  return useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!tokenAddress,
      refetchInterval: 15_000,
    },
  });
}

export function useStakingAllowance(tokenAddress?: Address) {
  const { address } = useAccount();

  return useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, CONTRACT_ADDRESSES.stakingRewards] : undefined,
    query: {
      enabled: !!address && !!tokenAddress && CONTRACT_ADDRESSES.stakingRewards !== '0x',
    },
  });
}

// ── Write Hooks ──────────────────────────────────────

export function useApproveStakingToken(tokenAddress?: Address) {
  const queryClient = useQueryClient();
  const { writeContract, data: txHash, isPending, error } = useWriteContract();

  const approve = (amount: bigint) => {
    if (!tokenAddress) return;
    writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CONTRACT_ADDRESSES.stakingRewards, amount],
    });
  };

  return {
    approve,
    txHash,
    isPending,
    error: error ? error.message : null,
    invalidate: () => void queryClient.invalidateQueries({ queryKey: ['readContract'] }),
  };
}

export function useStake(pid: number) {
  const queryClient = useQueryClient();
  const contract = getStakingRewardsContract();
  const { writeContract, data: txHash, isPending, error } = useWriteContract();

  const stake = (amount: bigint) => {
    writeContract({
      ...contract,
      functionName: 'stake',
      args: [BigInt(pid), amount],
    });
  };

  return {
    stake,
    txHash,
    isPending,
    error: error ? error.message : null,
    invalidate: () => void queryClient.invalidateQueries({ queryKey: ['readContract'] }),
  };
}

export function useWithdraw(pid: number) {
  const queryClient = useQueryClient();
  const contract = getStakingRewardsContract();
  const { writeContract, data: txHash, isPending, error } = useWriteContract();

  const withdraw = (amount: bigint) => {
    writeContract({
      ...contract,
      functionName: 'withdraw',
      args: [BigInt(pid), amount],
    });
  };

  return {
    withdraw,
    txHash,
    isPending,
    error: error ? error.message : null,
    invalidate: () => void queryClient.invalidateQueries({ queryKey: ['readContract'] }),
  };
}

export function useHarvest(pid: number) {
  const queryClient = useQueryClient();
  const contract = getStakingRewardsContract();
  const { writeContract, data: txHash, isPending, error } = useWriteContract();

  const harvest = () => {
    writeContract({
      ...contract,
      functionName: 'harvest',
      args: [BigInt(pid)],
    });
  };

  return {
    harvest,
    txHash,
    isPending,
    error: error ? error.message : null,
    invalidate: () => void queryClient.invalidateQueries({ queryKey: ['readContract'] }),
  };
}

// ── Computed: APY Estimation ─────────────────────────

export function usePoolAPY(pid: number) {
  const { data: poolInfo } = usePoolInfo(pid);
  const { data: runPerSecond } = useRunPerSecond();
  const { data: totalAllocPoint } = useTotalAllocPoint();

  if (!poolInfo || !runPerSecond || !totalAllocPoint || totalAllocPoint === 0n) {
    return { apy: null, isLoading: true };
  }

  const pool = poolInfo as PoolInfo;
  if (pool.totalStaked === 0n) {
    return { apy: Infinity, isLoading: false };
  }

  // Annual RUN for this pool = (runPerSecond * allocPoint / totalAllocPoint) * seconds_per_year
  const SECONDS_PER_YEAR = 365n * 24n * 60n * 60n;
  const poolRunPerYear = ((runPerSecond as bigint) * pool.allocPoint * SECONDS_PER_YEAR) / (totalAllocPoint as bigint);

  // APY = (annual_rewards / total_staked) * 100
  // Using 1e18 precision since both are in wei
  const apyBps = (poolRunPerYear * 10000n) / pool.totalStaked;
  const apy = Number(apyBps) / 100;

  return { apy, isLoading: false };
}
