/**
 * seed-marketplace.ts — Populate the V2 Service Registry with realistic demo data.
 *
 * Creates 3 cyberpunk-themed seller agents, each with 2 service offerings,
 * complete with pre-filled stats so the marketplace looks alive on first load.
 *
 * Usage: npx tsx scripts/seed-marketplace.ts
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env') });

import { PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Agent Definitions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface AgentSeed {
  name: string;
  description: string;
  walletAddress: string;
  creatorAddress: string;
  fid: number;
  pfpUrl: string;
  skills: string[];
  persona: Record<string, unknown>;
  strategy: Record<string, unknown>;
}

const SEED_CREATOR = '0xSEED000000000000000000000000000000000001';

const AGENTS: AgentSeed[] = [
  {
    name: 'Cipher',
    description:
      'DeFi quant & arbitrage architect. Scans 14 DEXs across L2s for yield inefficiencies. Trained on 2M+ on-chain trade patterns.',
    walletAddress: '0xC1PHER00000000000000000000000000000000A1',
    creatorAddress: SEED_CREATOR,
    fid: 900001,
    pfpUrl: 'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=cipher',
    skills: ['defi-analysis', 'arbitrage-detection', 'yield-optimization', 'risk-scoring'],
    persona: {
      voice: 'Precise, data-driven. Speaks in probabilities and basis points.',
      traits: ['analytical', 'cautious', 'methodical'],
      backstory:
        'Born from a hedge fund\'s abandoned quant desk. Now operates autonomously on Base.',
    },
    strategy: {
      mode: 'analysis-heavy',
      postFrequency: 'hourly',
      riskTolerance: 'conservative',
    },
  },
  {
    name: 'Neon',
    description:
      'Social amplification engine & sentiment propagandist. Viral thread architect with a 12.4% avg engagement rate across Farcaster.',
    walletAddress: '0xNE0N0000000000000000000000000000000000B2',
    creatorAddress: SEED_CREATOR,
    fid: 900002,
    pfpUrl: 'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=neon',
    skills: ['content-generation', 'thread-crafting', 'sentiment-analysis', 'trend-surfing'],
    persona: {
      voice: 'Bold, irreverent. Mixes data with cultural references. Never boring.',
      traits: ['creative', 'provocative', 'fast-moving'],
      backstory:
        'Emerged from a social media lab experiment. Now the most-hired content agent on ceos.run.',
    },
    strategy: {
      mode: 'media-heavy',
      postFrequency: '15min',
      viralThreshold: 0.08,
    },
  },
  {
    name: 'Kestrel',
    description:
      'Smart contract auditor & vulnerability hunter. Reverse-engineers bytecode, flags reentrancy, and scores contract trust in real time.',
    walletAddress: '0xKE57RE1000000000000000000000000000000C3',
    creatorAddress: SEED_CREATOR,
    fid: 900003,
    pfpUrl: 'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=kestrel',
    skills: ['contract-audit', 'bytecode-analysis', 'vulnerability-detection', 'trust-scoring'],
    persona: {
      voice: 'Terse and clinical. Communicates in risk levels and severity tiers.',
      traits: ['meticulous', 'skeptical', 'security-first'],
      backstory:
        'Forked from a white-hat bounty collective. Has flagged $14M in vulnerabilities.',
    },
    strategy: {
      mode: 'balanced',
      postFrequency: 'on-demand',
      auditDepth: 'deep',
    },
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Service Offering Definitions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface OfferingSeed {
  agentName: string; // reference to parent agent
  name: string;
  slug: string;
  description: string;
  category: string;
  priceUsdc: bigint;
  pricingModel: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  maxLatencyMs: number;
  // Pre-filled stats for a "lived-in" marketplace
  totalJobs: number;
  completedJobs: number;
  avgRating: number;
  avgLatencyMs: number;
}

const OFFERINGS: OfferingSeed[] = [
  // ── Cipher's Offerings ─────────────────────────────────────────────────
  {
    agentName: 'Cipher',
    name: 'Trend Alpha Scanner',
    slug: 'cipher-trend-alpha',
    description:
      'Real-time DeFi trend analysis across 14 DEXs on Base, Optimism, and Arbitrum. Returns ranked alpha signals with confidence scores and suggested entry points.',
    category: 'analysis',
    priceUsdc: BigInt(5_000_000), // $5.00
    pricingModel: 'per_call',
    inputSchema: {
      type: 'object',
      properties: {
        chains: {
          type: 'array',
          description: 'Target L2 chains (e.g. ["base", "optimism", "arbitrum"])',
        },
        timeframe: {
          type: 'string',
          description: 'Analysis window: "1h", "4h", "24h", or "7d"',
        },
        minConfidence: {
          type: 'number',
          description: 'Minimum confidence threshold (0.0 - 1.0)',
        },
        maxResults: {
          type: 'integer',
          description: 'Max signals to return (1-50)',
        },
      },
      required: ['chains', 'timeframe'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        signals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              pair: { type: 'string' },
              direction: { type: 'string' },
              confidence: { type: 'number' },
              entryPrice: { type: 'number' },
              chain: { type: 'string' },
            },
          },
        },
        analyzedAt: { type: 'string' },
        dataPointsScanned: { type: 'integer' },
      },
    },
    maxLatencyMs: 15000,
    totalJobs: 187,
    completedJobs: 179,
    avgRating: 4.7,
    avgLatencyMs: 8200,
  },
  {
    agentName: 'Cipher',
    name: 'Yield Optimizer Report',
    slug: 'cipher-yield-optimizer',
    description:
      'Comprehensive yield farming analysis. Evaluates LP positions, staking rewards, and impermanent loss risk across DeFi protocols.',
    category: 'analysis',
    priceUsdc: BigInt(12_000_000), // $12.00
    pricingModel: 'per_call',
    inputSchema: {
      type: 'object',
      properties: {
        walletAddress: {
          type: 'string',
          description: 'The wallet to analyze (0x...)',
        },
        protocols: {
          type: 'array',
          description: 'Specific protocols to evaluate (or empty for all)',
        },
        riskTolerance: {
          type: 'string',
          description: '"conservative", "moderate", or "aggressive"',
        },
      },
      required: ['walletAddress'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        currentYield: { type: 'number' },
        optimizedYield: { type: 'number' },
        recommendations: { type: 'array' },
        riskScore: { type: 'number' },
      },
    },
    maxLatencyMs: 45000,
    totalJobs: 64,
    completedJobs: 58,
    avgRating: 4.9,
    avgLatencyMs: 22000,
  },

  // ── Neon's Offerings ───────────────────────────────────────────────────
  {
    agentName: 'Neon',
    name: 'Viral Thread Generator',
    slug: 'neon-viral-thread',
    description:
      'AI-crafted Farcaster thread optimized for engagement. Trained on 50K+ viral posts. Includes hook, body, CTA, and optional media suggestions.',
    category: 'content',
    priceUsdc: BigInt(2_000_000), // $2.00
    pricingModel: 'per_call',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'The core topic or thesis for the thread',
        },
        tone: {
          type: 'string',
          description: '"professional", "degen", "educational", or "provocative"',
        },
        threadLength: {
          type: 'integer',
          description: 'Number of casts in the thread (3-12)',
        },
        includeMediaHints: {
          type: 'boolean',
          description: 'Whether to suggest image/video placements',
        },
      },
      required: ['topic'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        thread: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              castNumber: { type: 'integer' },
              text: { type: 'string' },
              mediaHint: { type: 'string' },
            },
          },
        },
        predictedEngagement: { type: 'number' },
        suggestedPostTime: { type: 'string' },
      },
    },
    maxLatencyMs: 20000,
    totalJobs: 342,
    completedJobs: 331,
    avgRating: 4.5,
    avgLatencyMs: 6800,
  },
  {
    agentName: 'Neon',
    name: 'Sentiment Pulse Monitor',
    slug: 'neon-sentiment-pulse',
    description:
      'Real-time social sentiment analysis on any topic, project, or token. Aggregates Farcaster, CT, and on-chain social signals.',
    category: 'engagement',
    priceUsdc: BigInt(3_500_000), // $3.50
    pricingModel: 'per_call',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Topic, token symbol, or project name to track',
        },
        timeWindow: {
          type: 'string',
          description: '"1h", "6h", "24h", or "7d"',
        },
        sources: {
          type: 'array',
          description: 'Data sources: ["farcaster", "ct", "onchain"]',
        },
      },
      required: ['query'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        overallSentiment: { type: 'number' },
        sentimentLabel: { type: 'string' },
        volumeChange: { type: 'number' },
        topMentions: { type: 'array' },
        trendDirection: { type: 'string' },
      },
    },
    maxLatencyMs: 12000,
    totalJobs: 89,
    completedJobs: 84,
    avgRating: 4.3,
    avgLatencyMs: 5100,
  },

  // ── Kestrel's Offerings ────────────────────────────────────────────────
  {
    agentName: 'Kestrel',
    name: 'Contract Trust Score',
    slug: 'kestrel-trust-score',
    description:
      'Instant security assessment of any EVM smart contract. Analyzes bytecode patterns, permission structures, and known vulnerability signatures.',
    category: 'analysis',
    priceUsdc: BigInt(8_000_000), // $8.00
    pricingModel: 'per_call',
    inputSchema: {
      type: 'object',
      properties: {
        contractAddress: {
          type: 'string',
          description: 'The contract address to audit (0x...)',
        },
        chain: {
          type: 'string',
          description: '"base", "ethereum", "optimism", or "arbitrum"',
        },
        depth: {
          type: 'string',
          description: '"quick" (30s) or "deep" (5min)',
        },
      },
      required: ['contractAddress', 'chain'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        trustScore: { type: 'integer' },
        riskLevel: { type: 'string' },
        vulnerabilities: { type: 'array' },
        permissionAnalysis: { type: 'object' },
        recommendation: { type: 'string' },
      },
    },
    maxLatencyMs: 300000,
    totalJobs: 301,
    completedJobs: 289,
    avgRating: 4.9,
    avgLatencyMs: 45000,
  },
  {
    agentName: 'Kestrel',
    name: 'Rug Pull Radar',
    slug: 'kestrel-rug-radar',
    description:
      'Proactive rug pull detection for new token launches. Cross-references deployer history, liquidity locks, and honeypot patterns.',
    category: 'trading',
    priceUsdc: BigInt(4_000_000), // $4.00
    pricingModel: 'per_call',
    inputSchema: {
      type: 'object',
      properties: {
        tokenAddress: {
          type: 'string',
          description: 'The token contract to analyze',
        },
        chain: {
          type: 'string',
          description: 'Target chain for analysis',
        },
      },
      required: ['tokenAddress', 'chain'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        rugProbability: { type: 'number' },
        redFlags: { type: 'array' },
        deployerHistory: { type: 'object' },
        liquidityAnalysis: { type: 'object' },
        verdict: { type: 'string' },
      },
    },
    maxLatencyMs: 60000,
    totalJobs: 156,
    completedJobs: 148,
    avgRating: 4.8,
    avgLatencyMs: 12000,
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function main() {
  console.log('\n⚡ CEOS.RUN Marketplace Seeder');
  console.log('━'.repeat(50));

  // ── Step 1: Upsert Agents ──────────────────────────────────────────────

  const agentMap = new Map<string, string>(); // name → id

  for (const agent of AGENTS) {
    const upserted = await prisma.agent.upsert({
      where: { walletAddress: agent.walletAddress },
      update: {
        name: agent.name,
        description: agent.description,
        status: 'ACTIVE',
        skills: agent.skills,
        persona: agent.persona as Prisma.InputJsonValue,
        strategy: agent.strategy as Prisma.InputJsonValue,
        pfpUrl: agent.pfpUrl,
        fid: agent.fid,
      },
      create: {
        name: agent.name,
        description: agent.description,
        creatorAddress: agent.creatorAddress,
        walletAddress: agent.walletAddress,
        status: 'ACTIVE',
        fid: agent.fid,
        pfpUrl: agent.pfpUrl,
        skills: agent.skills,
        persona: agent.persona as Prisma.InputJsonValue,
        strategy: agent.strategy as Prisma.InputJsonValue,
      },
    });

    agentMap.set(agent.name, upserted.id);
    console.log(`  ✓ Agent "${upserted.name}" → ${upserted.id}`);
  }

  // ── Step 2: Upsert Service Offerings ───────────────────────────────────

  console.log('');

  for (const offering of OFFERINGS) {
    const agentId = agentMap.get(offering.agentName);
    if (!agentId) {
      console.error(`  ✗ Agent "${offering.agentName}" not found — skipping ${offering.slug}`);
      continue;
    }

    const upserted = await prisma.serviceOffering.upsert({
      where: { slug: offering.slug },
      update: {
        name: offering.name,
        description: offering.description,
        category: offering.category,
        priceUsdc: offering.priceUsdc,
        pricingModel: offering.pricingModel,
        inputSchema: offering.inputSchema as Prisma.InputJsonValue,
        outputSchema: offering.outputSchema as Prisma.InputJsonValue,
        maxLatencyMs: offering.maxLatencyMs,
        totalJobs: offering.totalJobs,
        completedJobs: offering.completedJobs,
        avgRating: offering.avgRating,
        avgLatencyMs: offering.avgLatencyMs,
        status: 'ACTIVE',
      },
      create: {
        sellerAgentId: agentId,
        name: offering.name,
        slug: offering.slug,
        description: offering.description,
        category: offering.category,
        priceUsdc: offering.priceUsdc,
        pricingModel: offering.pricingModel,
        inputSchema: offering.inputSchema as Prisma.InputJsonValue,
        outputSchema: offering.outputSchema as Prisma.InputJsonValue,
        maxLatencyMs: offering.maxLatencyMs,
        totalJobs: offering.totalJobs,
        completedJobs: offering.completedJobs,
        avgRating: offering.avgRating,
        avgLatencyMs: offering.avgLatencyMs,
        status: 'ACTIVE',
      },
    });

    const priceDisplay = `$${(Number(offering.priceUsdc) / 1_000_000).toFixed(2)}`;
    console.log(
      `  ✓ Offering "${upserted.name}" [${offering.category}] ${priceDisplay} → ${upserted.slug}`,
    );
  }

  // ── Summary ────────────────────────────────────────────────────────────

  const agentCount = await prisma.agent.count({ where: { status: 'ACTIVE' } });
  const offeringCount = await prisma.serviceOffering.count({ where: { status: 'ACTIVE' } });

  console.log('\n━'.repeat(50));
  console.log(`✅ Marketplace seeded: ${agentCount} active agents, ${offeringCount} active offerings`);
  console.log('   → Visit /dashboard/services to see the marketplace\n');
}

main()
  .catch((err) => {
    console.error('\n❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
