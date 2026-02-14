// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { AgentFactory } from "../src/AgentFactory.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { RevenuePool } from "../src/RevenuePool.sol";
import { CreatorScore } from "../src/CreatorScore.sol";
import { ERC8004TrustRegistry } from "../src/ERC8004TrustRegistry.sol";
import { X402PaymentGate } from "../src/X402PaymentGate.sol";
import { CEOSScore } from "../src/CEOSScore.sol";

/// @title AgentImplementation — Minimal EIP-1167 clone target
contract AgentImplementationMainnet {
    receive() external payable { }
}

/// @title DeployMainnet — ceos.run Base Mainnet deployment
/// @notice Deploys all 7 core contracts with mainnet USDC and treasury addresses
/// @dev Usage: forge script script/DeployMainnet.s.sol --rpc-url $BASE_RPC_URL --broadcast --verify
contract DeployMainnet is Script {
    /// @notice Base Mainnet USDC
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address treasury = vm.envAddress("TREASURY_ADDRESS");

        // Pre-flight checks
        require(block.chainid == 8453, "Must deploy on Base Mainnet (8453)");
        require(deployer.balance >= 0.01 ether, "Deployer needs >= 0.01 ETH");
        require(treasury != address(0), "TREASURY_ADDRESS must be set");

        console2.log("=== ceos.run Mainnet Deployment ===");
        console2.log("Deployer:", deployer);
        console2.log("Balance:", deployer.balance);
        console2.log("Treasury:", treasury);
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

        // 5. RevenuePool
        RevenuePool revenuePool = new RevenuePool(USDC, deployer);
        console2.log("RevenuePool:", address(revenuePool));

        // 6. X402PaymentGate
        X402PaymentGate paymentGate = new X402PaymentGate(USDC, address(revenuePool));
        console2.log("X402PaymentGate:", address(paymentGate));

        // 7. AgentImplementation (EIP-1167 clone target)
        address agentImpl = address(new AgentImplementationMainnet());
        console2.log("AgentImplementation:", agentImpl);

        // 8. AgentFactory
        AgentFactory agentFactory = new AgentFactory(
            agentImpl,
            address(agentRegistry),
            address(trustRegistry),
            address(revenuePool),
            treasury
        );
        console2.log("AgentFactory:", address(agentFactory));

        // === Wire cross-references ===
        agentRegistry.setFactory(address(agentFactory));
        trustRegistry.setAuthorizedMinter(address(agentFactory), true);
        paymentGate.setAuthorizedProcessor(deployer, true);

        vm.stopBroadcast();

        // Output for .env configuration
        console2.log("");
        console2.log("=== .env Configuration ===");
        console2.log("NEXT_PUBLIC_FACTORY_ADDRESS=", address(agentFactory));
        console2.log("NEXT_PUBLIC_REGISTRY_ADDRESS=", address(agentRegistry));
        console2.log("NEXT_PUBLIC_CREATOR_SCORE_ADDRESS=", address(creatorScore));
        console2.log("NEXT_PUBLIC_REVENUE_POOL_ADDRESS=", address(revenuePool));
        console2.log("NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS=", address(trustRegistry));
        console2.log("NEXT_PUBLIC_X402_GATE_ADDRESS=", address(paymentGate));
    }
}
