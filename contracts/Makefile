-include .env

.PHONY: build test deploy-sepolia deploy-mainnet verify coverage

build:
	forge build

test:
	forge test -vvv --gas-report

coverage:
	forge coverage --report lcov

# Base Sepolia testnet deploy
deploy-sepolia:
	forge script script/Deploy.s.sol \
		--rpc-url $(BASE_SEPOLIA_RPC_URL) \
		--broadcast \
		--verify \
		--etherscan-api-key $(BASESCAN_API_KEY) \
		-vvv

# Base mainnet deploy (PRODUCTION — double check!)
deploy-mainnet:
	@echo "DEPLOYING TO BASE MAINNET — ARE YOU SURE?"
	@read -p "Type 'yes' to continue: " confirm && [ "$$confirm" = "yes" ] || exit 1
	forge script script/DeployMainnet.s.sol \
		--rpc-url $(BASE_RPC_URL) \
		--chain-id 8453 \
		--broadcast \
		--verify \
		--etherscan-api-key $(BASESCAN_API_KEY) \
		--slow \
		-vvv

# Contract sizes (24KB limit check)
sizes:
	forge build --sizes

# Export ABIs to packages/contract-abis
export-abis:
	bash export-abis.sh

verify:
	forge verify-contract $(ADDRESS) $(CONTRACT) \
		--chain base \
		--etherscan-api-key $(BASESCAN_API_KEY)
