/**
 * Update CryptoSage agent with real Neynar signer UUID and FID
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const agentId = 'cmliad6pj0000nzk3xsm458jw';
  const realSignerUuid = 'a7659a40-68fa-489d-8a11-b2e380e426b4';
  const realFid = 19719;

  console.log(`Updating agent ${agentId}...`);

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
  });

  if (!agent) {
    console.error('Agent not found!');
    process.exit(1);
  }

  console.log(`Current: name=${agent.name}, signerUuid=${agent.signerUuid}, fid=${agent.fid}`);

  const updated = await prisma.agent.update({
    where: { id: agentId },
    data: {
      signerUuid: realSignerUuid,
      fid: realFid,
    },
  });

  console.log(`Updated: signerUuid=${updated.signerUuid}, fid=${updated.fid}`);
  console.log('✅ Agent updated successfully!');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
