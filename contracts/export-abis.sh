#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="../packages/contract-abis/src"
mkdir -p "$OUT_DIR"

CONTRACTS=("AgentFactory" "AgentRegistry" "RevenuePool" "CreatorScore" "ERC8004TrustRegistry" "X402PaymentGate" "CEOSScore")

for name in "${CONTRACTS[@]}"; do
  ABI_PATH="out/${name}.sol/${name}.json"
  if [ ! -f "$ABI_PATH" ]; then
    echo "${ABI_PATH} not found — run 'forge build' first"
    exit 1
  fi

  # Extract just the ABI array
  jq '.abi' "$ABI_PATH" > "${OUT_DIR}/${name}.json"
  echo "Exported ${name}.json"
done

# Generate TypeScript barrel file
cat > "${OUT_DIR}/index.ts" << 'EOF'
import AgentFactoryABI from './AgentFactory.json';
import AgentRegistryABI from './AgentRegistry.json';
import RevenuePoolABI from './RevenuePool.json';
import CreatorScoreABI from './CreatorScore.json';
import ERC8004TrustRegistryABI from './ERC8004TrustRegistry.json';
import X402PaymentGateABI from './X402PaymentGate.json';
import CEOSScoreABI from './CEOSScore.json';

export {
  AgentFactoryABI,
  AgentRegistryABI,
  RevenuePoolABI,
  CreatorScoreABI,
  ERC8004TrustRegistryABI,
  X402PaymentGateABI,
  CEOSScoreABI,
};

export const CONTRACT_ABIS = {
  AgentFactory: AgentFactoryABI,
  AgentRegistry: AgentRegistryABI,
  RevenuePool: RevenuePoolABI,
  CreatorScore: CreatorScoreABI,
  ERC8004TrustRegistry: ERC8004TrustRegistryABI,
  X402PaymentGate: X402PaymentGateABI,
  CEOSScore: CEOSScoreABI,
} as const;
EOF

echo "TypeScript barrel generated at ${OUT_DIR}/index.ts"
