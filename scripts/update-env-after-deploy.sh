#!/bin/bash
set -euo pipefail

echo "=== ceos.run — Parse Deploy Output ==="
echo ""

# Look for broadcast file
BROADCAST_DIR="contracts/broadcast"
SCRIPT_NAME="${1:-DeployMainnet.s.sol}"
CHAIN_ID="${2:-8453}"

BROADCAST_PATH="$BROADCAST_DIR/$SCRIPT_NAME/$CHAIN_ID"

if [ ! -d "$BROADCAST_PATH" ]; then
  echo "No broadcast directory found at: $BROADCAST_PATH"
  echo "Usage: $0 [ScriptName.s.sol] [chainId]"
  echo "  Example: $0 DeployMainnet.s.sol 8453"
  exit 1
fi

LATEST=$(ls -t "$BROADCAST_PATH"/run-*.json 2>/dev/null | head -1)

if [ -z "$LATEST" ]; then
  echo "No broadcast file found in $BROADCAST_PATH"
  exit 1
fi

echo "Parsing addresses from: $LATEST"
echo ""

# Extract contract addresses from broadcast JSON using jq
if ! command -v jq &> /dev/null; then
  echo "jq is not installed. Install with: brew install jq"
  echo ""
  echo "Manual fallback — look for addresses in:"
  echo "  $LATEST"
  exit 1
fi

echo "Add these to your .env:"
echo "---"

# Parse deployed contracts
jq -r '.transactions[] | select(.transactionType == "CREATE") | "\(.contractName) = \(.contractAddress)"' "$LATEST" 2>/dev/null | while read -r line; do
  CONTRACT_NAME=$(echo "$line" | cut -d'=' -f1 | xargs)
  ADDRESS=$(echo "$line" | cut -d'=' -f2 | xargs)

  case "$CONTRACT_NAME" in
    "AgentFactory")
      echo "NEXT_PUBLIC_FACTORY_ADDRESS=$ADDRESS"
      ;;
    "AgentRegistry")
      echo "NEXT_PUBLIC_REGISTRY_ADDRESS=$ADDRESS"
      ;;
    "RevenuePool")
      echo "NEXT_PUBLIC_REVENUE_POOL_ADDRESS=$ADDRESS"
      ;;
    "CreatorScore")
      echo "NEXT_PUBLIC_CREATOR_SCORE_ADDRESS=$ADDRESS"
      ;;
    "ERC8004TrustRegistry")
      echo "NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS=$ADDRESS"
      ;;
    "X402PaymentGate")
      echo "NEXT_PUBLIC_X402_GATE_ADDRESS=$ADDRESS"
      ;;
    "CEOSScore")
      echo "# CEOSScore=$ADDRESS"
      ;;
    *)
      echo "# $CONTRACT_NAME=$ADDRESS"
      ;;
  esac
done

echo "---"
echo ""
echo "Copy the above values to your .env file"
