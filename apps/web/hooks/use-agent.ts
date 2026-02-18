'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface WalletPolicy {
  spendLimit?: {
    amount: string;
    currency: 'ETH' | 'USDC';
    period: 'daily' | 'weekly' | 'monthly';
  };
  whitelist?: string[];
  approvalRequiredFor?: string[];
}

export interface Agent {
  id: string;
  name: string;
  description: string | null;
  status: string;
  farcasterFid: number | null;
  farcasterUsername: string | null;
  onChainId: number | null;
  onChainAddress: string | null;
  personality: string | null;
  pfpUrl: string | null;
  bannerUrl: string | null;
  skills: string[];
  strategy: string | Record<string, unknown>;
  walletAddress: string | null;
  walletPolicy: WalletPolicy | null;
  metrics: {
    totalCasts: number;
    totalLikes: number;
    totalRecasts: number;
    totalFollowers: number;
    engagementRate: number;
  } | null;
  createdAt: string;
  updatedAt: string;
}

interface AgentsResponse {
  success: boolean;
  data: Agent[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

interface AgentResponse {
  success: boolean;
  data: Agent;
}

interface CreateAgentInput {
  name: string;
  description: string;
  personality: string;
  skills: string[];
  strategy: 'balanced' | 'text-heavy' | 'media-heavy';
}

interface UpdateAgentInput {
  id: string;
  status?: Agent['status'];
  personality?: string;
  skills?: string[];
  strategy?: Agent['strategy'];
}

interface ActivateAgentInput {
  id: string;
  farcasterUsername: string;
  walletPolicy?: WalletPolicy;
  /** Connected wallet address — sent as x-wallet-address header for auth. */
  walletAddress?: string;
}

interface ActivateAgentResponse {
  success: boolean;
  data: {
    agent: Partial<Agent>;
    farcasterProfile: {
      fid: number;
      username: string;
      displayName: string | null;
      bio: string | null;
      pfpUrl: string | null;
      followerCount: number;
      followingCount: number;
    };
    message: string;
  };
}

async function fetchAgents(page = 1, limit = 10, creator?: string): Promise<AgentsResponse> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (creator) params.set('creator', creator);

  const res = await fetch(`/api/agents?${params.toString()}`);
  if (!res.ok) {
    throw new Error('Failed to fetch agents');
  }
  return res.json() as Promise<AgentsResponse>;
}

async function fetchAgent(id: string): Promise<AgentResponse> {
  const res = await fetch(`/api/agents/${id}`);
  if (!res.ok) {
    throw new Error('Failed to fetch agent');
  }
  return res.json() as Promise<AgentResponse>;
}

async function createAgent(input: CreateAgentInput): Promise<AgentResponse> {
  const res = await fetch('/api/agents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error('Failed to create agent');
  }
  return res.json() as Promise<AgentResponse>;
}

async function updateAgent(input: UpdateAgentInput): Promise<AgentResponse> {
  const { id, ...data } = input;
  const res = await fetch(`/api/agents/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error('Failed to update agent');
  }
  return res.json() as Promise<AgentResponse>;
}

export function useAgents(page = 1, limit = 10) {
  return useQuery({
    queryKey: ['agents', page, limit],
    queryFn: () => fetchAgents(page, limit),
  });
}

export function useMyAgents(creator: string | undefined, page = 1, limit = 50) {
  return useQuery({
    queryKey: ['my-agents', creator, page, limit],
    queryFn: () => fetchAgents(page, limit, creator),
    enabled: !!creator,
  });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: ['agent', id],
    queryFn: () => fetchAgent(id),
    enabled: !!id,
  });
}

export function useCreateAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createAgent,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}

export function useUpdateAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateAgent,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['agents'] });
      void queryClient.invalidateQueries({
        queryKey: ['agent', variables.id],
      });
    },
  });
}

async function activateAgent(input: ActivateAgentInput): Promise<ActivateAgentResponse> {
  const { id, walletAddress, ...data } = input;
  const res = await fetch(`/api/agents/${id}/activate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(walletAddress ? { 'x-wallet-address': walletAddress } : {}),
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: 'Activation failed' } }));
    throw new Error(
      (err as { error?: { message?: string } })?.error?.message ?? 'Failed to activate agent',
    );
  }
  return res.json() as Promise<ActivateAgentResponse>;
}

export function useActivateAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: activateAgent,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['agents'] });
      void queryClient.invalidateQueries({ queryKey: ['my-agents'] });
      void queryClient.invalidateQueries({
        queryKey: ['agent', variables.id],
      });
    },
  });
}
