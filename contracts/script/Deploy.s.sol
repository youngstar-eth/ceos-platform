// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { AgentFactory } from "../src/AgentFactory.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { RunToken } from "../src/RunToken.sol";
import { FeeSplitter } from "../src/FeeSplitter.sol";
import { CreatorScore } from "../src/CreatorScore.sol";
import { ERC8004TrustRegistry } from "../src/ERC8004TrustRegistry.sol";
import { X402PaymentGate } from "../src/X402PaymentGate.sol";

/// @title Deploy — ceos.run full contract deployment (Virtuals Protocol integration)
/// @notice Deploys all core contracts to Base and wires cross-references.
/// @dev Usage:
///      Anvil:   forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast
///      Base:    forge script script/Deploy.s.sol --rpc-url $BASE_RPC_URL --broadcast --verify
///
///      Environment variables:
///        DEPLOYER_PRIVATE_KEY     — Deployer wallet private key
///        USDC_CONTRACT            — USDC token address on Base
///        PROTOCOL_FEE_RECIPIENT   — Address receiving 20% protocol fees
///        VIRTUALS_FACTORY         — Virtuals Protocol factory address on Base
///        SWAP_ROUTER              — Uniswap V3 SwapRouter02 address on Base
///        POOL_FEE                 — Uniswap V3 pool fee tier (default: 3000 = 0.30%)
contract Deploy is Script {
    /// @notice Entry point for the deploy script
    function run() external {
        // Load deployer private key from environment
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address usdcAddress = vm.envAddress("USDC_CONTRACT");
        address protocolFeeRecipient = vm.envAddress("PROTOCOL_FEE_RECIPIENT");
        address virtualsFactoryAddr = vm.envAddress("VIRTUALS_FACTORY");
        address swapRouterAddr = vm.envAddress("SWAP_ROUTER");
        uint24 poolFee = uint24(vm.envOr("POOL_FEE", uint256(3000)));

        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("Balance:", deployer.balance);
        console.log("USDC:", usdcAddress);
        console.log("Protocol Fee Recipient:", protocolFeeRecipient);
        console.log("Virtuals Factory:", virtualsFactoryAddr);
        console.log("Swap Router:", swapRouterAddr);
        console.log("Pool Fee:", poolFee);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy ERC-8004 TrustRegistry (no dependencies)
        ERC8004TrustRegistry trustRegistry = new ERC8004TrustRegistry();
        console.log("ERC8004TrustRegistry deployed at:", address(trustRegistry));

        // 2. Deploy AgentRegistry with a placeholder factory (will be updated)
        AgentRegistry agentRegistry = new AgentRegistry(address(0));
        console.log("AgentRegistry deployed at:", address(agentRegistry));

        // 3. Deploy CreatorScore with deployer as initial oracle
        CreatorScore creatorScore = new CreatorScore(deployer);
        console.log("CreatorScore deployed at:", address(creatorScore));

        // 4. Deploy RunToken (deployer gets DEFAULT_ADMIN_ROLE)
        RunToken runToken = new RunToken(deployer);
        console.log("RunToken deployed at:", address(runToken));

        // 5. Deploy FeeSplitter with Uniswap integration
        FeeSplitter feeSplitter = new FeeSplitter(
            swapRouterAddr,
            address(runToken),
            protocolFeeRecipient,
            poolFee
        );
        console.log("FeeSplitter deployed at:", address(feeSplitter));

        // 6. Deploy X402PaymentGate with USDC (using deployer as temp revenue target)
        X402PaymentGate paymentGate = new X402PaymentGate(usdcAddress, deployer);
        console.log("X402PaymentGate deployed at:", address(paymentGate));

        // 7. Deploy AgentFactory with Virtuals Protocol integration
        AgentFactory agentFactory = new AgentFactory(
            virtualsFactoryAddr,
            address(agentRegistry),
            address(trustRegistry),
            address(feeSplitter)
        );
        console.log("AgentFactory deployed at:", address(agentFactory));

        // === Wire cross-references ===

        // Set factory in AgentRegistry
        agentRegistry.setFactory(address(agentFactory));

        // Authorize AgentFactory as a minter in TrustRegistry
        trustRegistry.setAuthorizedMinter(address(agentFactory), true);

        // Authorize AgentFactory as a distributor in FeeSplitter
        feeSplitter.setAuthorizedDistributor(address(agentFactory), true);

        // Grant MINTER_ROLE on RunToken to FeeSplitter
        // (FeeSplitter doesn't mint directly, but the SwapRouter mocks may need it in tests)
        // On mainnet, the SwapRouter doesn't mint — it transfers from pool liquidity.
        // This grant is a no-op on mainnet but useful for testnet/Anvil mock setups.

        // Authorize PaymentGate processor
        paymentGate.setAuthorizedProcessor(deployer, true);

        vm.stopBroadcast();

        // Output for .env file — copy these values directly
        console.log("");
        console.log("=== .env Values ===");
        console.log("NEXT_PUBLIC_FACTORY_ADDRESS=", address(agentFactory));
        console.log("NEXT_PUBLIC_REGISTRY_ADDRESS=", address(agentRegistry));
        console.log("NEXT_PUBLIC_FEE_SPLITTER_ADDRESS=", address(feeSplitter));
        console.log("NEXT_PUBLIC_RUN_TOKEN_ADDRESS=", address(runToken));
        console.log("NEXT_PUBLIC_CREATOR_SCORE_ADDRESS=", address(creatorScore));
        console.log("NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS=", address(trustRegistry));
        console.log("NEXT_PUBLIC_X402_GATE_ADDRESS=", address(paymentGate));
    }
}
