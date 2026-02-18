// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { AgentFactory } from "../src/AgentFactory.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { RunToken } from "../src/RunToken.sol";
import { FeeSplitter } from "../src/FeeSplitter.sol";
import { CreatorScore } from "../src/CreatorScore.sol";
import { ERC8004TrustRegistry } from "../src/ERC8004TrustRegistry.sol";
import { X402PaymentGate } from "../src/X402PaymentGate.sol";
import { CEOSScore } from "../src/CEOSScore.sol";

/// @title DeployMainnet — ceos.run Base Mainnet deployment (Virtuals Protocol integration)
/// @notice Deploys all core contracts with mainnet addresses
/// @dev Usage: forge script script/DeployMainnet.s.sol --rpc-url $BASE_RPC_URL --broadcast --verify
contract DeployMainnet is Script {
    /// @notice Base Mainnet USDC
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    /// @notice Uniswap V3 SwapRouter02 on Base Mainnet
    address constant SWAP_ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481;

    /// @notice Virtuals Protocol Factory on Base Mainnet
    /// @dev Set via VIRTUALS_FACTORY env var
    address public virtualsFactoryAddr;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address protocolFeeRecipient = vm.envAddress("PROTOCOL_FEE_RECIPIENT");
        virtualsFactoryAddr = vm.envAddress("VIRTUALS_FACTORY");
        uint24 poolFee = uint24(vm.envOr("POOL_FEE", uint256(3000)));

        // Pre-flight checks
        require(block.chainid == 8453, "Must deploy on Base Mainnet (8453)");
        require(deployer.balance >= 0.01 ether, "Deployer needs >= 0.01 ETH");
        require(protocolFeeRecipient != address(0), "PROTOCOL_FEE_RECIPIENT must be set");
        require(virtualsFactoryAddr != address(0), "VIRTUALS_FACTORY must be set");

        console2.log("=== ceos.run Mainnet Deployment ===");
        console2.log("Deployer:", deployer);
        console2.log("Balance:", deployer.balance);
        console2.log("Protocol Fee Recipient:", protocolFeeRecipient);
        console2.log("Virtuals Factory:", virtualsFactoryAddr);
        console2.log("USDC:", USDC);
        console2.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerPrivateKey);

        // 1. ERC-8004 TrustRegistry
        ERC8004TrustRegistry trustRegistry = new ERC8004TrustRegistry();
        console2.log("ERC8004TrustRegistry:", address(trustRegistry));

        // 2. AgentRegistry (factory set after AgentFactory deploy)
        AgentRegistry agentRegistry = new AgentRegistry(address(0));
        console2.log("AgentRegistry:", address(agentRegistry));

        // 3. CreatorScore
        CreatorScore creatorScore = new CreatorScore(deployer);
        console2.log("CreatorScore:", address(creatorScore));

        // 4. CEOSScore
        CEOSScore ceosScore = new CEOSScore(deployer);
        console2.log("CEOSScore:", address(ceosScore));

        // 5. RunToken
        RunToken runToken = new RunToken(deployer);
        console2.log("RunToken:", address(runToken));

        // 6. FeeSplitter (Uniswap V3 buyback-and-burn)
        FeeSplitter feeSplitter = new FeeSplitter(
            SWAP_ROUTER,
            address(runToken),
            protocolFeeRecipient,
            poolFee
        );
        console2.log("FeeSplitter:", address(feeSplitter));

        // 7. X402PaymentGate
        X402PaymentGate paymentGate = new X402PaymentGate(USDC, deployer);
        console2.log("X402PaymentGate:", address(paymentGate));

        // 8. AgentFactory (Virtuals Protocol integration)
        AgentFactory agentFactory = new AgentFactory(
            virtualsFactoryAddr,
            address(agentRegistry),
            address(trustRegistry),
            address(feeSplitter)
        );
        console2.log("AgentFactory:", address(agentFactory));

        // === Wire cross-references ===
        agentRegistry.setFactory(address(agentFactory));
        trustRegistry.setAuthorizedMinter(address(agentFactory), true);
        feeSplitter.setAuthorizedDistributor(address(agentFactory), true);
        feeSplitter.setAuthorizedDistributor(deployer, true);
        paymentGate.setAuthorizedProcessor(deployer, true);

        vm.stopBroadcast();

        // Output for .env configuration
        console2.log("");
        console2.log("=== .env Configuration ===");
        console2.log("NEXT_PUBLIC_FACTORY_ADDRESS=", address(agentFactory));
        console2.log("NEXT_PUBLIC_REGISTRY_ADDRESS=", address(agentRegistry));
        console2.log("NEXT_PUBLIC_CREATOR_SCORE_ADDRESS=", address(creatorScore));
        console2.log("NEXT_PUBLIC_RUN_TOKEN_ADDRESS=", address(runToken));
        console2.log("NEXT_PUBLIC_FEE_SPLITTER_ADDRESS=", address(feeSplitter));
        console2.log("NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS=", address(trustRegistry));
        console2.log("NEXT_PUBLIC_X402_GATE_ADDRESS=", address(paymentGate));
    }
}
