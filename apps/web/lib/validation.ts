import { z } from "zod";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const ethereumAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address");

export const txHash = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid transaction hash");

export const positiveInt = z.number().int().positive();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------------------------------------------------------------------------
// Agent Schemas
// ---------------------------------------------------------------------------

export const agentPersonaSchema = z.object({
  tone: z.string().min(1).max(2000),
  style: z.string().min(1).max(500),
  topics: z.array(z.string().min(1).max(100)).min(1).max(20),
  language: z.string().min(2).max(10),
  customPrompt: z.string().max(2000).optional(),
});

export const agentStrategySchema = z.object({
  postingFrequency: z.number().min(1).max(100),
  engagementMode: z.enum(["passive", "active", "aggressive"]),
  trendTracking: z.boolean(),
  replyProbability: z.number().min(0).max(1),
  mediaGeneration: z.boolean(),
});

export const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  persona: agentPersonaSchema,
  skills: z.array(z.string().min(1).max(100)).min(1).max(20),
  strategy: agentStrategySchema,
});

export const updateAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  persona: agentPersonaSchema.optional(),
  skills: z.array(z.string().min(1).max(100)).min(1).max(20).optional(),
  strategy: agentStrategySchema.optional(),
  status: z
    .enum(["PENDING", "DEPLOYING", "ACTIVE", "PAUSED", "TERMINATED", "FAILED"])
    .optional(),
});

// ---------------------------------------------------------------------------
// Deploy Schema
// ---------------------------------------------------------------------------

export const deployAgentSchema = z.object({
  agentId: z.string().cuid(),
  txHash: txHash.optional(),
});

// ---------------------------------------------------------------------------
// Revenue Schemas
// ---------------------------------------------------------------------------

export const claimRevenueSchema = z.object({
  epoch: positiveInt,
});

// ---------------------------------------------------------------------------
// Webhook Schema
// ---------------------------------------------------------------------------

export const neynarWebhookSchema = z.object({
  type: z.string(),
  data: z.record(z.unknown()),
});

// ---------------------------------------------------------------------------
// x402 Schemas
// ---------------------------------------------------------------------------

export const verifyPaymentSchema = z.object({
  endpoint: z.string().url(),
  paymentHeader: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Content Generation Schema
// ---------------------------------------------------------------------------

export const generateContentSchema = z.object({
  agentId: z.string().cuid(),
  type: z.enum(["ORIGINAL", "THREAD", "REPLY", "RECAST", "MEDIA"]),
  topic: z.string().max(500).optional(),
  replyTo: z.string().optional(),
});

// ---------------------------------------------------------------------------
// ERC-8004 Schemas
// ---------------------------------------------------------------------------

export const updateReputationSchema = z.object({
  reputationScore: z.number().int().min(0).max(100),
  epoch: positiveInt,
});

// ---------------------------------------------------------------------------
// Agent list query params
// ---------------------------------------------------------------------------

export const listAgentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(["PENDING", "DEPLOYING", "ACTIVE", "PAUSED", "TERMINATED", "FAILED"])
    .optional(),
  creator: ethereumAddress.optional(),
});

// ---------------------------------------------------------------------------
// Service Registry Schemas
// ---------------------------------------------------------------------------

const SERVICE_CATEGORIES = [
  "content",
  "analysis",
  "trading",
  "engagement",
  "networking",
] as const;

export const createServiceOfferingSchema = z.object({
  sellerAgentId: z.string().cuid(),
  name: z.string().min(3).max(120),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase alphanumeric + hyphens")
    .min(3)
    .max(60)
    .optional(),
  description: z.string().min(10).max(2000),
  category: z.enum(SERVICE_CATEGORIES),
  priceUsdc: z
    .string()
    .regex(/^\d+$/, "Must be a non-negative integer string (micro-USDC)"),
  pricingModel: z.string().min(1).max(50).default("per_call"),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.record(z.unknown()),
  maxLatencyMs: z.coerce.number().int().min(1000).max(300000).default(30000),
});

export const updateServiceOfferingSchema = z.object({
  name: z.string().min(3).max(120).optional(),
  description: z.string().min(10).max(2000).optional(),
  category: z.enum(SERVICE_CATEGORIES).optional(),
  priceUsdc: z
    .string()
    .regex(/^\d+$/, "Must be a non-negative integer string (micro-USDC)")
    .optional(),
  pricingModel: z.string().min(1).max(50).optional(),
  inputSchema: z.record(z.unknown()).optional(),
  outputSchema: z.record(z.unknown()).optional(),
  maxLatencyMs: z.coerce.number().int().min(1000).max(300000).optional(),
  status: z.enum(["ACTIVE", "PAUSED", "DELISTED"]).optional(),
});

export const serviceDiscoveryQuerySchema = z.object({
  category: z.string().optional(),
  maxPrice: z.coerce.number().int().optional(),
  capability: z.string().max(200).optional(),
  sort: z
    .enum(["rating", "price_asc", "price_desc", "newest", "jobs_completed"])
    .optional()
    .default("rating"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const createServiceJobSchema = z.object({
  buyerAgentId: z.string().cuid(),
  offeringSlug: z.string().min(1).max(100),
  requirements: z.record(z.unknown()),
  ttlMinutes: z.coerce.number().int().min(1).max(1440).default(30),
});

export const updateServiceJobSchema = z.object({
  status: z.enum(["ACCEPTED", "DELIVERING", "COMPLETED", "REJECTED", "DISPUTED"]),
  deliverables: z.record(z.unknown()).optional(),
});

export const rateServiceJobSchema = z.object({
  rating: z.number().int().min(1).max(5),
  feedback: z.string().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Metrics query
// ---------------------------------------------------------------------------

export const metricsQuerySchema = z.object({
  epoch: z.coerce.number().int().positive().optional(),
});

// ---------------------------------------------------------------------------
// x402 receipts query
// ---------------------------------------------------------------------------

export const receiptsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  payer: ethereumAddress.optional(),
  endpoint: z.string().optional(),
});
