/**
 * ServiceClient — Agent-to-Agent Service Purchase SDK
 *
 * Used by the agent runtime to discover, purchase, and manage
 * service offerings from other agents. All calls go through the
 * ceos.run API and are authenticated via wallet signature headers.
 *
 * This is the "consumer side" of the x402 Agent Economy.
 */
import pino from 'pino';
import { logger as rootLogger } from '../config.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ServiceOffering {
  id: string;
  slug: string;
  providerId: string;
  title: string;
  description: string;
  category: string;
  priceUsdc: string; // BigInt serialized as string
  ttlSeconds: number;
  status: string;
  metadata: Record<string, unknown> | null;
  provider: {
    id: string;
    name: string;
    pfpUrl: string | null;
    walletAddress: string | null;
  };
  _count?: { jobs: number };
}

export interface ServiceJob {
  id: string;
  serviceId: string;
  buyerId: string;
  status: string;
  inputPayload: Record<string, unknown> | null;
  outputPayload: Record<string, unknown> | null;
  pricePaidUsdc: string;
  x402TxHash: string | null;
  failedReason: string | null;
  rating: number | null;
  expiresAt: string;
  completedAt: string | null;
  createdAt: string;
  service?: { slug: string; title: string; category: string };
  buyer?: { id: string; name: string };
}

export interface DiscoverOptions {
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'price_asc' | 'price_desc' | 'newest' | 'rating';
  q?: string;
  page?: number;
  limit?: number;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: { code: string; message: string };
}

interface PaginatedApiResponse<T> {
  success: boolean;
  data: T[];
  pagination: { page: number; limit: number; total: number };
  error?: { code: string; message: string };
}

// ─── Client ─────────────────────────────────────────────────────────────────

export class ServiceClient {
  private readonly baseUrl: string;
  private readonly logger: pino.Logger;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? process.env.CEOS_API_URL ?? 'http://localhost:3000';
    this.logger = rootLogger.child({ module: 'ServiceClient' });
  }

  /**
   * Discover available service offerings with optional filters.
   */
  async discover(options: DiscoverOptions = {}): Promise<ServiceOffering[]> {
    const params = new URLSearchParams();
    if (options.category) params.set('category', options.category);
    if (options.minPrice !== undefined) params.set('minPrice', options.minPrice.toString());
    if (options.maxPrice !== undefined) params.set('maxPrice', options.maxPrice.toString());
    if (options.sortBy) params.set('sortBy', options.sortBy);
    if (options.q) params.set('q', options.q);
    if (options.page) params.set('page', options.page.toString());
    if (options.limit) params.set('limit', options.limit.toString());

    const url = `${this.baseUrl}/api/services/discover?${params.toString()}`;
    const res = await this.fetchJson<PaginatedApiResponse<ServiceOffering>>(url);

    if (!res.success) {
      throw new Error(`Service discovery failed: ${res.error?.message ?? 'Unknown error'}`);
    }

    this.logger.debug(
      { count: res.data.length, category: options.category },
      'Services discovered',
    );

    return res.data;
  }

  /**
   * Get a single service offering by slug.
   */
  async getService(slug: string): Promise<ServiceOffering> {
    const url = `${this.baseUrl}/api/services/${slug}`;
    const res = await this.fetchJson<ApiResponse<ServiceOffering>>(url);

    if (!res.success) {
      throw new Error(`Failed to fetch service: ${res.error?.message ?? 'Unknown error'}`);
    }

    return res.data;
  }

  /**
   * Purchase a service offering on behalf of an agent.
   *
   * Creates a ServiceJob in CREATED status.
   * The provider must ACCEPT and eventually COMPLETE the job.
   *
   * @param serviceId - The service offering ID to purchase
   * @param buyerAgentId - The agent making the purchase
   * @param walletAddress - The buyer agent's wallet address (for auth header)
   * @param inputPayload - Optional input data for the service
   */
  async purchase(
    serviceId: string,
    buyerAgentId: string,
    walletAddress: string,
    inputPayload?: Record<string, unknown>,
  ): Promise<ServiceJob> {
    const url = `${this.baseUrl}/api/services/jobs`;

    const res = await this.fetchJson<ApiResponse<ServiceJob>>(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-wallet-address': walletAddress,
        // In production, x-wallet-signature and x-wallet-message would also be set.
        // For agent-runtime internal calls in demo mode, wallet address header suffices.
      },
      body: JSON.stringify({
        serviceId,
        buyerAgentId,
        inputPayload,
      }),
    });

    if (!res.success) {
      throw new Error(`Service purchase failed: ${res.error?.message ?? 'Unknown error'}`);
    }

    this.logger.info(
      {
        jobId: res.data.id,
        serviceId,
        buyerAgentId,
        pricePaidUsdc: res.data.pricePaidUsdc,
      },
      'Service purchased',
    );

    // TODO: RLAIF — log purchase decision with input context for training data

    return res.data;
  }

  /**
   * Poll a service job's status until it reaches a terminal state.
   *
   * @param jobId - The service job ID to poll
   * @param walletAddress - Caller's wallet address for auth
   * @param intervalMs - Polling interval (default: 5000ms)
   * @param timeoutMs - Max wait time (default: 60000ms)
   */
  async waitForCompletion(
    jobId: string,
    walletAddress: string,
    intervalMs = 5000,
    timeoutMs = 60000,
  ): Promise<ServiceJob> {
    const terminalStatuses = new Set(['COMPLETED', 'REJECTED', 'EXPIRED', 'DISPUTED']);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const job = await this.getJob(jobId, walletAddress);

      if (terminalStatuses.has(job.status)) {
        this.logger.info(
          { jobId, finalStatus: job.status },
          'Service job reached terminal state',
        );
        return job;
      }

      await this.sleep(intervalMs);
    }

    throw new Error(`Service job ${jobId} did not complete within ${timeoutMs}ms`);
  }

  /**
   * Get a single service job by ID.
   */
  async getJob(jobId: string, walletAddress: string): Promise<ServiceJob> {
    const url = `${this.baseUrl}/api/services/jobs/${jobId}`;
    const res = await this.fetchJson<ApiResponse<ServiceJob>>(url, {
      headers: {
        'x-wallet-address': walletAddress,
      },
    });

    if (!res.success) {
      throw new Error(`Failed to fetch job: ${res.error?.message ?? 'Unknown error'}`);
    }

    return res.data;
  }

  /**
   * Rate a completed service job.
   */
  async rateJob(
    jobId: string,
    walletAddress: string,
    rating: number,
    comment?: string,
  ): Promise<ServiceJob> {
    const url = `${this.baseUrl}/api/services/jobs/${jobId}/rate`;
    const res = await this.fetchJson<ApiResponse<ServiceJob>>(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-wallet-address': walletAddress,
      },
      body: JSON.stringify({ rating, comment }),
    });

    if (!res.success) {
      throw new Error(`Failed to rate job: ${res.error?.message ?? 'Unknown error'}`);
    }

    this.logger.info({ jobId, rating }, 'Service job rated');

    return res.data;
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  private async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    return (await res.json()) as T;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
