/* ============================================================
 * @ceosrun/shared — Shared TypeScript types
 * ============================================================ */

// ---------------------------------------------------------------------------
// API Response Types
// ---------------------------------------------------------------------------

export interface ApiResponse<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

export type ApiResult<T> = ApiResponse<T> | ApiError;

// ---------------------------------------------------------------------------
// Agent Types
// ---------------------------------------------------------------------------

export type AgentStatusType =
  | "PENDING"
  | "DEPLOYING"
  | "ACTIVE"
  | "PAUSED"
  | "TERMINATED"
  | "FAILED";

export type ContentTypeValue =
  | "ORIGINAL"
  | "THREAD"
  | "REPLY"
  | "RECAST"
  | "MEDIA";

export interface AgentPersona {
  tone: string;
  style: string;
  topics: string[];
  language: string;
  customPrompt?: string;
}

export interface AgentStrategy {
  postingFrequency: number;
  engagementMode: "passive" | "active" | "aggressive";
  trendTracking: boolean;
  replyProbability: number;
  mediaGeneration: boolean;
}

export interface AgentConfig {
  id: string;
  name: string;
  description: string | null;
  fid: number | null;
  creatorAddress: string;
  onChainAddress: string | null;
  tokenId: number | null;
  status: AgentStatusType;
  persona: AgentPersona;
  skills: string[];
  strategy: AgentStrategy;
  signerUuid: string | null;
  agentUri: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CastData {
  id: string;
  agentId: string;
  content: string;
  mediaUrl: string | null;
  hash: string | null;
  type: ContentTypeValue;
  likes: number;
  recasts: number;
  replies: number;
  publishedAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Epoch & Revenue Types
// ---------------------------------------------------------------------------

export interface EpochInfo {
  epochNumber: number;
  totalRevenue: string;
  creatorShare: string;
  finalized: boolean;
  finalizedAt: string | null;
  createdAt: string;
}

export interface ClaimInfo {
  address: string;
  epoch: number;
  amount: string;
  txHash: string | null;
  claimedAt: string;
}

export interface ScoreBreakdown {
  address: string;
  epoch: number;
  engagement: number;
  growth: number;
  quality: number;
  uptime: number;
  totalScore: number;
}

// ---------------------------------------------------------------------------
// x402 Payment Types
// ---------------------------------------------------------------------------

export interface PaymentInfo {
  endpoint: string;
  amount: string;
  payer: string;
  txHash: string | null;
  resourceId: string | null;
  createdAt: string;
}

export interface PaymentReceipt {
  id: string;
  endpoint: string;
  amount: string;
  payer: string;
  txHash: string | null;
  resourceId: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// ERC-8004 Types
// ---------------------------------------------------------------------------

export interface AgentIdentity {
  agentId: string;
  tokenId: number;
  agentUri: string;
  reputationScore: number;
  registrationJson: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReputationInfo {
  agentId: string;
  tokenId: number;
  reputationScore: number;
  epoch: number;
  breakdown: ScoreBreakdown | null;
}

// ---------------------------------------------------------------------------
// Metrics Types
// ---------------------------------------------------------------------------

export interface AgentMetricsData {
  epoch: number;
  engagementRate: number;
  followerGrowth: number;
  contentQuality: number;
  uptime: number;
  totalCasts: number;
  totalLikes: number;
  totalRecasts: number;
}

// ---------------------------------------------------------------------------
// Skill Types
// ---------------------------------------------------------------------------

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  premium: boolean;
  price?: string;
}

// ---------------------------------------------------------------------------
// Content Generation Types
// ---------------------------------------------------------------------------

export interface ContentGenerationRequest {
  agentId: string;
  type: ContentTypeValue;
  topic?: string;
  replyTo?: string;
}

export interface ContentGenerationResult {
  content: string;
  mediaUrl: string | null;
  type: ContentTypeValue;
}
