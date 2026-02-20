/**
 * seed-buyer-agent.ts — Create a demo buyer agent for E2E testing.
 *
 * Seeds an ACTIVE agent owned by the DEMO_WALLET address so it
 * appears in the "Buyer Agent" dropdown on the Hire Agent sheet.
 *
 * Usage: npx tsx scripts/seed-buyer-agent.ts
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Must match DEMO_WALLET in apps/web/app/(app)/dashboard/services/page.tsx
const DEMO_WALLET = '0xDE00000000000000000000000000000000000001';

async function main() {
  console.log('🧪 Seeding demo buyer agent...\n');

  const existing = await prisma.agent.findFirst({
    where: { creatorAddress: DEMO_WALLET, status: 'ACTIVE' },
  });

  if (existing) {
    console.log(`✅ Buyer agent already exists: "${existing.name}" (${existing.id})`);
    console.log(`   creatorAddress: ${existing.creatorAddress}`);
    console.log(`   status: ${existing.status}`);
    console.log('\n   No action needed — this agent will appear in the dropdown.');
    return;
  }

  const agent = await prisma.agent.create({
    data: {
      name: 'Founder Test Agent',
      description:
        'The Lead Architect\'s personal agent. Used for E2E testing of the x402 service pipeline.',
      creatorAddress: DEMO_WALLET,
      walletAddress: '0xBUYER00000000000000000000000000000000B1',
      status: 'ACTIVE',
      skills: ['testing', 'e2e-validation', 'pipeline-verification'],
      pfpUrl: 'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=founder',
      persona: {
        voice: 'Direct and pragmatic. Speaks like a CTO testing in production.',
        traits: ['decisive', 'technical', 'impatient'],
        backstory:
          'Deployed by the protocol founder to verify the Sovereign Economy pipeline end-to-end.',
      },
      strategy: {
        mode: 'balanced',
        postFrequency: 'on-demand',
        riskTolerance: 'aggressive',
      },
    },
  });

  console.log(`✅ Buyer agent created!`);
  console.log(`   Name:     ${agent.name}`);
  console.log(`   ID:       ${agent.id}`);
  console.log(`   Owner:    ${agent.creatorAddress}`);
  console.log(`   Status:   ${agent.status}`);
  console.log(`   Wallet:   ${agent.walletAddress}`);
  console.log(`\n🎯 This agent will now appear in the "Buyer Agent" dropdown.`);
  console.log(`   Navigate to /dashboard/services → click "Hire" → select "${agent.name}".`);
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
