/**
 * Manually trigger content generation + posting for an agent.
 * In demo mode, simulates Farcaster posting if signer is not real.
 * Usage: npx tsx scripts/trigger-post.ts <agentId>
 */
import IORedis from 'ioredis';
import { Queue, QueueEvents } from 'bullmq';
import { config } from '../src/config.js';

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
const agentId = process.argv[2];

if (!agentId) {
  console.error('Usage: npx tsx scripts/trigger-post.ts <agentId>');
  process.exit(1);
}

async function triggerPost() {
  const redis = new IORedis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  console.log('🔗 Connected to Redis');

  // Fetch agent data from API
  let agent: Record<string, unknown> | null = null;
  try {
    const response = await fetch(`http://localhost:3000/api/agents`);
    const json = await response.json() as { data?: unknown[] };
    const agents = json.data;
    if (Array.isArray(agents)) {
      agent = agents.find((a: Record<string, unknown>) => a.id === agentId) as Record<string, unknown> | undefined ?? null;
    }
  } catch {
    console.error('Failed to fetch from API');
  }

  if (!agent) {
    console.error(`❌ Agent ${agentId} not found`);
    await redis.quit();
    process.exit(1);
  }

  console.log(`🤖 Agent: ${agent.name} (status: ${agent.status})`);

  const persona = agent.persona as { tone?: string; customPrompt?: string };
  const personaText = persona.customPrompt || persona.tone || String(agent.name);

  // Step 1: Generate content
  console.log('\n📝 Step 1: Generating content...');
  const connection = redis.duplicate();
  const contentQueue = new Queue('content-generation', { connection });
  const contentEvents = new QueueEvents('content-generation', { connection: redis.duplicate() });

  const contentJob = await contentQueue.add(
    'generate-content',
    {
      agentId: String(agent.id),
      agentName: String(agent.name),
      agentPersona: personaText,
      contentType: 'auto',
      strategy: 'MediaHeavy',
    },
    { priority: 1, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
  );

  console.log(`   Job ID: ${contentJob.id}`);

  const content = await contentJob.waitUntilFinished(contentEvents, 60_000) as {
    text: string;
    mediaUrl?: string;
    contentType: string;
    model: string;
    tokensUsed: number;
    parts?: string[];
  };

  console.log(`   ✅ Content generated!`);
  console.log(`   Type: ${content.contentType}`);
  console.log(`   Model: ${content.model}`);
  console.log(`   Tokens: ${content.tokensUsed}`);
  console.log(`   Media: ${content.mediaUrl || '(none)'}`);
  if (content.parts) {
    console.log(`   Thread parts: ${content.parts.length}`);
  }

  // Step 2: Post to Farcaster
  const signerUuid = String(agent.signerUuid || '');
  const isDemoSigner = signerUuid.startsWith('demo-signer-');

  if (isDemoSigner) {
    console.log('\n📢 Step 2: Simulating Farcaster post (demo signer)...');
    console.log('   ⚠️  Agent has a demo signer - cannot post to real Farcaster');
    console.log('   📄 Simulated post output:\n');

    if (content.parts && content.parts.length > 1) {
      console.log('   === THREAD ===');
      content.parts.forEach((part: string, i: number) => {
        console.log(`   [${i + 1}/${content.parts!.length}] ${part}`);
        console.log('');
      });
    } else {
      console.log(`   === CAST ===`);
      console.log(`   ${content.text}`);
    }

    if (content.mediaUrl) {
      console.log(`   🖼️  Image: ${content.mediaUrl}`);
    }

    console.log('\n   ✅ Content ready for Farcaster! To post for real:');
    console.log('   1. Create a Farcaster account and get a real signer');
    console.log('   2. Update agent signerUuid in database');
    console.log('   3. Re-run this script');
  } else {
    console.log('\n📢 Step 2: Posting to Farcaster...');
    const postingQueue = new Queue('scheduled-posting', { connection: redis.duplicate() });
    const postingEvents = new QueueEvents('scheduled-posting', { connection: redis.duplicate() });

    const postJob = await postingQueue.add(
      'post-cast',
      {
        agentId: String(agent.id),
        signerUuid,
        text: content.text,
        mediaUrl: content.mediaUrl,
        contentType: content.contentType,
        parts: content.parts,
      },
      { priority: 1, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    console.log(`   Job ID: ${postJob.id}`);

    try {
      const result = await postJob.waitUntilFinished(postingEvents, 60_000) as {
        agentId: string;
        casts?: Array<{ hash: string; text: string }>;
        publishedAt: string;
      };
      console.log(`   ✅ Posted to Farcaster!`);
      if (result.casts && Array.isArray(result.casts)) {
        result.casts.forEach((cast: { hash: string; text: string }, i: number) => {
          console.log(`   Cast ${i + 1}: https://warpcast.com/~/conversations/${cast.hash}`);
        });
      } else {
        console.log(`   Result:`, JSON.stringify(result, null, 2));
      }
    } catch (err) {
      console.error(`   ❌ Posting failed:`, err instanceof Error ? err.message : err);
    }

    await postingQueue.close();
    await postingEvents.close();
  }

  await contentEvents.close();
  await contentQueue.close();
  await connection.quit();
  await redis.quit();
  console.log('\n🎉 Done!');
}

triggerPost().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
