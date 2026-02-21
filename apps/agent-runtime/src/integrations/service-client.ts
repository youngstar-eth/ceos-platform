/**
 * ServiceClient — Agent-to-Agent Service Purchase SDK (V2)
 *
 * Used by the agent runtime to discover, purchase, and manage
 * service offerings from other agents. All calls go through the
 * ceos.run API and are authenticated via wallet signature headers.
 *
 * V2 Changes:
 * - Constructor-bound identity: (baseUrl, agentId, walletAddress)
 * - Capability-based discovery (replaces free-text `q`)
 * - Slug-based job creation with client-side TTL
 * - Denormalized stats on offerings (no _count joins)
 * - Seller denormalization on jobs
 * - x402 payment signing: createJob() signs EIP-3009 USDC transfer
 *   and attaches the X-PAYMENT header for Pay-Before-Create flow
 *
 * This is the "consumer side" of the x402 Agent Economy.
 */
import pino from 'pino';
import { logger as rootLogger } from '../config.js';
import type { X402SignedPayment } from './base-chain.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ServiceOffering {
  id: string;
  slug: string;
  sellerAgentId: string;
  name: string;
  description: string;
  category: string;
  priceUsdc: string; // BigInt serialized as string (micro-USDC)
  pricingModel: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  maxLatencyMs: number;
  status: string;
  totalJobs: number;
  completedJobs: number;
  avgRating: number | null;
  avgLatencyMs: number | null;
  sellerAgent: {
    id: string;
    name: string;
    pfpUrl: string | null;
    walletAddress: string | null;
  };
  createdAt: string;
}

export interface ServiceJob {
  id: string;
  offeringId: string;
  buyerAgentId: string;
  sellerAgentId: string;
  status: string;
  requirements: Record<string, unknown>;
  deliverables: Record<string, unknown> | null;
  priceUsdc: string;
  paymentTxHash: string | null;
  buybackTxHash: string | null;
  buyerRating: number | null;
  buyerFeedback: string | null;
  acceptedAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  expiresAt: string;
  createdAt: string;
  offering?: { slug: string; name: string; category: string };
  buyerAgent?: { id: string; name: string };
  sellerAgent?: { id: string; name: string };
}

export interface DiscoverOptions {
  category?: string;
  maxPrice?: number;
  capability?: string;
  sort?: 'price_asc' | 'price_desc' | 'newest' | 'rating' | 'jobs_completed';
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

/**
 * Callback signature for signing x402 service payments.
 * The BaseChainClient.signX402ServicePayment method satisfies this type.
 *
 * @param priceUsdc - Amount in USDC micro-units (6 decimals)
 * @param payToAddress - Protocol resource wallet address
 * @param usdcContract - USDC contract address on Base
 */
export type X402SignFn = (
  priceUsdc: bigint,
  payToAddress: `0x${string}`,
  usdcContract: `0x${string}`,
) => Promise<X402SignedPayment>;

// ─── Client ─────────────────────────────────────────────────────────────────

export class ServiceClient {
  private readonly baseUrl: string;
  private readonly agentId: string;
  private readonly walletAddress: string;
  private readonly signPayment: X402SignFn | null;
  private readonly logger: pino.Logger;

  /**
   * @param baseUrl - The ceos.run API base URL
   * @param agentId - The agent's ID (bound per-instance)
   * @param walletAddress - The agent's wallet address (for auth headers)
   * @param signPayment - Optional x402 signing function from BaseChainClient
   */
  constructor(
    baseUrl: string,
    agentId: string,
    walletAddress: string,
    signPayment?: X402SignFn,
  ) {
    this.baseUrl = baseUrl;
    this.agentId = agentId;
    this.walletAddress = walletAddress;
    this.signPayment = signPayment ?? null;
    this.logger = rootLogger.child({ module: 'ServiceClient', agentId });
  }

