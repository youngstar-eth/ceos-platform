#!/usr/bin/env bash
# deploy-v2.sh — Deploy ceos.run v2 to Base Sepolia
#
# Prerequisites:
#   1. Set env vars: DEPLOYER_PRIVATE_KEY, BASE_SEPOLIA_RPC_URL, BASESCAN_API_KEY
#   2. Ensure deployer has >= 0.05 ETH on Base Sepolia
#   3. Get testnet ETH from https://www.coinbase.com/faucets/base-ethereum-goerli-faucet
#
# Usage:
#   chmod +x contracts/script/deploy-v2.sh
#   ./contracts/script/deploy-v2.sh
#
# Optional flags:
#   --dry-run    Simulate without broadcasting
#   --no-verify  Skip BaseScan verification

set -euo pipefail

# ── Color codes ──
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${CYAN}"
echo "  ================================================"
echo "    ceos.run v2 Full-Stack Deployment"
echo "    Target: Base Sepolia (Chain ID 84532)"
echo "  ================================================"
echo -e "${NC}"

# ── Parse flags ──
DRY_RUN=false
SKIP_VERIFY=false

for arg in "$@"; do
  case $arg in
    --dry-run)    DRY_RUN=true ;;
    --no-verify)  SKIP_VERIFY=true ;;
    *)            echo -e "${RED}Unknown flag: $arg${NC}"; exit 1 ;;
  esac
done

# ── Validate environment ──
missing_vars=()
[[ -z "${DEPLOYER_PRIVATE_KEY:-}" ]] && missing_vars+=("DEPLOYER_PRIVATE_KEY")
[[ -z "${BASE_SEPOLIA_RPC_URL:-}" ]] && missing_vars+=("BASE_SEPOLIA_RPC_URL")

if [[ ${#missing_vars[@]} -gt 0 ]]; then
  echo -e "${RED}Missing required environment variables:${NC}"
  for var in "${missing_vars[@]}"; do
    echo -e "  ${YELLOW}$var${NC}"
  done
  echo ""
  echo "Set them in your .env file or export them:"
  echo "  export DEPLOYER_PRIVATE_KEY=0x..."
  echo "  export BASE_SEPOLIA_RPC_URL=https://sepolia.base.org"
  echo "  export BASESCAN_API_KEY=..."
  exit 1
fi

if [[ -z "${BASESCAN_API_KEY:-}" ]]; then
  echo -e "${YELLOW}Warning: BASESCAN_API_KEY not set. Contract verification will be skipped.${NC}"
  SKIP_VERIFY=true
fi

# ── TREASURY_ADDRESS defaults to deployer ──
if [[ -z "${TREASURY_ADDRESS:-}" ]]; then
  echo -e "${YELLOW}TREASURY_ADDRESS not set — will use deployer address on testnet${NC}"
fi

# ── Build forge command ──
FORGE_CMD="forge script contracts/script/DeployV2.s.sol"
FORGE_CMD+=" --rpc-url $BASE_SEPOLIA_RPC_URL"
FORGE_CMD+=" -vvvv"

if [[ "$DRY_RUN" == true ]]; then
  echo -e "${YELLOW}DRY RUN MODE — simulating only, no broadcast${NC}"
else
  FORGE_CMD+=" --broadcast"
fi

if [[ "$SKIP_VERIFY" == false ]]; then
  FORGE_CMD+=" --verify"
  FORGE_CMD+=" --etherscan-api-key $BASESCAN_API_KEY"
fi

# ── Execute ──
echo -e "${CYAN}Running:${NC}"
echo "  $FORGE_CMD"
echo ""

eval "$FORGE_CMD"

# ── Post-deploy ──
if [[ -f "deployed_contracts.json" ]]; then
  echo ""
  echo -e "${GREEN}================================================${NC}"
  echo -e "${GREEN}  Deployment complete!${NC}"
  echo -e "${GREEN}================================================${NC}"
  echo ""
  echo -e "${CYAN}Contract addresses saved to: deployed_contracts.json${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. Copy addresses from deployed_contracts.json to your .env file"
  echo "  2. Update apps/web/.env.local with NEXT_PUBLIC_* addresses"
  echo "  3. Update apps/agent-runtime/.env with contract addresses"
  echo "  4. Verify contracts on BaseScan if --no-verify was used"
  echo ""

  # Pretty-print the JSON
  if command -v jq &> /dev/null; then
    echo -e "${CYAN}Deployed contracts:${NC}"
    jq '.' deployed_contracts.json
  else
    cat deployed_contracts.json
  fi
else
  echo ""
  echo -e "${YELLOW}Note: deployed_contracts.json was not generated (dry run or error)${NC}"
fi
