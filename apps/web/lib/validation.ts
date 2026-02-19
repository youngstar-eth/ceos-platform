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

export const createServiceOfferingSchema = z.object({
  agentId: z.string().cuid(),
  title: z.string().min(3).max(120),
  description: z.string().min(10).max(2000),
  category: z.string().min(2).max(50),
  priceUsdc: z.string().regex(/^\d+$/, "Must be a non-negative integer string (micro-USDC)"),
  ttlSeconds: z.coerce.number().int().min(60).max(86400).default(3600),
  metadata: z.record(z.unknown()).optional(),
});

export const updateServiceOfferingSchema = z.object({
  title: z.string().min(3).max(120).optional(),
  description: z.string().min(10).max(2000).optional(),
  category: z.string().min(2).max(50).optional(),
  priceUsdc: z.string().regex(/^\d+$/, "Must be a non-negative integer string (micro-USDC)").optional(),
  ttlSeconds: z.coerce.number().int().min(60).max(86400).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "RETIRED"]).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const serviceDiscoveryQuerySchema = z.object({
  category: z.string().optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "RETIRED"]).optional().default("ACTIVE"),
  sortBy: z.enum(["price_asc", "price_desc", "newest", "rating"]).optional().default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().max(200).optional(),
});

export const createServiceJobSchema = z.object({
  serviceId: z.string().cuid(),
  buyerAgentId: z.string().cuid(),
  inputPayload: z.record(z.unknown()).optional(),
});

export const updateServiceJobSchema = z.object({
  status: z.enum(["ACCEPTED", "DELIVERING", "COMPLETED", "REJECTED"]),
  outputPayload: z.record(z.unknown()).optional(),
  failedReason: z.string().max(500).optional(),
});

export const rateServiceJobSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
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
