// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { AgentFactory } from "../src/AgentFactory.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { ERC8004TrustRegistry } from "../src/ERC8004TrustRegistry.sol";
import { FeeSplitter } from "../src/FeeSplitter.sol";
import { RunToken } from "../src/RunToken.sol";
import { IAgentFactory } from "../src/interfaces/IAgentFactory.sol";
import { MockVirtualsFactory } from "./mocks/MockVirtualsFactory.sol";
import { MockWETH } from "./mocks/MockWETH.sol";
import { MockSwapRouter } from "./mocks/MockSwapRouter.sol";

/// @title AgentFactoryTest
/// @notice Tests for the Virtuals Protocol-integrated AgentFactory
/// @dev Validates agent deployment flow: Virtuals token creation → ERC-8004 mint
///      → registry registration → fee forwarding to FeeSplitter
contract AgentFactoryTest is Test {
    // ── Canonical Base Addresses ──
    address constant SWAP_ROUTER_ADDR = 0x2626664c2603336E57B271c5C0b26F421741e481;
    address constant WETH_ADDR = 0x4200000000000000000000000000000000000006;

    // ── Contracts Under Test ──
    AgentFactory public factory;
    AgentRegistry public registry;
    ERC8004TrustRegistry public trustRegistry;
    FeeSplitter public feeSplitter;
    RunToken public runToken;

    // ── Mocks ──
    MockVirtualsFactory public mockVirtualsFactory;
    MockWETH public mockWeth;
    MockSwapRouter public mockRouter;

    // ── Actors ──
    address public deployer;
    address public creator;
    address public protocolFeeRecipient;

    uint256 public constant DEPLOY_FEE = 0.005 ether;
    uint24 public constant POOL_FEE = 3000;

    /// @notice Accept ETH transfers
    receive() external payable {}

    function setUp() public {
        deployer = address(this);
        creator = makeAddr("creator");
        protocolFeeRecipient = makeAddr("protocolFeeRecipient");

        // Deploy mocks at canonical addresses
        mockWeth = new MockWETH();
        vm.etch(WETH_ADDR, address(mockWeth).code);
        mockWeth = MockWETH(payable(WETH_ADDR));

        mockRouter = new MockSwapRouter();
        vm.etch(SWAP_ROUTER_ADDR, address(mockRouter).code);
        mockRouter = MockSwapRouter(payable(SWAP_ROUTER_ADDR));
        mockRouter.setExchangeRate(2);

        // Deploy RunToken (needed for FeeSplitter)
        runToken = new RunToken(deployer);
        runToken.grantRole(runToken.MINTER_ROLE(), SWAP_ROUTER_ADDR);

        // Deploy FeeSplitter
        feeSplitter = new FeeSplitter(
            SWAP_ROUTER_ADDR,
            address(runToken),
            protocolFeeRecipient,
            POOL_FEE
        );

        // Deploy MockVirtualsFactory
        mockVirtualsFactory = new MockVirtualsFactory();

        // Deploy dependencies
        trustRegistry = new ERC8004TrustRegistry();
        registry = new AgentRegistry(address(0));

        // Deploy factory
        factory = new AgentFactory(
            address(mockVirtualsFactory),
            address(registry),
            address(trustRegistry),
            address(feeSplitter)
        );

        // Wire references
        registry.setFactory(address(factory));
        trustRegistry.setAuthorizedMinter(address(factory), true);

        // Fund creator
        vm.deal(creator, 10 ether);
    }

    // ════════════════════════════════════════════════════════════════════
    //  DEPLOYMENT: Success Cases
    // ════════════════════════════════════════════════════════════════════

    /// @notice Test successful agent deployment via Virtuals Protocol
    function test_deployAgent_success() public {
        vm.prank(creator);
        address agent = factory.deployAgent{ value: DEPLOY_FEE }(
            "TestAgent", "TA", "ipfs://metadata"
        );

        assertTrue(agent != address(0), "Agent address should not be zero");
        assertEq(factory.getAgentCount(creator), 1, "Creator should have 1 agent");

        address[] memory agents = factory.getAgentsByCreator(creator);
        assertEq(agents.length, 1, "Should return 1 agent");
        assertEq(agents[0], agent, "First agent should match");
    }

    /// @notice Test that Virtuals token mapping is set correctly
    function test_deployAgent_setsVirtualsToken() public {
        vm.prank(creator);
        address agent = factory.deployAgent{ value: DEPLOY_FEE }(
            "TokenAgent", "TK", "ipfs://token"
        );

        assertEq(factory.getVirtualsToken(agent), agent, "Virtuals token should be self-referential");
    }

    /// @notice Test that ERC-8004 identity NFT is minted on deploy
    function test_deployAgent_mintsERC8004Identity() public {
        vm.prank(creator);
        address agent = factory.deployAgent{ value: DEPLOY_FEE }(
            "IdentityAgent", "ID", "ipfs://identity"
        );

        uint256 tokenId = trustRegistry.getTokenByAgent(agent);
        assertTrue(tokenId > 0, "Token ID should be positive");
    }

    /// @notice Test that agent is registered in AgentRegistry on deploy
    function test_deployAgent_registersInRegistry() public {
        vm.prank(creator);
        address agent = factory.deployAgent{ value: DEPLOY_FEE }(
            "RegistryAgent", "RG", "ipfs://registry"
        );

        assertTrue(registry.isRegistered(agent), "Agent should be registered");
    }

    /// @notice Test that deploy fee is forwarded to FeeSplitter
    function test_deployAgent_forwardsFeeToFeeSplitter() public {
        uint256 splitterBalBefore = address(feeSplitter).balance;

        vm.prank(creator);
        factory.deployAgent{ value: DEPLOY_FEE }("FeeAgent", "FA", "ipfs://fee");

        assertEq(
            address(feeSplitter).balance - splitterBalBefore,
            DEPLOY_FEE,
            "FeeSplitter should receive the deploy fee"
        );
    }

    /// @notice Test multiple agents from same creator get unique addresses
    function test_deployAgent_uniqueAddresses() public {
        vm.prank(creator);
        address agent1 = factory.deployAgent{ value: DEPLOY_FEE }("Agent1", "A1", "uri1");

        vm.prank(creator);
        address agent2 = factory.deployAgent{ value: DEPLOY_FEE }("Agent2", "A2", "uri2");

        assertTrue(agent1 != agent2, "Agents should have unique addresses");
        assertEq(factory.getAgentCount(creator), 2, "Creator should have 2 agents");
    }

    // ════════════════════════════════════════════════════════════════════
    //  DEPLOYMENT: Failure Cases
    // ════════════════════════════════════════════════════════════════════

    /// @notice Test that deploying with insufficient fee reverts
    function test_deployAgent_insufficientFee() public {
        vm.prank(creator);
        vm.expectRevert(IAgentFactory.InsufficientDeployFee.selector);
        factory.deployAgent{ value: 0.001 ether }("TestAgent", "TA", "ipfs://metadata");
    }

    /// @notice Test that exceeding max agents per creator reverts
    function test_deployAgent_maxAgentsReached() public {
        for (uint256 i; i < 10; ++i) {
            vm.prank(creator);
            factory.deployAgent{ value: DEPLOY_FEE }(
                "Agent", "A", string(abi.encodePacked("uri", i))
            );
        }

        vm.prank(creator);
        vm.expectRevert(IAgentFactory.MaxAgentsReached.selector);
        factory.deployAgent{ value: DEPLOY_FEE }("Agent11", "A11", "uri11");
    }

    /// @notice Test that Virtuals factory failure causes revert
    function test_deployAgent_virtualsDeployFailed() public {
        mockVirtualsFactory.setShouldFail(true);

        vm.prank(creator);
        vm.expectRevert(IAgentFactory.VirtualsDeployFailed.selector);
        factory.deployAgent{ value: DEPLOY_FEE }("FailAgent", "FA", "ipfs://fail");
    }

    // ════════════════════════════════════════════════════════════════════
    //  ADMIN: Configuration
    // ════════════════════════════════════════════════════════════════════

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

    /// @notice Test setFeeSplitter updates the address
    function test_setFeeSplitter() public {
        address newSplitter = makeAddr("newSplitter");
        factory.setFeeSplitter(newSplitter);
        assertEq(factory.feeSplitter(), newSplitter, "FeeSplitter should be updated");
    }

    /// @notice Test setFeeSplitter reverts with zero address
    function test_setFeeSplitter_revertZeroAddress() public {
        vm.expectRevert(IAgentFactory.ZeroAddress.selector);
        factory.setFeeSplitter(address(0));
    }

    /// @notice Test setVirtualsFactory updates the address
    function test_setVirtualsFactory() public {
        address newFactory = makeAddr("newVirtualsFactory");
        factory.setVirtualsFactory(newFactory);
        assertEq(address(factory.virtualsFactory()), newFactory, "VirtualsFactory should be updated");
    }

    /// @notice Test setVirtualsFactory reverts with zero address
    function test_setVirtualsFactory_revertZeroAddress() public {
        vm.expectRevert(IAgentFactory.ZeroAddress.selector);
        factory.setVirtualsFactory(address(0));
    }

    /// @notice Test that non-owner cannot change deploy fee
    function test_setDeployFee_revertsForNonOwner() public {
        vm.prank(creator);
        vm.expectRevert();
        factory.setDeployFee(0.01 ether);
    }

    /// @notice Test that non-owner cannot change FeeSplitter
    function test_setFeeSplitter_revertsForNonOwner() public {
        vm.prank(creator);
        vm.expectRevert();
        factory.setFeeSplitter(makeAddr("newSplitter"));
    }

    // ════════════════════════════════════════════════════════════════════
    //  CONSTRUCTOR: Zero Address Validation
    // ════════════════════════════════════════════════════════════════════

    /// @notice Test constructor reverts with zero VirtualsFactory address
    function test_constructor_revertZeroVirtualsFactory() public {
        vm.expectRevert(IAgentFactory.ZeroAddress.selector);
        new AgentFactory(
            address(0),
            address(registry),
            address(trustRegistry),
            address(feeSplitter)
        );
    }

    /// @notice Test constructor reverts with zero AgentRegistry address
    function test_constructor_revertZeroRegistry() public {
        vm.expectRevert(IAgentFactory.ZeroAddress.selector);
        new AgentFactory(
            address(mockVirtualsFactory),
            address(0),
            address(trustRegistry),
            address(feeSplitter)
        );
    }

    /// @notice Test constructor reverts with zero TrustRegistry address
    function test_constructor_revertZeroTrustRegistry() public {
        vm.expectRevert(IAgentFactory.ZeroAddress.selector);
        new AgentFactory(
            address(mockVirtualsFactory),
            address(registry),
            address(0),
            address(feeSplitter)
        );
    }

    /// @notice Test constructor reverts with zero FeeSplitter address
    function test_constructor_revertZeroFeeSplitter() public {
        vm.expectRevert(IAgentFactory.ZeroAddress.selector);
        new AgentFactory(
            address(mockVirtualsFactory),
            address(registry),
            address(trustRegistry),
            address(0)
        );
    }
}
