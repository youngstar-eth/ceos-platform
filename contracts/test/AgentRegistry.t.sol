// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { IAgentRegistry } from "../src/interfaces/IAgentRegistry.sol";

/// @title AgentRegistryTest
/// @notice Comprehensive tests for AgentRegistry contract
contract AgentRegistryTest is Test {
    AgentRegistry public registry;

    address public owner;
    address public factoryAddr;
    address public agent1;
    address public agent2;
    address public creator1;
    address public creator2;
    address public unauthorized;

    function setUp() public {
        owner = address(this);
        factoryAddr = makeAddr("factory");
        agent1 = makeAddr("agent1");
        agent2 = makeAddr("agent2");
        creator1 = makeAddr("creator1");
        creator2 = makeAddr("creator2");
        unauthorized = makeAddr("unauthorized");

        registry = new AgentRegistry(factoryAddr);
    }

    /// @notice Test successful agent registration by factory
    function test_registerAgent_success() public {
        vm.prank(factoryAddr);
        registry.registerAgent(agent1, 100, "ipfs://agent1", creator1);

        assertTrue(registry.isRegistered(agent1), "Agent should be registered");

        IAgentRegistry.AgentInfo memory info = registry.getAgent(agent1);
        assertEq(info.creator, creator1, "Creator should match");
        assertEq(info.fid, 100, "FID should match");
        assertEq(info.agentURI, "ipfs://agent1", "URI should match");
        assertEq(uint256(info.status), uint256(IAgentRegistry.AgentStatus.Active), "Status should be Active");
    }

    /// @notice Test FID uniqueness enforcement
    function test_registerAgent_fidUniqueness() public {
        vm.prank(factoryAddr);
        registry.registerAgent(agent1, 100, "ipfs://agent1", creator1);

        vm.prank(factoryAddr);
        vm.expectRevert(IAgentRegistry.FidAlreadyRegistered.selector);
        registry.registerAgent(agent2, 100, "ipfs://agent2", creator2);
    }

    /// @notice Test double registration reverts
    function test_registerAgent_alreadyRegistered() public {
        vm.prank(factoryAddr);
        registry.registerAgent(agent1, 100, "ipfs://agent1", creator1);

        vm.prank(factoryAddr);
        vm.expectRevert(IAgentRegistry.AgentAlreadyRegistered.selector);
        registry.registerAgent(agent1, 200, "ipfs://agent1-v2", creator1);
    }

    /// @notice Test unauthorized registration reverts
    function test_registerAgent_unauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert(IAgentRegistry.UnauthorizedCaller.selector);
        registry.registerAgent(agent1, 100, "ipfs://agent1", creator1);
    }

    /// @notice Test status update by creator
    function test_updateAgentStatus_byCreator() public {
        vm.prank(factoryAddr);
        registry.registerAgent(agent1, 100, "ipfs://agent1", creator1);

        vm.prank(creator1);
        registry.updateAgentStatus(agent1, IAgentRegistry.AgentStatus.Paused);

        IAgentRegistry.AgentInfo memory info = registry.getAgent(agent1);
        assertEq(uint256(info.status), uint256(IAgentRegistry.AgentStatus.Paused), "Status should be Paused");
    }

    /// @notice Test status update by owner
    function test_updateAgentStatus_byOwner() public {
        vm.prank(factoryAddr);
        registry.registerAgent(agent1, 100, "ipfs://agent1", creator1);

        registry.updateAgentStatus(agent1, IAgentRegistry.AgentStatus.Terminated);

        IAgentRegistry.AgentInfo memory info = registry.getAgent(agent1);
        assertEq(
            uint256(info.status), uint256(IAgentRegistry.AgentStatus.Terminated), "Status should be Terminated"
        );
    }

    /// @notice Test unauthorized status update reverts
    function test_updateAgentStatus_unauthorized() public {
        vm.prank(factoryAddr);
        registry.registerAgent(agent1, 100, "ipfs://agent1", creator1);

        vm.prank(unauthorized);
        vm.expectRevert(IAgentRegistry.UnauthorizedCaller.selector);
        registry.updateAgentStatus(agent1, IAgentRegistry.AgentStatus.Paused);
    }

    /// @notice Test setting same status reverts
    function test_updateAgentStatus_invalidSameStatus() public {
        vm.prank(factoryAddr);
        registry.registerAgent(agent1, 100, "ipfs://agent1", creator1);

        vm.prank(creator1);
        vm.expectRevert(IAgentRegistry.InvalidStatus.selector);
        registry.updateAgentStatus(agent1, IAgentRegistry.AgentStatus.Active);
    }

    /// @notice Test getAgentByFid lookup
    function test_getAgentByFid() public {
        vm.prank(factoryAddr);
        registry.registerAgent(agent1, 100, "ipfs://agent1", creator1);

        address found = registry.getAgentByFid(100);
        assertEq(found, agent1, "Should return correct agent address");
    }

    /// @notice Test getAgentByFid reverts for unknown FID
    function test_getAgentByFid_notFound() public {
        vm.expectRevert(IAgentRegistry.AgentNotFound.selector);
        registry.getAgentByFid(999);
    }

    /// @notice Test getAgent reverts for unregistered agent
    function test_getAgent_notFound() public {
        vm.expectRevert(IAgentRegistry.AgentNotFound.selector);
        registry.getAgent(agent1);
    }

    /// @notice Test URI update by creator
    function test_updateAgentURI() public {
        vm.prank(factoryAddr);
        registry.registerAgent(agent1, 100, "ipfs://agent1", creator1);

        vm.prank(creator1);
        registry.updateAgentURI(agent1, "ipfs://agent1-v2");

        IAgentRegistry.AgentInfo memory info = registry.getAgent(agent1);
        assertEq(info.agentURI, "ipfs://agent1-v2", "URI should be updated");
    }

    /// @notice Test setFactory by owner
    function test_setFactory() public {
        address newFactory = makeAddr("newFactory");
        registry.setFactory(newFactory);
        assertEq(registry.factory(), newFactory, "Factory should be updated");
    }
}
