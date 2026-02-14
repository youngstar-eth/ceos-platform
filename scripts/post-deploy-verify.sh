#!/bin/bash
set -euo pipefail

echo "=== ceos.run — Post-Deploy Verification ==="
echo ""

BASE_RPC="${BASE_RPC_URL:-https://mainnet.base.org}"

# Read addresses from .env
source .env 2>/dev/null || true

check_contract() {
  local name=$1
  local address=$2

  if [ -z "$address" ]; then
    echo "  SKIP $name — address not set"
    return
  fi

  # Check if contract has code
  CODE=$(cast code "$address" --rpc-url "$BASE_RPC" 2>/dev/null || echo "")
  if [ "$CODE" = "0x" ] || [ -z "$CODE" ]; then
    echo "  FAIL $name ($address) — no code deployed"
  else
    echo "  OK   $name ($address)"
  fi
}

echo "Contract Code Check:"
check_contract "AgentFactory" "${NEXT_PUBLIC_FACTORY_ADDRESS:-}"
check_contract "AgentRegistry" "${NEXT_PUBLIC_REGISTRY_ADDRESS:-}"
check_contract "RevenuePool" "${NEXT_PUBLIC_REVENUE_POOL_ADDRESS:-}"
check_contract "CreatorScore" "${NEXT_PUBLIC_CREATOR_SCORE_ADDRESS:-}"
check_contract "ERC8004TrustRegistry" "${NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS:-}"
check_contract "X402PaymentGate" "${NEXT_PUBLIC_X402_GATE_ADDRESS:-}"
echo ""

# Check USDC contract
echo "USDC Contract Check:"
USDC_SUPPLY=$(cast call 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 "totalSupply()(uint256)" --rpc-url "$BASE_RPC" 2>/dev/null || echo "FAILED")
if [ "$USDC_SUPPLY" = "FAILED" ]; then
  echo "  FAIL — Cannot read USDC totalSupply"
else
  echo "  OK   — USDC contract reachable"
fi
echo ""

# Health check
echo "API Health Check:"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${NEXT_PUBLIC_APP_URL:-https://ceos.run}/api/health" 2>/dev/null || echo "000")
if [ "$STATUS" = "200" ]; then
  echo "  OK   — Health endpoint returned 200"
else
  echo "  WARN — Health endpoint returned $STATUS"
fi
echo ""

echo "Verification complete!"
