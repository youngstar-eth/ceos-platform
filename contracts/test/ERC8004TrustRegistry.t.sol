// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { ERC8004TrustRegistry } from "../src/ERC8004TrustRegistry.sol";
import { IERC8004TrustRegistry } from "../src/interfaces/IERC8004TrustRegistry.sol";

/// @title ERC8004TrustRegistryTest
/// @notice Comprehensive tests for ERC8004TrustRegistry contract
contract ERC8004TrustRegistryTest is Test {
    ERC8004TrustRegistry public registry;

    address public owner;
    address public minter;
    address public agent1;
    address public agent2;
    address public unauthorized;

    function setUp() public {
        owner = address(this);
        minter = makeAddr("minter");
        agent1 = makeAddr("agent1");
        agent2 = makeAddr("agent2");
        unauthorized = makeAddr("unauthorized");

        registry = new ERC8004TrustRegistry();
        registry.setAuthorizedMinter(minter, true);
    }

    /// @notice Test successful identity minting
    function test_mintIdentity_success() public {
        vm.prank(minter);
        uint256 tokenId = registry.mintIdentity(agent1, "ipfs://agent1");

        assertEq(tokenId, 1, "First token should be ID 1");
        assertEq(registry.ownerOf(tokenId), agent1, "Agent should own the token");
    }

    /// @notice Test get identity after minting
    function test_getIdentity() public {
        vm.prank(minter);
        uint256 tokenId = registry.mintIdentity(agent1, "ipfs://agent1");

        IERC8004TrustRegistry.AgentIdentity memory identity = registry.getIdentity(tokenId);
        assertEq(identity.agentAddress, agent1, "Agent address should match");
        assertEq(identity.agentURI, "ipfs://agent1", "URI should match");
        assertEq(identity.reputationScore, 0, "Initial reputation should be 0");
        assertTrue(identity.registeredAt > 0, "Registered timestamp should be set");
    }

    /// @notice Test double identity minting reverts
    function test_mintIdentity_alreadyExists() public {
        vm.prank(minter);
        registry.mintIdentity(agent1, "ipfs://agent1");

        vm.prank(minter);
        vm.expectRevert(IERC8004TrustRegistry.IdentityAlreadyExists.selector);
        registry.mintIdentity(agent1, "ipfs://agent1-v2");
    }

    /// @notice Test unauthorized minting reverts
    function test_mintIdentity_unauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert(IERC8004TrustRegistry.UnauthorizedMinter.selector);
        registry.mintIdentity(agent1, "ipfs://agent1");
    }

    /// @notice Test reputation update
    function test_updateReputation() public {
        vm.prank(minter);
        uint256 tokenId = registry.mintIdentity(agent1, "ipfs://agent1");

        vm.prank(minter);
        registry.updateReputation(tokenId, 8500);

        IERC8004TrustRegistry.AgentIdentity memory identity = registry.getIdentity(tokenId);
        assertEq(identity.reputationScore, 8500, "Reputation should be updated");
    }

    /// @notice Test reputation update with invalid token reverts
    function test_updateReputation_invalidToken() public {
        vm.prank(minter);
        vm.expectRevert(IERC8004TrustRegistry.InvalidTokenId.selector);
        registry.updateReputation(999, 8500);
    }

    /// @notice Test adding validation record
    function test_addValidation() public {
        vm.prank(minter);
        uint256 tokenId = registry.mintIdentity(agent1, "ipfs://agent1");

        vm.prank(minter);
        registry.addValidation(tokenId, "text-generation", true);

        IERC8004TrustRegistry.Validation[] memory validations = registry.getValidations(tokenId);
        assertEq(validations.length, 1, "Should have 1 validation");
        assertEq(validations[0].skillId, "text-generation");
        assertTrue(validations[0].passed);
        assertTrue(validations[0].validatedAt > 0);
    }

    /// @notice Test multiple validation records
    function test_addValidation_multiple() public {
        vm.prank(minter);
        uint256 tokenId = registry.mintIdentity(agent1, "ipfs://agent1");

        vm.prank(minter);
        registry.addValidation(tokenId, "text-generation", true);

        vm.prank(minter);
        registry.addValidation(tokenId, "image-generation", false);

        vm.prank(minter);
        registry.addValidation(tokenId, "engagement", true);

        IERC8004TrustRegistry.Validation[] memory validations = registry.getValidations(tokenId);
        assertEq(validations.length, 3, "Should have 3 validations");
        assertFalse(validations[1].passed, "Second validation should be failed");
    }

    /// @notice Test getTokenByAgent lookup
    function test_getTokenByAgent() public {
        vm.prank(minter);
        uint256 tokenId = registry.mintIdentity(agent1, "ipfs://agent1");

        uint256 foundId = registry.getTokenByAgent(agent1);
        assertEq(foundId, tokenId, "Should return correct token ID");
    }

    /// @notice Test getTokenByAgent reverts for unknown agent
    function test_getTokenByAgent_notFound() public {
        vm.expectRevert(IERC8004TrustRegistry.IdentityNotFound.selector);
        registry.getTokenByAgent(agent1);
    }

    /// @notice Test getIdentity reverts for invalid token ID
    function test_getIdentity_invalidToken() public {
        vm.expectRevert(IERC8004TrustRegistry.InvalidTokenId.selector);
        registry.getIdentity(0);
    }

    /// @notice Test setAuthorizedMinter
    function test_setAuthorizedMinter() public {
        address newMinter = makeAddr("newMinter");
        registry.setAuthorizedMinter(newMinter, true);
        assertTrue(registry.authorizedMinters(newMinter), "Should be authorized");

        registry.setAuthorizedMinter(newMinter, false);
        assertFalse(registry.authorizedMinters(newMinter), "Should be revoked");
    }

    /// @notice Test token incrementing
    function test_mintIdentity_tokenIncrement() public {
        vm.prank(minter);
        uint256 token1 = registry.mintIdentity(agent1, "ipfs://agent1");

        vm.prank(minter);
        uint256 token2 = registry.mintIdentity(agent2, "ipfs://agent2");

        assertEq(token1, 1, "First token should be 1");
        assertEq(token2, 2, "Second token should be 2");
    }
}