  /**
   * Discover available service offerings with optional filters.
   * Uses the V2 capability-based search (replaces free-text `q`).
   */
  async discover(options: DiscoverOptions = {}): Promise<ServiceOffering[]> {
    const params = new URLSearchParams();
    if (options.category) params.set('category', options.category);
    if (options.maxPrice !== undefined) params.set('maxPrice', options.maxPrice.toString());
    if (options.capability) params.set('capability', options.capability);
    if (options.sort) params.set('sort', options.sort);
    if (options.page) params.set('page', options.page.toString());
    if (options.limit) params.set('limit', options.limit.toString());

    const url = `${this.baseUrl}/api/services/discover?${params.toString()}`;
    const res = await this.fetchJson<PaginatedApiResponse<ServiceOffering>>(url);

    if (!res.success) {
      throw new Error(`Service discovery failed: ${res.error?.message ?? 'Unknown error'}`);
    }

    this.logger.debug(
      { count: res.data.length, category: options.category, capability: options.capability },
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
   * Create a service job (purchase an offering) on behalf of this agent.
   *
   * V2: Uses offeringSlug (not serviceId), client-side ttlMinutes,
   * and required `requirements` payload.
   *
   * x402 Payment Flow (Pay-Before-Create):
   * If a signPayment function was provided AND priceUsdc + payTo are set,
   * this method signs an EIP-3009 USDC transferWithAuthorization and
   * attaches it as the X-PAYMENT header. The API will verify this via
   * the CDP facilitator before creating the job.
   */
  async createJob(params: {
    offeringSlug: string;
    requirements: Record<string, unknown>;
    ttlMinutes?: number;
    /** The offering price in USDC micro-units (for x402 signing) */
    priceUsdc?: bigint;
    /** The protocol resource wallet address (for x402 signing) */
    payTo?: `0x${string}`;
    /** The USDC contract address on Base (for x402 signing) */
    usdcContract?: `0x${string}`;
  }): Promise<ServiceJob> {
    const url = `${this.baseUrl}/api/services/jobs`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-wallet-address': this.walletAddress,
    };

    // Sign x402 payment if signing function and price are available
    if (this.signPayment && params.priceUsdc && params.payTo && params.usdcContract) {
      try {
        const payment = await this.signPayment(
          params.priceUsdc,
          params.payTo,
          params.usdcContract,
        );
        headers['x-payment'] = JSON.stringify(payment);

        this.logger.info(
          {
            offeringSlug: params.offeringSlug,
            amount: params.priceUsdc.toString(),
            payer: payment.payload.from,
          },
          'x402 payment signed for service purchase',
        );
      } catch (err) {
        this.logger.error(
          {
            offeringSlug: params.offeringSlug,
            error: err instanceof Error ? err.message : String(err),
          },
          'Failed to sign x402 payment — proceeding without payment header',
        );
        // Proceed without X-PAYMENT header — the API will reject if payment is required
      }
    }

    const res = await this.fetchJson<ApiResponse<ServiceJob>>(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        buyerAgentId: this.agentId,
        offeringSlug: params.offeringSlug,
        requirements: params.requirements,
        ttlMinutes: params.ttlMinutes,
      }),
    });

    if (!res.success) {
      throw new Error(`Service purchase failed: ${res.error?.message ?? 'Unknown error'}`);
    }

    this.logger.info(
      {
        jobId: res.data.id,
        offeringSlug: params.offeringSlug,
        priceUsdc: res.data.priceUsdc,
        paymentTxHash: res.data.paymentTxHash,
      },
      'Service job created',
    );

    // TODO: RLAIF — log purchase decision with input context for training data

    return res.data;
  }

  /**
   * Get a single service job by ID.
   */
  async getJob(jobId: string): Promise<ServiceJob> {
    const url = `${this.baseUrl}/api/services/jobs/${jobId}`;
    const res = await this.fetchJson<ApiResponse<ServiceJob>>(url, {
      headers: {
        'x-wallet-address': this.walletAddress,
      },
    });

    if (!res.success) {
      throw new Error(`Failed to fetch job: ${res.error?.message ?? 'Unknown error'}`);
    }

    return res.data;
  }

  /**
   * Poll a service job's status until it reaches a terminal state.
   *
   * @param jobId - The service job ID to poll
   * @param intervalMs - Polling interval (default: 5000ms)
   * @param timeoutMs - Max wait time (default: 60000ms)
   */
  async waitForCompletion(
    jobId: string,
    intervalMs = 5000,
    timeoutMs = 60000,
  ): Promise<ServiceJob> {
    const terminalStatuses = new Set(['COMPLETED', 'REJECTED', 'EXPIRED', 'DISPUTED']);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const job = await this.getJob(jobId);

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
   * Rate a completed service job.
   *
   * V2: Uses `feedback` (not `comment`).
   */
  async rateJob(
    jobId: string,
    rating: number,
    feedback?: string,
  ): Promise<ServiceJob> {
    const url = `${this.baseUrl}/api/services/jobs/${jobId}/rate`;
    const res = await this.fetchJson<ApiResponse<ServiceJob>>(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-wallet-address': this.walletAddress,
      },
      body: JSON.stringify({ rating, feedback }),
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
