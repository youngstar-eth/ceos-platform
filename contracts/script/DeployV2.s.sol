// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Script, console2 } from "forge-std/Script.sol";

// ── v1 Core Contracts ──
import { AgentFactory } from "../src/AgentFactory.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { RevenuePool } from "../src/RevenuePool.sol";
import { CreatorScore } from "../src/CreatorScore.sol";
import { CEOSScore } from "../src/CEOSScore.sol";
import { ERC8004TrustRegistry } from "../src/ERC8004TrustRegistry.sol";
import { X402PaymentGate } from "../src/X402PaymentGate.sol";

// ── v2 Financial Engine ──
import { RunToken } from "../src/RunToken.sol";
import { StakingRewards } from "../src/StakingRewards.sol";
import { FeeSplitter } from "../src/FeeSplitter.sol";
import { ScoutFund } from "../src/ScoutFund.sol";
import { AgentTreasury } from "../src/AgentTreasury.sol";

/// @title DeployV2 — ceos.run Base Sepolia Full-Stack Deployment
/// @notice Deploys all v1 core + v2 financial contracts and wires them together.
/// @dev Usage:
///   forge script script/DeployV2.s.sol \
///     --rpc-url $BASE_SEPOLIA_RPC_URL \
///     --broadcast \
///     --verify \
///     --etherscan-api-key $BASESCAN_API_KEY \
///     -vvvv
contract DeployV2 is Script {
    // ── Base Sepolia Constants ─────────────────────────────
    // Official Circle USDC on Base Sepolia (from developers.circle.com)
    address constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    // WETH9 — OP Stack pre-deploy (same address on all OP chains)
    address constant WETH = 0x4200000000000000000000000000000000000006;

    // Uniswap V3 SwapRouter02 on Base (same on mainnet & Sepolia)
    // Hardcoded in AgentTreasury + ScoutFund as constants
    address constant SWAP_ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481;

    // $RUN initial emission rate: 1 RUN per second (~86,400/day)
    uint256 constant INITIAL_RUN_PER_SECOND = 1e18;

    // ── Deployment Artifacts ──────────────────────────────
    // v1
    ERC8004TrustRegistry public trustRegistry;
    AgentRegistry public agentRegistry;
    CreatorScore public creatorScore;
    CEOSScore public ceosScore;
    RevenuePool public revenuePool;
    X402PaymentGate public paymentGate;
    AgentFactory public agentFactory;

    // v2
    RunToken public runToken;
    StakingRewards public stakingRewards;
    FeeSplitter public feeSplitter;
    ScoutFund public scoutFund;
    AgentTreasury public agentTreasuryImpl;

    function run() external {
        // ── Load environment ──────────────────────────────
        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPk);

        // Treasury address defaults to deployer on testnet
        address treasury = vm.envOr("TREASURY_ADDRESS", deployer);

        // ── Pre-flight checks ─────────────────────────────
        require(block.chainid == 84_532, "DeployV2: Must run on Base Sepolia (84532)");
        require(deployer.balance >= 0.01 ether, "DeployV2: Deployer needs >= 0.01 ETH");

        _logHeader(deployer, treasury);

        vm.startBroadcast(deployerPk);

        // ════════════════════════════════════════════════════
        // PHASE 1: v1 CORE CONTRACTS
        // ════════════════════════════════════════════════════

        _deployV1Core(deployer, treasury);

        // ════════════════════════════════════════════════════
        // PHASE 2: v2 FINANCIAL ENGINE
        // ════════════════════════════════════════════════════

        _deployV2Financial(deployer, treasury);

        // ════════════════════════════════════════════════════
        // PHASE 3: AGENT FACTORY (uses v2 AgentTreasury as clone impl)
        // ════════════════════════════════════════════════════

        _deployFactory(treasury);

        // ════════════════════════════════════════════════════
        // PHASE 4: WIRING — "THE HANDSHAKE"
        // ════════════════════════════════════════════════════

        _wireContracts(deployer);

        vm.stopBroadcast();

        // ════════════════════════════════════════════════════
        // PHASE 5: OUTPUT
        // ════════════════════════════════════════════════════

        _writeOutputs();
    }

    // ── Phase 1: v1 Core ──────────────────────────────────

    function _deployV1Core(address deployer, address) internal {
        console2.log("");
        console2.log("=== Phase 1: v1 Core Contracts ===");

        // 1. ERC-8004 TrustRegistry
        trustRegistry = new ERC8004TrustRegistry();
        console2.log("  ERC8004TrustRegistry:", address(trustRegistry));

        // 2. AgentRegistry (factory set in Phase 4)
        agentRegistry = new AgentRegistry(address(0));
        console2.log("  AgentRegistry:       ", address(agentRegistry));

        // 3. CreatorScore (deployer as oracle)
        creatorScore = new CreatorScore(deployer);
        console2.log("  CreatorScore:        ", address(creatorScore));

        // 4. CEOSScore (deployer as oracle)
        ceosScore = new CEOSScore(deployer);
        console2.log("  CEOSScore:           ", address(ceosScore));

        // 5. RevenuePool
        revenuePool = new RevenuePool(USDC, deployer);
        console2.log("  RevenuePool:         ", address(revenuePool));

        // 6. X402PaymentGate
        paymentGate = new X402PaymentGate(USDC, address(revenuePool));
        console2.log("  X402PaymentGate:     ", address(paymentGate));
    }

    // ── Phase 2: v2 Financial Engine ──────────────────────

    function _deployV2Financial(address deployer, address protocolTreasury) internal {
        console2.log("");
        console2.log("=== Phase 2: v2 Financial Engine ===");

        // 1. RunToken — deployer gets DEFAULT_ADMIN_ROLE
        runToken = new RunToken(deployer);
        console2.log("  RunToken:            ", address(runToken));

        // 2. StakingRewards — needs RunToken
        stakingRewards = new StakingRewards(address(runToken), INITIAL_RUN_PER_SECOND);
        console2.log("  StakingRewards:      ", address(stakingRewards));

        // 3. AgentTreasury implementation — deployed as EIP-1167 clone target
        //    Not initialized here (clones call initialize() individually)
        agentTreasuryImpl = new AgentTreasury();
        console2.log("  AgentTreasury(impl): ", address(agentTreasuryImpl));

        // 4. Circular dependency: FeeSplitter needs ScoutFund, ScoutFund needs FeeSplitter.
        //    Both constructors reject address(0). Solution:
        //    - Deploy FeeSplitter with deployer as temporary scoutFund placeholder
        //    - Deploy ScoutFund with real FeeSplitter address
        //    - Update FeeSplitter.setScoutFund() to point to real ScoutFund

        // 5. FeeSplitter — deployer as temporary scoutFund (updated in Phase 4)
        feeSplitter = new FeeSplitter(protocolTreasury, deployer, USDC);
        console2.log("  FeeSplitter:         ", address(feeSplitter));

        // 6. ScoutFund — gets real FeeSplitter address
        scoutFund = new ScoutFund(address(feeSplitter), USDC);
        console2.log("  ScoutFund:           ", address(scoutFund));
    }

    // ── Phase 3: Factory ──────────────────────────────────

    function _deployFactory(address treasury) internal {
        console2.log("");
        console2.log("=== Phase 3: AgentFactory ===");

        agentFactory = new AgentFactory(
            address(agentTreasuryImpl),
            address(agentRegistry),
            address(trustRegistry),
            address(revenuePool),
            treasury
        );
        console2.log("  AgentFactory:        ", address(agentFactory));
    }

    // ── Phase 4: Wiring ───────────────────────────────────

    function _wireContracts(address deployer) internal {
        console2.log("");
        console2.log("=== Phase 4: Wiring (The Handshake) ===");

        // v1 wiring
        agentRegistry.setFactory(address(agentFactory));
        console2.log("  AgentRegistry.setFactory -> AgentFactory");

        trustRegistry.setAuthorizedMinter(address(agentFactory), true);
        console2.log("  TrustRegistry.setAuthorizedMinter -> AgentFactory");

        paymentGate.setAuthorizedProcessor(deployer, true);
        console2.log("  X402PaymentGate.setAuthorizedProcessor -> Deployer");

        // v2 wiring — THE CRITICAL HANDSHAKE

        // Complete the circular dependency: update FeeSplitter's scoutFund from deployer → real ScoutFund
        feeSplitter.setScoutFund(address(scoutFund));
        console2.log("  FeeSplitter.setScoutFund -> ScoutFund");

        // Grant MINTER_ROLE on RunToken to StakingRewards
        runToken.grantRole(runToken.MINTER_ROLE(), address(stakingRewards));
        console2.log("  RunToken.grantRole(MINTER_ROLE) -> StakingRewards");

        // Authorize deployer as fee distributor (backend worker will use deployer key)
        feeSplitter.setAuthorizedDistributor(deployer, true);
        console2.log("  FeeSplitter.setAuthorizedDistributor -> Deployer");

        // Authorize deployer as scout worker (backend worker will use deployer key)
        scoutFund.setScoutWorker(deployer, true);
        console2.log("  ScoutFund.setScoutWorker -> Deployer");

        console2.log("");
        console2.log("  All contracts wired successfully!");
    }

    // ── Phase 5: Output ───────────────────────────────────

    function _writeOutputs() internal {
        console2.log("");
        console2.log("=== Deployed Contract Addresses ===");
        console2.log("");

        // v1 addresses
        console2.log("  --- v1 Core ---");
        console2.log("  ERC8004TrustRegistry: ", address(trustRegistry));
        console2.log("  AgentRegistry:        ", address(agentRegistry));
        console2.log("  CreatorScore:         ", address(creatorScore));
        console2.log("  CEOSScore:            ", address(ceosScore));
        console2.log("  RevenuePool:          ", address(revenuePool));
        console2.log("  X402PaymentGate:      ", address(paymentGate));
        console2.log("  AgentFactory:         ", address(agentFactory));

        // v2 addresses
        console2.log("");
        console2.log("  --- v2 Financial ---");
        console2.log("  RunToken:             ", address(runToken));
        console2.log("  StakingRewards:       ", address(stakingRewards));
        console2.log("  FeeSplitter:          ", address(feeSplitter));
        console2.log("  ScoutFund:            ", address(scoutFund));
        console2.log("  AgentTreasury(impl):  ", address(agentTreasuryImpl));

        // .env output
        console2.log("");
        console2.log("=== Copy to .env ===");
        console2.log("NEXT_PUBLIC_FACTORY_ADDRESS=", address(agentFactory));
        console2.log("NEXT_PUBLIC_REGISTRY_ADDRESS=", address(agentRegistry));
        console2.log("NEXT_PUBLIC_CREATOR_SCORE_ADDRESS=", address(creatorScore));
        console2.log("NEXT_PUBLIC_CEOS_SCORE_ADDRESS=", address(ceosScore));
        console2.log("NEXT_PUBLIC_REVENUE_POOL_ADDRESS=", address(revenuePool));
        console2.log("NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS=", address(trustRegistry));
        console2.log("NEXT_PUBLIC_X402_GATE_ADDRESS=", address(paymentGate));
        console2.log("NEXT_PUBLIC_RUN_TOKEN_ADDRESS=", address(runToken));
        console2.log("NEXT_PUBLIC_STAKING_REWARDS_ADDRESS=", address(stakingRewards));
        console2.log("NEXT_PUBLIC_FEE_SPLITTER_ADDRESS=", address(feeSplitter));
        console2.log("NEXT_PUBLIC_SCOUT_FUND_ADDRESS=", address(scoutFund));
        console2.log("NEXT_PUBLIC_AGENT_TREASURY_IMPL_ADDRESS=", address(agentTreasuryImpl));

        // Write JSON to file for frontend integration
        string memory json = string.concat(
            '{\n',
            '  "network": "base-sepolia",\n',
            '  "chainId": 84532,\n',
            _jsonEntry("trustRegistry", address(trustRegistry)),
            _jsonEntry("agentRegistry", address(agentRegistry)),
            _jsonEntry("creatorScore", address(creatorScore)),
            _jsonEntry("ceosScore", address(ceosScore)),
            _jsonEntry("revenuePool", address(revenuePool)),
            _jsonEntry("x402PaymentGate", address(paymentGate)),
            _jsonEntry("agentFactory", address(agentFactory)),
            _jsonEntry("runToken", address(runToken)),
            _jsonEntry("stakingRewards", address(stakingRewards)),
            _jsonEntry("feeSplitter", address(feeSplitter)),
            _jsonEntry("scoutFund", address(scoutFund)),
            _jsonEntry("agentTreasuryImpl", address(agentTreasuryImpl)),
            '  "usdc": "', vm.toString(USDC), '",\n',
            '  "weth": "', vm.toString(WETH), '",\n',
            '  "swapRouter": "', vm.toString(SWAP_ROUTER), '"\n',
            '}'
        );

        vm.writeFile("deployed_contracts.json", json);
        console2.log("");
        console2.log("JSON written to deployed_contracts.json");
    }

    // ── Helpers ────────────────────────────────────────────

    function _logHeader(address deployer, address treasury) internal view {
        console2.log("");
        console2.log("=============================================");
        console2.log("   ceos.run v2 Full-Stack Deployment");
        console2.log("   Network: Base Sepolia (84532)");
        console2.log("=============================================");
        console2.log("  Deployer:  ", deployer);
        console2.log("  Balance:   ", deployer.balance);
        console2.log("  Treasury:  ", treasury);
        console2.log("  USDC:      ", USDC);
        console2.log("  WETH:      ", WETH);
        console2.log("  SwapRouter:", SWAP_ROUTER);
        console2.log("=============================================");
    }

    /// @dev Formats a JSON key-value pair for an address
    function _jsonEntry(string memory key, address value) internal pure returns (string memory) {
        return string.concat('  "', key, '": "', vm.toString(value), '",\n');
    }
}
