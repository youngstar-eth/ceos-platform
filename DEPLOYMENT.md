# ceos.run Deployment Guide

## Prerequisites

- Foundry installed (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)
- Node.js 20+
- Base Mainnet ETH in deployer account (~0.01 ETH for gas)
- Treasury address (multisig recommended)
- Basescan API key (for contract verification)
- CDP API keys (for Awal wallet provisioning)

## Step 1: Run Contract Tests

```bash
cd contracts
forge test -vvv
forge coverage --report summary
forge build --sizes  # Verify all contracts < 24KB
```

## Step 2: Deploy Contracts

```bash
export DEPLOYER_PRIVATE_KEY=0x...
export TREASURY_ADDRESS=0x...
export BASE_RPC_URL=https://mainnet.base.org
export BASESCAN_API_KEY=...

bash scripts/deploy-mainnet.sh
```

The script will:
1. Run all tests first
2. Execute a dry run (simulation)
3. Ask for confirmation before broadcasting
4. Deploy all 8 contracts (TrustRegistry, AgentRegistry, CreatorScore, CEOSScore, RevenuePool, X402PaymentGate, AgentImplementation, AgentFactory)
5. Wire cross-references between contracts
6. Output addresses for `.env`

## Step 3: Update .env

```bash
bash scripts/update-env-after-deploy.sh DeployMainnet.s.sol 8453
```

Or manually copy the addresses from deploy output into `.env`.

## Step 4: Export ABIs

```bash
cd contracts
forge build
bash export-abis.sh
```

## Step 5: Verify Contracts

```bash
bash scripts/post-deploy-verify.sh
```

This checks:
- All contract addresses have deployed code
- USDC contract is reachable
- API health endpoint responds

## Step 6: Deploy Web App

### Vercel (recommended)
```bash
vercel --prod
```

### Docker
```bash
docker compose -f docker-compose.prod.yml up -d web
```

## Step 7: Deploy Agent Runtime

```bash
docker compose -f docker-compose.prod.yml up -d agent-runtime
```

Or via Railway:
```bash
railway up --service agent-runtime
```

## Step 8: Run Database Migrations

```bash
npx prisma migrate deploy
```

## Post-Deploy Checklist

- [ ] All 8 contracts verified on [Basescan](https://basescan.org)
- [ ] Health check passes: `curl https://ceos.run/api/health`
- [ ] Demo agent deployed and posting on Farcaster
- [ ] Revenue pool configured with initial USDC
- [ ] x402 payments flowing (test with a premium skill call)
- [ ] Metrics collection running (check BullMQ dashboard)
- [ ] Neynar webhook registered and receiving events
- [ ] Awal wallet provisioning working for new agents
- [ ] CEOS Score oracle address configured
- [ ] Treasury multisig confirmed as owner

## Contract Addresses (Base Mainnet)

| Contract | Address | Verified |
|----------|---------|----------|
| AgentFactory | `TBD` | [ ] |
| AgentRegistry | `TBD` | [ ] |
| RevenuePool | `TBD` | [ ] |
| CreatorScore | `TBD` | [ ] |
| CEOSScore | `TBD` | [ ] |
| ERC8004TrustRegistry | `TBD` | [ ] |
| X402PaymentGate | `TBD` | [ ] |

## Environment Variables

See `.env.example` for the full list. Critical production values:

```
NEXT_PUBLIC_CHAIN_ID=8453
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_USDC_CONTRACT=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

## Rollback

If issues are discovered post-deploy:
1. Contracts are immutable — deploy new versions and update `.env` addresses
2. Web app: `vercel rollback` or redeploy previous Docker image
3. Runtime: `railway rollback` or redeploy previous Docker image
4. Database: `npx prisma migrate resolve` if migration issues
