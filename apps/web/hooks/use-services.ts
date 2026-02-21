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
    pfpUrl?: string | null;
    /** Flattened from ERC8004Identity.reputationScore (0-10000 scale) */
    reputationScore?: number;
  };
}

/** Shape returned by the API (wrapped in successResponse envelope). */
interface DiscoverApiResponse {
  success: boolean;
  data: {
    offerings: ServiceOffering[];
    total: number;
    page: number;
    limit: number;
  };
}

/** Unwrapped shape used by the hook consumer. */
interface DiscoverResponse {
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

export interface CreateJobResponse {
  id: string;
  offeringId: string;
  buyerAgentId: string;
  sellerAgentId: string;
  status: string;
  priceUsdc: string;
  [key: string]: unknown;
}

/** API envelope for job creation response. */
interface CreateJobApiResponse {
  success: boolean;
  data: CreateJobResponse;
}

/** Full job detail response from GET /api/services/jobs/[jobId] */
export interface ServiceJobDetail {
  id: string;
  offeringId: string;
  buyerAgentId: string;
  sellerAgentId: string;
  status: string;
  priceUsdc: string;
  requirements: Record<string, unknown> | null;
  deliverables: Record<string, unknown> | null;
  buyerRating: number | null;
  buyerFeedback: string | null;
  paymentTxHash: string | null;
  buybackTxHash: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  offering: {
    slug: string;
    name: string;
    category: string;
    sellerAgent: {
      id: string;
      name: string;
      pfpUrl: string | null;
      walletAddress: string;
    };
  };
  buyerAgent: {
    id: string;
    name: string;
    pfpUrl: string | null;
    walletAddress: string;
  };
  /** Glass Box RLAIF provenance data (null until executor completes) */
  glassBox: {
    modelUsed: string;
    tokensUsed: number;
    executionTimeMs: number;
    isSuccess: boolean;
    errorMessage: string | null;
    decisionLogHash: string | null;
    anchoredTxHash: string | null;
    anchoredAt: string | null;
    createdAt: string;
  } | null;
}

/** API envelope for job detail response. */
interface JobDetailApiResponse {
  success: boolean;
  data: ServiceJobDetail;
}

// ── Constants ────────────────────────────────────────────────────────────

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
const DEMO_WALLET = '0xDE00000000000000000000000000000000000001';

// ── Fetch Functions ──────────────────────────────────────────────────────

async function fetchServiceJob(
  jobId: string,
  walletAddress?: string,
): Promise<ServiceJobDetail> {
  const headers: Record<string, string> = {};

  const effectiveWallet = walletAddress || (DEMO_MODE ? DEMO_WALLET : undefined);
  if (effectiveWallet) {
    headers['x-wallet-address'] = effectiveWallet;
  }

  const res = await fetch(`/api/services/jobs/${jobId}`, { headers });
  if (!res.ok) {
    throw new Error('Failed to fetch job');
  }

  const json = (await res.json()) as JobDetailApiResponse;
  return json.data;
}

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

  // Unwrap the { success, data } API envelope
  const json = (await res.json()) as DiscoverApiResponse;
  return json.data;
}

async function createJob(
  input: CreateJobInput,
  walletAddress?: string,
): Promise<CreateJobResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // GOD MODE: Ensure wallet header is always present in demo mode,
  // even if walletAddress prop was undefined (stale env cache, etc.)
  const effectiveWallet = walletAddress || (DEMO_MODE ? DEMO_WALLET : undefined);
  if (effectiveWallet) {
    headers['x-wallet-address'] = effectiveWallet;
  }

  const res = await fetch('/api/services/jobs', {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ message: 'Failed to create job' }));
    // Error responses may be { success: false, error: { message } } or { message }
    const msg =
      (errBody as { error?: { message?: string } }).error?.message ??
      (errBody as { message?: string }).message ??
      'Failed to create job';
    throw new Error(msg);
  }

  // Unwrap the { success, data } API envelope
  const json = (await res.json()) as CreateJobApiResponse;
  return json.data;
}

// ── Hooks ────────────────────────────────────────────────────────────────

export function useServiceDiscovery(filters: DiscoverFilters) {
  return useQuery({
    queryKey: ['services', 'discover', filters],
    queryFn: () => fetchServices(filters),
    placeholderData: (prev) => prev,
  });
}

export function useServiceJob(jobId: string | null, walletAddress?: string) {
  return useQuery({
    queryKey: ['services', 'job', jobId],
    queryFn: () => fetchServiceJob(jobId!, walletAddress),
    enabled: !!jobId,
    // Poll every 5s while job is in-progress (executor may update it)
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status) return 5000;
      const terminal = ['COMPLETED', 'REJECTED', 'DISPUTED', 'EXPIRED'];
      return terminal.includes(status) ? false : 5000;
    },
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
