#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
ERRORS=0

check() {
  if eval "$2" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} $1"
  else
    echo -e "${RED}✗${NC} $1"
    ERRORS=$((ERRORS + 1))
  fi
}

warn_check() {
  if eval "$2" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} $1"
  else
    echo -e "${YELLOW}!${NC} $1 (warning)"
  fi
}

echo "ceos.run Pre-Launch Checklist"
echo "================================="
echo ""

echo "--- Build ---"
check "TypeScript compiles" "npm run typecheck"
check "Linter passes" "npm run lint"
check "Tests pass" "npm run test"
check "Next.js builds" "npm run build"

echo ""
echo "--- Contracts ---"
check "Forge builds" "cd contracts && forge build"
check "Contract tests pass" "cd contracts && forge test"

echo ""
echo "--- Environment ---"
check "DATABASE_URL set" "[ -n \"\${DATABASE_URL:-}\" ]"
check "REDIS_URL set" "[ -n \"\${REDIS_URL:-}\" ]"
check "NEYNAR_API_KEY set" "[ -n \"\${NEYNAR_API_KEY:-}\" ]"
check "OPENROUTER_API_KEY set" "[ -n \"\${OPENROUTER_API_KEY:-}\" ]"
check "DEPLOYER_PRIVATE_KEY set" "[ -n \"\${DEPLOYER_PRIVATE_KEY:-}\" ]"
check "NEXT_PUBLIC_FACTORY_ADDRESS set" "[ -n \"\${NEXT_PUBLIC_FACTORY_ADDRESS:-}\" ]"

echo ""
echo "--- Database ---"
check "Prisma schema valid" "npx prisma validate"
check "Migrations up to date" "npx prisma migrate status"

echo ""
echo "--- Security ---"
warn_check "No console.log in API routes" "! grep -rn 'console\.log' apps/web/app/api/ apps/agent-runtime/src/ --include='*.ts' | grep -v 'node_modules' | grep -v '.test.' | grep -v 'pre-launch'"
warn_check "No TODO/FIXME in production code" "! grep -rn 'TODO\|FIXME\|HACK\|XXX' apps/ --include='*.ts' --include='*.tsx' | grep -v 'node_modules' | grep -v '.test.' | grep -v 'pre-launch' | head -5"
warn_check "No hardcoded secrets" "! grep -rn 'sk-or-\|0x[a-fA-F0-9]\{64\}' apps/ --include='*.ts' --include='*.tsx' | grep -v 'node_modules' | grep -v '.env' | grep -v '.example'"

echo ""
if [ "$ERRORS" -eq 0 ]; then
  echo -e "${GREEN}ALL CHECKS PASSED — Ready to launch!${NC}"
else
  echo -e "${RED}${ERRORS} check(s) failed — fix before deploying${NC}"
  exit 1
fi
