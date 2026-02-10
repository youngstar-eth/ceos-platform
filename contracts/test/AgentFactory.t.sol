// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test, console } from "forge-std/Test.sol";
import { AgentFactory } from "../src/AgentFactory.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { ERC8004TrustRegistry } from "../src/ERC8004TrustRegistry.sol";
import { RevenuePool } from "../src/RevenuePool.sol";
import { IAgentFactory } from "../src/interfaces/IAgentFactory.sol";

/// @title AgentFactoryTest
/// @notice Comprehensive tests for AgentFactory contract
contract AgentFactoryTest is Test {
    AgentFactory public factory;
    AgentRegistry public registry;
    ERC8004TrustRegistry public trustRegistry;
    RevenuePool public revenuePool;

    address public implementation;
    address public treasury;
    address public deployer;
    address public creator;
    address public mockUsdc;

    uint256 public constant DEPLOY_FEE = 0.005 ether;

    function setUp() public {
        deployer = address(this);
        creator = makeAddr("creator");
        treasury = makeAddr("treasury");
        mockUsdc = makeAddr("usdc");

        // Deploy implementation for clones
        implementation = address(new MockImplementation());

        // Deploy dependencies
        trustRegistry = new ERC8004TrustRegistry();
        registry = new AgentRegistry(address(0)); // placeholder factory
        revenuePool = new RevenuePool(mockUsdc, deployer);

        // Deploy factory
        factory = new AgentFactory(
            implementation,
            address(registry),
            address(trustRegistry),
            address(revenuePool),
            treasury
        );

        // Wire references
        registry.setFactory(address(factory));
        trustRegistry.setAuthorizedMinter(address(factory), true);
    }

    /// @notice Test successful agent deployment
    function test_deployAgent_success() public {
        vm.deal(creator, 1 ether);
        vm.prank(creator);
        address agent = factory.deployAgent{ value: DEPLOY_FEE }("TestAgent", "TA", "ipfs://metadata");

        assertTrue(agent != address(0), "Agent address should not be zero");
        assertEq(factory.getAgentCount(creator), 1, "Creator should have 1 agent");

        address[] memory agents = factory.getAgentsByCreator(creator);
        assertEq(agents.length, 1, "Should return 1 agent");
        assertEq(agents[0], agent, "First agent should match");
    }

    /// @notice Test that deploying with insufficient fee reverts
    function test_deployAgent_insufficientFee() public {
        vm.deal(creator, 1 ether);
        vm.prank(creator);
        vm.expectRevert(IAgentFactory.InsufficientDeployFee.selector);
        factory.deployAgent{ value: 0.001 ether }("TestAgent", "TA", "ipfs://metadata");
    }

    /// @notice Test that exceeding max agents per creator reverts
    function test_deployAgent_maxAgentsReached() public {
        vm.deal(creator, 10 ether);

        // Deploy max agents
        for (uint256 i; i < 10; ++i) {
            vm.prank(creator);
            factory.deployAgent{ value: DEPLOY_FEE }("Agent", "A", string(abi.encodePacked("uri", i)));
        }

        // 11th should revert
        vm.prank(creator);
        vm.expectRevert(IAgentFactory.MaxAgentsReached.selector);
        factory.deployAgent{ value: DEPLOY_FEE }("Agent11", "A11", "uri11");
    }

    /// @notice Test fee split 50/50 between revenue pool and treasury
    function test_deployAgent_feeSplit() public {
        vm.deal(creator, 1 ether);

        uint256 poolBefore = address(revenuePool).balance;
        uint256 treasuryBefore = treasury.balance;

        vm.prank(creator);
        factory.deployAgent{ value: DEPLOY_FEE }("TestAgent", "TA", "ipfs://metadata");

        uint256 halfFee = DEPLOY_FEE / 2;
        assertEq(address(revenuePool).balance - poolBefore, halfFee, "Pool should get half fee");
        assertEq(treasury.balance - treasuryBefore, DEPLOY_FEE - halfFee, "Treasury should get remainder");
    }

    /// @notice Test ERC-8004 identity is minted on deploy
    function test_deployAgent_mintsERC8004Identity() public {
        vm.deal(creator, 1 ether);
        vm.prank(creator);
        address agent = factory.deployAgent{ value: DEPLOY_FEE }("TestAgent", "TA", "ipfs://metadata");

        uint256 tokenId = trustRegistry.getTokenByAgent(agent);
        assertTrue(tokenId > 0, "Token ID should be positive");
    }

    /// @notice Test agent is registered in AgentRegistry on deploy
    function test_deployAgent_registersInRegistry() public {
        vm.deal(creator, 1 ether);
        vm.prank(creator);
        address agent = factory.deployAgent{ value: DEPLOY_FEE }("TestAgent", "TA", "ipfs://metadata");

        assertTrue(registry.isRegistered(agent), "Agent should be registered");
    }

    /// @notice Test getDeployFee returns correct default value
    function test_getDeployFee() public view {
        assertEq(factory.getDeployFee(), DEPLOY_FEE, "Default fee should be 0.005 ether");
    }

    /// @notice Test setDeployFee updates the fee (owner only)
    function test_setDeployFee() public {
        uint256 newFee = 0.01 ether;
        factory.setDeployFee(newFee);
        assertEq(factory.getDeployFee(), newFee, "Fee should be updated");
    }

    /// @notice Test setTreasury updates the treasury address
    function test_setTreasury() public {
        address newTreasury = makeAddr("newTreasury");
        factory.setTreasury(newTreasury);
        assertEq(factory.treasury(), newTreasury, "Treasury should be updated");
    }

    /// @notice Test setTreasury reverts with zero address
    function test_setTreasury_revertZeroAddress() public {
        vm.expectRevert(IAgentFactory.ZeroAddress.selector);
        factory.setTreasury(address(0));
    }

    /// @notice Test multiple agents from same creator get unique addresses
    function test_deployAgent_uniqueAddresses() public {
        vm.deal(creator, 1 ether);

        vm.prank(creator);
        address agent1 = factory.deployAgent{ value: DEPLOY_FEE }("Agent1", "A1", "uri1");

        vm.prank(creator);
        address agent2 = factory.deployAgent{ value: DEPLOY_FEE }("Agent2", "A2", "uri2");

        assertTrue(agent1 != agent2, "Agents should have unique addresses");
        assertEq(factory.getAgentCount(creator), 2, "Creator should have 2 agents");
    }
}

/// @notice Minimal implementation contract for testing EIP-1167 clones
contract MockImplementation {
    receive() external payable { }
}
