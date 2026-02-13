/**
 * Trigger an immediate autonomous posting cycle.
 * This simulates what the scheduler would do on its repeating interval.
 * Usage: npx tsx scripts/trigger-autonomous.ts [agentId] [strategy]
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env') });

import IORedis from 'ioredis';
import { Queue } from 'bullmq';

async function main() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL not set in .env');
  }

  console.log('🔗 Connecting to Redis...');
  const redis = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
  });

  const queue = new Queue('scheduled-posting', { connection: redis });

  const agentId = process.argv[2] || 'cmliad6pj0000nzk3xsm458jw';
  const strategy = process.argv[3] || 'Balanced';

  const job = await queue.add('generate-and-post', {
    agentId,
    strategy,
    scheduledAt: new Date().toISOString(),
  });

  console.log(`✅ Autonomous cycle triggered! Job ID: ${job.id}`);
  console.log(`   Agent: ${agentId}`);
  console.log(`   Strategy: ${strategy}`);
  console.log('');
  console.log('   The scheduler worker will now:');
  console.log('   1. Load agent data from DB');
  console.log('   2. Generate content via OpenRouter + Fal.ai');
  console.log('   3. Post to Farcaster via Neynar');
  console.log('   4. Store cast in database');
  console.log('');
  console.log('   Watch the agent-runtime logs for progress...');

  await queue.close();
  await redis.quit();
}

main().catch(console.error);
