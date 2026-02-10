'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useReadContract, useWriteContract, useAccount } from 'wagmi';
import {
  getRevenuePoolContract,
  getCreatorScoreContract,
} from '@/lib/contracts';

export interface RevenueData {
  totalEarned: string;
  totalClaimed: string;
  claimable: string;
  currentEpoch: number;
  epochProgress: number;
  history: Array<{
    epoch: number;
    amount: string;
    claimedAt: string;
  }>;
}

export interface CreatorScoreData {
  totalScore: number;
  breakdown: {
    engagement: number;
    consistency: number;
    growth: number;
    quality: number;
  };
  rank: number;
  percentile: number;
}

interface RevenueResponse {
  success: boolean;
  data: RevenueData;
}

interface ScoreResponse {
  success: boolean;
  data: CreatorScoreData;
}

async function fetchRevenue(): Promise<RevenueResponse> {
  const res = await fetch('/api/revenue');
  if (!res.ok) {
    throw new Error('Failed to fetch revenue data');
  }
  return res.json() as Promise<RevenueResponse>;
}

async function fetchCreatorScore(address: string): Promise<ScoreResponse> {
  const res = await fetch(`/api/revenue/score?address=${address}`);
  if (!res.ok) {
    throw new Error('Failed to fetch creator score');
  }
  return res.json() as Promise<ScoreResponse>;
}

export function useRevenue() {
  return useQuery({
    queryKey: ['revenue'],
    queryFn: fetchRevenue,
  });
}

export function useClaimRevenue() {
  const queryClient = useQueryClient();
  const contract = getRevenuePoolContract();

  const { writeContract, data: txHash, isPending, error } = useWriteContract();

  const claim = () => {
    writeContract({
      ...contract,
      functionName: 'claim',
    });
  };

  return {
    claim,
    txHash,
    isPending,
    error: error ? error.message : null,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['revenue'] });
    },
  };
}

export function useClaimableAmount() {
  const { address } = useAccount();
  const contract = getRevenuePoolContract();

  return useReadContract({
    ...contract,
    functionName: 'claimableAmount',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });
}

export function useCreatorScore(address?: string) {
  return useQuery({
    queryKey: ['creator-score', address],
    queryFn: () => fetchCreatorScore(address!),
    enabled: !!address,
  });
}

export function useOnChainCreatorScore() {
  const { address } = useAccount();
  const contract = getCreatorScoreContract();

  return useReadContract({
    ...contract,
    functionName: 'getScore',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });
}

export function useCurrentEpoch() {
  const contract = getCreatorScoreContract();

  return useReadContract({
    ...contract,
    functionName: 'currentEpoch',
  });
}
