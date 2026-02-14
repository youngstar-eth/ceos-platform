#!/bin/bash
set -euo pipefail

echo "=== ceos.run — Base Mainnet Deployment ==="
echo ""

# Pre-flight checks
if [ -z "${DEPLOYER_PRIVATE_KEY:-}" ]; then
  echo "DEPLOYER_PRIVATE_KEY not set"
  exit 1
fi

if [ -z "${TREASURY_ADDRESS:-}" ]; then
  echo "TREASURY_ADDRESS not set"
  exit 1
fi

BASE_RPC="${BASE_RPC_URL:-https://mainnet.base.org}"
ETHERSCAN_KEY="${BASESCAN_API_KEY:-}"

echo "Configuration:"
echo "   RPC: $BASE_RPC"
echo "   Chain: Base Mainnet (8453)"
echo "   USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
echo "   Treasury: $TREASURY_ADDRESS"
echo ""

# Run tests first
echo "Running contract tests..."
cd contracts
forge test -vvv
echo ""
echo "Tests passed!"
echo ""

# Dry run first
echo "Dry run (simulation)..."
forge script script/DeployMainnet.s.sol \
  --rpc-url "$BASE_RPC" \
  --chain-id 8453 \
  -vvv

echo ""
read -p "Dry run successful. Proceed with broadcast? (y/N): " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Deployment cancelled"
  exit 0
fi

# Broadcast
echo ""
echo "Broadcasting transactions..."
forge script script/DeployMainnet.s.sol \
  --rpc-url "$BASE_RPC" \
  --chain-id 8453 \
  --broadcast \
  ${ETHERSCAN_KEY:+--verify --etherscan-api-key "$ETHERSCAN_KEY"} \
  --slow \
  -vvv

echo ""
echo "Deployment complete!"
echo "Update .env with the addresses printed above"
echo "Verify contracts on Basescan: https://basescan.org"
