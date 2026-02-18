'use server';

import { revalidatePath } from 'next/cache';
import { createPublicClient, http, decodeEventLog, type Hex } from 'viem';
import { baseSepolia, base } from 'viem/chains';
import { prisma } from '@/lib/prisma';
import { AGENT_FACTORY_ABI, CONTRACT_ADDRESSES } from '@/lib/contracts';
import type { Prisma } from '@prisma/client';

// ── Types ───────────────────────────────────────────────────────────
interface SyncResult {
  success: boolean;
  agentId?: string;
  onChainAddress?: string;
  tokenId?: number;
  error?: string;
}

interface AgentFormData {
  name: string;
  description?: string;
  persona: Record<string, unknown>;
  skills: string[];
  strategy: Record<string, unknown>;
}

// ── Chain configuration ─────────────────────────────────────────────
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? '84532');
const chain = CHAIN_ID === 8453 ? base : baseSepolia;

const publicClient = createPublicClient({
  chain,
  transport: http(
    CHAIN_ID === 8453
      ? process.env.BASE_RPC_URL
      : process.env.BASE_SEPOLIA_RPC_URL
  ),
});

/**
 * Sync a deployed agent to the Prisma database.
 *
 * Called from the frontend after `useAgentDeploy` confirms the tx.
 * 1. Fetches the tx receipt from the blockchain
 * 2. Decodes the `AgentDeployed` event log
 * 3. Updates OR creates the Agent record in Prisma
 * 4. Revalidates the dashboard cache
 */
export async function syncDeployedAgent(
  txHash: string,
  creatorAddress: string,
  formData?: AgentFormData,
  existingAgentId?: string,
): Promise<SyncResult> {
  try {
    // ── Step 1: Verify the tx on-chain ────────────────────────────
    const receipt = await publicClient.getTransactionReceipt({
      hash: txHash as Hex,
    });

    if (!receipt || receipt.status !== 'success') {
      return { success: false, error: 'Transaction failed or not found on-chain' };
    }

    // ── Step 2: Extract AgentDeployed event ─────────────────────
    const factoryAddress = CONTRACT_ADDRESSES.agentFactory.toLowerCase();
    const deployLog = receipt.logs.find(
      (log) => log.address.toLowerCase() === factoryAddress
    );

    if (!deployLog) {
      return { success: false, error: 'AgentDeployed event not found in tx logs' };
    }

    let decodedEvent: {
      creator: string;
      agent: string;
      tokenId: bigint;
      name: string;
      virtualsToken: string;
    };

    try {
      const decoded = decodeEventLog({
        abi: AGENT_FACTORY_ABI,
        data: deployLog.data,
        topics: deployLog.topics,
        eventName: 'AgentDeployed',
      });

      decodedEvent = decoded.args as unknown as typeof decodedEvent;
    } catch {
      return { success: false, error: 'Failed to decode AgentDeployed event from tx logs' };
    }

    const onChainAddress = decodedEvent.agent;
    const tokenId = Number(decodedEvent.tokenId);

    // ── Step 3: Upsert agent in Prisma ──────────────────────────
    // If the deploy wizard already created a PENDING agent, update it.
    // Otherwise (debug button path), create a new record.
    let agentId: string;

    if (existingAgentId) {
      // Path A: Deploy wizard already saved agent via POST /api/agents
      const existing = await prisma.agent.findUnique({
        where: { id: existingAgentId },
      });

      if (!existing) {
        return { success: false, error: `Agent ${existingAgentId} not found in database` };
      }

      const updated = await prisma.agent.update({
        where: { id: existingAgentId },
        data: {
          onChainAddress,
          tokenId,
          status: 'DEPLOYING',
        },
      });

      agentId = updated.id;
    } else {
      // Path B: Debug button or direct deploy — no pre-existing record
      // Create a minimal agent record from the form data
      const defaultPersona: Prisma.InputJsonValue = {
        tone: 'informative',
        style: 'engaging',
        topics: ['general'],
        language: 'en',
      };
      const defaultStrategy: Prisma.InputJsonValue = {
        postingFrequency: 6,
        engagementMode: 'active',
        trendTracking: true,
        replyProbability: 0.3,
        mediaGeneration: true,
      };

      const agent = await prisma.agent.create({
        data: {
          name: formData?.name ?? decodedEvent.name,
          description: formData?.description ?? null,
          creatorAddress,
          onChainAddress,
          tokenId,
          status: 'DEPLOYING',
          persona: (formData?.persona as Prisma.InputJsonValue) ?? defaultPersona,
          skills: formData?.skills ?? ['general'],
          strategy: (formData?.strategy as Prisma.InputJsonValue) ?? defaultStrategy,
        },
      });

      agentId = agent.id;
    }

    // ── Step 4: Revalidate dashboard pages ──────────────────────
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/my-agents');
    revalidatePath('/dashboard/deploy');

    return {
      success: true,
      agentId,
      onChainAddress,
      tokenId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error during sync';
    console.error('[syncDeployedAgent] Error:', message);
    return { success: false, error: message };
  }
}
