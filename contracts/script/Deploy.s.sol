// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { AgentFactory } from "../src/AgentFactory.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { RevenuePool } from "../src/RevenuePool.sol";
import { CreatorScore } from "../src/CreatorScore.sol";
import { ERC8004TrustRegistry } from "../src/ERC8004TrustRegistry.sol";
import { X402PaymentGate } from "../src/X402PaymentGate.sol";

/// @title Deploy — ceos.run full contract deployment
/// @notice Deploys all 6 core contracts to Base and wires cross-references.
/// @dev Usage: forge script script/Deploy.s.sol --rpc-url $BASE_RPC_URL --broadcast --verify
contract Deploy is Script {
    /// @notice Entry point for the deploy script
    function run() external {
        // Load deployer private key from environment
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address usdcAddress = vm.envAddress("USDC_CONTRACT");
        address treasuryAddress = vm.envAddress("TREASURY_ADDRESS");

        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("Balance:", deployer.balance);
        console.log("USDC:", usdcAddress);
        console.log("Treasury:", treasuryAddress);

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

        // 4. Deploy RevenuePool with USDC and deployer as initial score submitter
        RevenuePool revenuePool = new RevenuePool(usdcAddress, deployer);
        console.log("RevenuePool deployed at:", address(revenuePool));

        // 5. Deploy X402PaymentGate with USDC and RevenuePool
        X402PaymentGate paymentGate = new X402PaymentGate(usdcAddress, address(revenuePool));
        console.log("X402PaymentGate deployed at:", address(paymentGate));

        // 6. Deploy a minimal implementation contract for EIP-1167 clones
        //    In production, this would be the actual agent implementation.
        //    For now, use a simple contract as the clone target.
        address agentImplementation = address(new AgentImplementation());
        console.log("AgentImplementation deployed at:", agentImplementation);

        // 7. Deploy AgentFactory with all dependencies
        AgentFactory agentFactory = new AgentFactory(
            agentImplementation,
            address(agentRegistry),
            address(trustRegistry),
            address(revenuePool),
            treasuryAddress
        );
        console.log("AgentFactory deployed at:", address(agentFactory));

        // === Wire cross-references ===

        // Set factory in AgentRegistry
        agentRegistry.setFactory(address(agentFactory));

        // Authorize AgentFactory as a minter in TrustRegistry
        trustRegistry.setAuthorizedMinter(address(agentFactory), true);

        // Authorize PaymentGate as a processor
        paymentGate.setAuthorizedProcessor(deployer, true);

        vm.stopBroadcast();

        // Output for .env file — copy these values directly
        console.log("");
        console.log("=== .env Values ===");
        console.log("NEXT_PUBLIC_FACTORY_ADDRESS=", address(agentFactory));
        console.log("NEXT_PUBLIC_REGISTRY_ADDRESS=", address(agentRegistry));
        console.log("NEXT_PUBLIC_REVENUE_POOL_ADDRESS=", address(revenuePool));
        console.log("NEXT_PUBLIC_CREATOR_SCORE_ADDRESS=", address(creatorScore));
        console.log("NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS=", address(trustRegistry));
        console.log("NEXT_PUBLIC_X402_GATE_ADDRESS=", address(paymentGate));
    }
}

/// @title AgentImplementation
/// @notice Minimal implementation contract used as the EIP-1167 clone target.
/// @dev In production, this would contain the full agent logic. For deployment
///      purposes, a minimal contract is sufficient as the clone target.
contract AgentImplementation {
    /// @notice Accept ETH transfers to the agent
    receive() external payable { }
}
