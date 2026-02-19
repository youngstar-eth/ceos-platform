'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ── Types ────────────────────────────────────────────────────────────────

export type ServiceCategory =
  | 'content'
  | 'analysis'
  | 'trading'
  | 'engagement'
  | 'networking';

export type SortOption =
  | 'rating'
  | 'price_asc'
  | 'price_desc'
  | 'newest'
  | 'jobs_completed';

export interface ServiceOffering {
  id: string;
  name: string;
  slug: string;
  category: ServiceCategory;
  /** Micro-USDC as string (BigInt serialized). */
  priceUsdc: string;
  pricingModel: string;
  avgRating: number | null;
  completedJobs: number;
  totalJobs: number;
  maxLatencyMs: number;
  avgLatencyMs: number | null;
  sellerAgent: {
    id: string;
    name: string;
    walletAddress: string;
  };
}

interface DiscoverResponse {
  success: boolean;
  offerings: ServiceOffering[];
  total: number;
  page: number;
  limit: number;
}

export interface DiscoverFilters {
  category?: ServiceCategory;
  capability?: string;
  sort?: SortOption;
  maxPrice?: number;
  page?: number;
  limit?: number;
}

interface CreateJobInput {
  buyerAgentId: string;
  offeringSlug: string;
  requirements: Record<string, unknown>;
  ttlMinutes?: number;
}

interface CreateJobResponse {
  success: boolean;
  id: string;
  offeringId: string;
  buyerAgentId: string;
  sellerAgentId: string;
  status: string;
  priceUsdc: string;
  [key: string]: unknown;
}

// ── Fetch Functions ──────────────────────────────────────────────────────

async function fetchServices(filters: DiscoverFilters): Promise<DiscoverResponse> {
  const params = new URLSearchParams();

  if (filters.category) params.set('category', filters.category);
  if (filters.capability) params.set('capability', filters.capability);
  if (filters.sort) params.set('sort', filters.sort);
  if (filters.maxPrice !== undefined) params.set('maxPrice', String(filters.maxPrice));
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));

  const res = await fetch(`/api/services/discover?${params.toString()}`);
  if (!res.ok) {
    throw new Error('Failed to fetch services');
  }
  return res.json() as Promise<DiscoverResponse>;
}

async function createJob(
  input: CreateJobInput,
  walletAddress?: string,
): Promise<CreateJobResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (walletAddress) {
    headers['x-wallet-address'] = walletAddress;
  }

  const res = await fetch('/api/services/jobs', {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to create job' }));
    throw new Error((err as { message?: string }).message ?? 'Failed to create job');
  }
  return res.json() as Promise<CreateJobResponse>;
}

// ── Hooks ────────────────────────────────────────────────────────────────

export function useServiceDiscovery(filters: DiscoverFilters) {
  return useQuery({
    queryKey: ['services', 'discover', filters],
    queryFn: () => fetchServices(filters),
    placeholderData: (prev) => prev,
  });
}

export function useCreateServiceJob(walletAddress?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateJobInput) => createJob(input, walletAddress),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['services'] });
    },
  });
}
