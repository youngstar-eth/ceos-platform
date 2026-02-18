// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Script, console2 } from "forge-std/Script.sol";

// ── Core Contracts ──
import { AgentFactory } from "../src/AgentFactory.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { CreatorScore } from "../src/CreatorScore.sol";
import { CEOSScore } from "../src/CEOSScore.sol";
import { ERC8004TrustRegistry } from "../src/ERC8004TrustRegistry.sol";
import { X402PaymentGate } from "../src/X402PaymentGate.sol";

// ── v2 Financial Engine ──
import { RunToken } from "../src/RunToken.sol";
import { StakingRewards } from "../src/StakingRewards.sol";
import { FeeSplitter } from "../src/FeeSplitter.sol";

// ── Testnet Mocks (only deployed on Sepolia) ──
import { MockVirtualsFactory } from "../test/mocks/MockVirtualsFactory.sol";
import { MockSwapRouter } from "../test/mocks/MockSwapRouter.sol";

/// @title DeployV2 — ceos.run Full-Stack Deployment with Chain-Aware Dependency Injection
/// @notice Deploys all core + v2 financial contracts with automatic mock injection on testnet.
/// @dev Chain detection:
///        - Base Sepolia (84532): Deploys MockVirtualsFactory + MockSwapRouter as stand-ins.
///        - Base Mainnet (8453):  Uses real Virtuals Protocol + Uniswap V3 SwapRouter addresses.
///
///      Usage (Sepolia):
///        forge script script/DeployV2.s.sol \
///          --rpc-url $BASE_SEPOLIA_RPC_URL \
///          --broadcast --verify \
///          --etherscan-api-key $BASESCAN_API_KEY -vvvv
///
///      Usage (Mainnet):
///        VIRTUALS_FACTORY=0x... forge script script/DeployV2.s.sol \
///          --rpc-url $BASE_RPC_URL \
///          --broadcast --verify \
///          --etherscan-api-key $BASESCAN_API_KEY -vvvv
contract DeployV2 is Script {
    // ── Chain IDs ───────────────────────────────────────────
    uint256 constant CHAIN_BASE_MAINNET = 8453;
    uint256 constant CHAIN_BASE_SEPOLIA = 84_532;

    // ── Base Canonical Addresses ────────────────────────────
    address constant USDC_SEPOLIA = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address constant USDC_MAINNET = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant WETH = 0x4200000000000000000000000000000000000006;
    address constant UNISWAP_SWAP_ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481;

    // ── Mainnet Virtuals Protocol ───────────────────────────
    /// @dev Read from VIRTUALS_FACTORY env var on mainnet. Not needed on Sepolia (mock deployed).
    address constant VIRTUALS_FACTORY_MAINNET_DEFAULT = address(0);

    // ── Financial Constants ─────────────────────────────────
    uint256 constant INITIAL_RUN_PER_SECOND = 1e18; // 1 $RUN/sec (~86,400/day)
    uint24 constant DEFAULT_POOL_FEE = 3000; // Uniswap V3: 0.30%

    // ── Deployment Artifacts ────────────────────────────────
    ERC8004TrustRegistry public trustRegistry;
    AgentRegistry public agentRegistry;
    CreatorScore public creatorScore;
    CEOSScore public ceosScore;
    X402PaymentGate public paymentGate;
    AgentFactory public agentFactory;

    RunToken public runToken;
    StakingRewards public stakingRewards;
    FeeSplitter public feeSplitter;

    // ── Chain-Detected Addresses (resolved at runtime) ──────
    address public resolvedSwapRouter;
    address public resolvedVirtualsFactory;
    address public resolvedUsdc;
    bool public isTestnet;

    function run() external {
        // ── Load environment ────────────────────────────────
        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPk);
        address protocolFeeRecipient = vm.envOr("PROTOCOL_FEE_RECIPIENT", deployer);
        uint24 poolFee = uint24(vm.envOr("POOL_FEE", uint256(DEFAULT_POOL_FEE)));

        // ── Chain detection ─────────────────────────────────
        isTestnet = (block.chainid == CHAIN_BASE_SEPOLIA);
        bool isMainnet = (block.chainid == CHAIN_BASE_MAINNET);
        require(isTestnet || isMainnet, "DeployV2: Must run on Base Sepolia (84532) or Base Mainnet (8453)");
        require(deployer.balance >= 0.01 ether, "DeployV2: Deployer needs >= 0.01 ETH");

        // Resolve chain-specific addresses
        resolvedUsdc = isTestnet ? USDC_SEPOLIA : USDC_MAINNET;

        _logHeader(deployer, protocolFeeRecipient);

        vm.startBroadcast(deployerPk);

        // ════════════════════════════════════════════════════
        // PHASE 0: TESTNET MOCKS (Sepolia only)
        // ════════════════════════════════════════════════════

        if (isTestnet) {
            _deployTestnetMocks();
        } else {
            _resolveMainnetAddresses();
        }

        // ════════════════════════════════════════════════════
        // PHASE 1: CORE CONTRACTS
        // ════════════════════════════════════════════════════

        _deployCore(deployer);

        // ════════════════════════════════════════════════════
        // PHASE 2: v2 FINANCIAL ENGINE
        // ════════════════════════════════════════════════════

        _deployFinancial(deployer, protocolFeeRecipient, poolFee);

        // ════════════════════════════════════════════════════
        // PHASE 3: AGENT FACTORY
        // ════════════════════════════════════════════════════

        _deployFactory();

        // ════════════════════════════════════════════════════
        // PHASE 4: WIRING
        // ════════════════════════════════════════════════════

        _wireContracts(deployer);

        vm.stopBroadcast();

        // ════════════════════════════════════════════════════
        // PHASE 5: OUTPUT ARTIFACTS
        // ════════════════════════════════════════════════════

        _writeOutputs();
    }

    // ── Phase 0: Testnet Mock Deployment ────────────────────

    /// @notice Deploy mock contracts on Sepolia where real infra doesn't exist
    /// @dev MockVirtualsFactory simulates token creation.
    ///      MockSwapRouter simulates Uniswap V3 swaps (needed because there's no
    ///      WETH/$RUN liquidity pool on Sepolia). Deployed as a standalone contract,
    ///      NOT at the canonical address (vm.etch is only for tests).
    function _deployTestnetMocks() internal {
        console2.log("");
        console2.log("=== Phase 0: Testnet Mocks (Sepolia) ===");

        // Deploy MockVirtualsFactory
        MockVirtualsFactory mockVirtuals = new MockVirtualsFactory();
        resolvedVirtualsFactory = address(mockVirtuals);
        console2.log("  MockVirtualsFactory: ", resolvedVirtualsFactory);

        // Deploy MockSwapRouter (standalone, with 2x exchange rate)
        MockSwapRouter mockRouter = new MockSwapRouter();
        mockRouter.setExchangeRate(2);
        resolvedSwapRouter = address(mockRouter);
        console2.log("  MockSwapRouter:      ", resolvedSwapRouter);

        console2.log("  [i] Mocks deployed for testnet simulation");
    }

    // ── Phase 0 (Mainnet): Resolve Real Addresses ───────────

    /// @notice On mainnet, use real Uniswap + Virtuals addresses
    function _resolveMainnetAddresses() internal {
        console2.log("");
        console2.log("=== Phase 0: Mainnet Address Resolution ===");

        resolvedSwapRouter = UNISWAP_SWAP_ROUTER;
        console2.log("  SwapRouter (real):   ", resolvedSwapRouter);

        // Virtuals factory from env (required on mainnet)
        resolvedVirtualsFactory = vm.envAddress("VIRTUALS_FACTORY");
        require(resolvedVirtualsFactory != address(0), "DeployV2: VIRTUALS_FACTORY env var required on mainnet");
        console2.log("  VirtualsFactory:     ", resolvedVirtualsFactory);
    }

    // ── Phase 1: Core Contracts ─────────────────────────────

    function _deployCore(address deployer) internal {
        console2.log("");
        console2.log("=== Phase 1: Core Contracts ===");

        trustRegistry = new ERC8004TrustRegistry();
        console2.log("  ERC8004TrustRegistry:", address(trustRegistry));

        agentRegistry = new AgentRegistry(address(0));
        console2.log("  AgentRegistry:       ", address(agentRegistry));

        creatorScore = new CreatorScore(deployer);
        console2.log("  CreatorScore:        ", address(creatorScore));

        ceosScore = new CEOSScore(deployer);
        console2.log("  CEOSScore:           ", address(ceosScore));

        paymentGate = new X402PaymentGate(resolvedUsdc, deployer);
        console2.log("  X402PaymentGate:     ", address(paymentGate));
    }

    // ── Phase 2: v2 Financial Engine ────────────────────────

    function _deployFinancial(address deployer, address protocolFeeRecipient, uint24 poolFee) internal {
        console2.log("");
        console2.log("=== Phase 2: v2 Financial Engine ===");

        // 1. RunToken ("CEOS.RUN Governance", "RUN")
        runToken = new RunToken(deployer);
        console2.log("  RunToken:            ", address(runToken));

        // 2. StakingRewards (multi-pool yield farm with Patron Multiplier)
        stakingRewards = new StakingRewards(address(runToken), INITIAL_RUN_PER_SECOND);
        console2.log("  StakingRewards:      ", address(stakingRewards));

        // 3. FeeSplitter (40% buyback-burn, 40% agent treasury, 20% protocol)
        //    Uses resolvedSwapRouter: MockSwapRouter on Sepolia, real Uniswap on Mainnet
        feeSplitter = new FeeSplitter(
            resolvedSwapRouter,
            address(runToken),
            protocolFeeRecipient,
            poolFee
        );
        console2.log("  FeeSplitter:         ", address(feeSplitter));
    }

    // ── Phase 3: Agent Factory ──────────────────────────────

    function _deployFactory() internal {
        console2.log("");
        console2.log("=== Phase 3: AgentFactory (Virtuals Protocol) ===");

        agentFactory = new AgentFactory(
            resolvedVirtualsFactory,
            address(agentRegistry),
            address(trustRegistry),
            address(feeSplitter)
        );
        console2.log("  AgentFactory:        ", address(agentFactory));
    }

    // ── Phase 4: Wiring ─────────────────────────────────────

    function _wireContracts(address deployer) internal {
        console2.log("");
        console2.log("=== Phase 4: Wiring ===");

        // Core wiring
        agentRegistry.setFactory(address(agentFactory));
        console2.log("  AgentRegistry.setFactory -> AgentFactory");

        trustRegistry.setAuthorizedMinter(address(agentFactory), true);
        console2.log("  TrustRegistry.setAuthorizedMinter -> AgentFactory");

        paymentGate.setAuthorizedProcessor(deployer, true);
        console2.log("  X402PaymentGate.setAuthorizedProcessor -> Deployer");

        // Financial wiring
        runToken.grantRole(runToken.MINTER_ROLE(), address(stakingRewards));
        console2.log("  RunToken.grantRole(MINTER_ROLE) -> StakingRewards");

        // On Sepolia: grant MINTER_ROLE to MockSwapRouter so buyback simulation works
        if (isTestnet) {
            runToken.grantRole(runToken.MINTER_ROLE(), resolvedSwapRouter);
            console2.log("  RunToken.grantRole(MINTER_ROLE) -> MockSwapRouter [testnet]");
        }

        feeSplitter.setAuthorizedDistributor(deployer, true);
        console2.log("  FeeSplitter.setAuthorizedDistributor -> Deployer");

        feeSplitter.setAuthorizedDistributor(address(agentFactory), true);
        console2.log("  FeeSplitter.setAuthorizedDistributor -> AgentFactory");

        console2.log("");
        console2.log("  All contracts wired successfully!");
    }

    // ── Phase 5: Output Artifacts ───────────────────────────

    function _writeOutputs() internal {
        string memory networkName = isTestnet ? "base-sepolia" : "base-mainnet";
        uint256 chainId = isTestnet ? CHAIN_BASE_SEPOLIA : CHAIN_BASE_MAINNET;

        console2.log("");
        console2.log("=== Deployed Contract Addresses ===");
        console2.log("");

        console2.log("  --- Core ---");
        console2.log("  ERC8004TrustRegistry: ", address(trustRegistry));
        console2.log("  AgentRegistry:        ", address(agentRegistry));
        console2.log("  CreatorScore:         ", address(creatorScore));
        console2.log("  CEOSScore:            ", address(ceosScore));
        console2.log("  X402PaymentGate:      ", address(paymentGate));
        console2.log("  AgentFactory:         ", address(agentFactory));

        console2.log("");
        console2.log("  --- v2 Financial ---");
        console2.log("  RunToken:             ", address(runToken));
        console2.log("  StakingRewards:       ", address(stakingRewards));
        console2.log("  FeeSplitter:          ", address(feeSplitter));

        console2.log("");
        console2.log("  --- Infrastructure ---");
        console2.log("  SwapRouter:           ", resolvedSwapRouter);
        console2.log("  VirtualsFactory:      ", resolvedVirtualsFactory);
        console2.log("  USDC:                 ", resolvedUsdc);
        if (isTestnet) {
            console2.log("  [testnet] MockSwapRouter & MockVirtualsFactory deployed");
        }

        // ── .env output (copy-paste ready) ──────────────────
        console2.log("");
        console2.log("=== Copy to .env ===");
        console2.log("NEXT_PUBLIC_FACTORY_ADDRESS=", address(agentFactory));
        console2.log("NEXT_PUBLIC_REGISTRY_ADDRESS=", address(agentRegistry));
        console2.log("NEXT_PUBLIC_CREATOR_SCORE_ADDRESS=", address(creatorScore));
        console2.log("NEXT_PUBLIC_CEOS_SCORE_ADDRESS=", address(ceosScore));
        console2.log("NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS=", address(trustRegistry));
        console2.log("NEXT_PUBLIC_X402_GATE_ADDRESS=", address(paymentGate));
        console2.log("NEXT_PUBLIC_RUN_TOKEN_ADDRESS=", address(runToken));
        console2.log("NEXT_PUBLIC_STAKING_REWARDS_ADDRESS=", address(stakingRewards));
        console2.log("NEXT_PUBLIC_FEE_SPLITTER_ADDRESS=", address(feeSplitter));

        // ── JSON artifact for frontend auto-pickup ──────────
        string memory json = string.concat(
            '{\n',
            '  "network": "', networkName, '",\n',
            '  "chainId": ', vm.toString(chainId), ',\n',
            '  "deployedAt": ', vm.toString(block.timestamp), ',\n',
            _jsonEntry("agentFactory", address(agentFactory)),
            _jsonEntry("agentRegistry", address(agentRegistry)),
            _jsonEntry("trustRegistry", address(trustRegistry)),
            _jsonEntry("creatorScore", address(creatorScore)),
            _jsonEntry("ceosScore", address(ceosScore)),
            _jsonEntry("x402PaymentGate", address(paymentGate)),
            _jsonEntry("runToken", address(runToken)),
            _jsonEntry("stakingRewards", address(stakingRewards)),
            _jsonEntry("feeSplitter", address(feeSplitter)),
            _jsonEntry("swapRouter", resolvedSwapRouter),
            _jsonEntry("virtualsFactory", resolvedVirtualsFactory),
            // Last entry has no trailing comma
            '  "usdc": "', vm.toString(resolvedUsdc), '"\n',
            '}'
        );

        // Write to contracts/ directory for reference
        vm.writeFile("contracts/deployed_contracts.json", json);
        console2.log("");
        console2.log("  JSON -> contracts/deployed_contracts.json");

        // Write to frontend for auto-pickup by Next.js
        vm.writeFile("apps/web/lib/deployments.json", json);
        console2.log("  JSON -> apps/web/lib/deployments.json");
    }

    // ── Helpers ──────────────────────────────────────────────

    function _logHeader(address deployer, address protocolFeeRecipient) internal view {
        string memory network = isTestnet ? "Base Sepolia (84532)" : "Base Mainnet (8453)";
        string memory mode = isTestnet ? "TESTNET (mocks will be deployed)" : "MAINNET (real contracts)";

        console2.log("");
        console2.log("=============================================");
        console2.log("   ceos.run v2 Full-Stack Deployment");
        console2.log("=============================================");
        console2.log("  Network:              ", network);
        console2.log("  Mode:                 ", mode);
        console2.log("  Deployer:             ", deployer);
        console2.log("  Balance:              ", deployer.balance);
        console2.log("  Protocol Fee Recipient:", protocolFeeRecipient);
        console2.log("  WETH:                 ", WETH);
        console2.log("=============================================");
    }

    /// @dev Formats a JSON key-value pair for an address (with trailing comma)
    function _jsonEntry(string memory key, address value) internal pure returns (string memory) {
        return string.concat('  "', key, '": "', vm.toString(value), '",\n');
    }
}
