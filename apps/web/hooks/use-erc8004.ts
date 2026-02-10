'use client';

import { useQuery } from '@tanstack/react-query';

export interface AgentIdentity {
  agentId: string;
  nftTokenId: number | null;
  farcasterFid: number | null;
  x402Endpoint: string | null;
  a2aEndpoint: string | null;
  agentUri: string | null;
  owner: string;
  registeredAt: string;
}

export interface AgentReputation {
  agentId: string;
  score: number;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  validations: number;
  lastUpdated: string;
  history: Array<{
    epoch: number;
    score: number;
  }>;
}

interface IdentityResponse {
  success: boolean;
  data: AgentIdentity;
}

interface ReputationResponse {
  success: boolean;
  data: AgentReputation;
}

async function fetchAgentIdentity(id: string): Promise<IdentityResponse> {
  const res = await fetch(`/api/erc8004/identity/${id}`);
  if (!res.ok) {
    throw new Error('Failed to fetch agent identity');
  }
  return res.json() as Promise<IdentityResponse>;
}

async function fetchAgentReputation(id: string): Promise<ReputationResponse> {
  const res = await fetch(`/api/erc8004/reputation/${id}`);
  if (!res.ok) {
    throw new Error('Failed to fetch agent reputation');
  }
  return res.json() as Promise<ReputationResponse>;
}

export function useAgentIdentity(id: string) {
  return useQuery({
    queryKey: ['erc8004-identity', id],
    queryFn: () => fetchAgentIdentity(id),
    enabled: !!id,
  });
}

export function useReputation(id: string) {
  return useQuery({
    queryKey: ['erc8004-reputation', id],
    queryFn: () => fetchAgentReputation(id),
    enabled: !!id,
  });
}
