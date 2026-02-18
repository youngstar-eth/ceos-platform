// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { AgentFactory } from "../src/AgentFactory.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { RevenuePool } from "../src/RevenuePool.sol";
import { CreatorScore } from "../src/CreatorScore.sol";
import { ERC8004TrustRegistry } from "../src/ERC8004TrustRegistry.sol";
import { X402PaymentGate } from "../src/X402PaymentGate.sol";
import { FeeSplitter } from "../src/FeeSplitter.sol";
import { RunToken } from "../src/RunToken.sol";
import { IAgentRegistry } from "../src/interfaces/IAgentRegistry.sol";
import { ICreatorScore } from "../src/interfaces/ICreatorScore.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";
import { MockWETH } from "./mocks/MockWETH.sol";
import { MockSwapRouter } from "./mocks/MockSwapRouter.sol";
import { MockVirtualsFactory } from "./mocks/MockVirtualsFactory.sol";

/// @title IntegrationTest
/// @notice Full lifecycle integration test for the ceos.run protocol
/// @dev Tests: deploy factory -> deploy agent -> register -> generate scores ->
///      submit scores -> finalize epoch -> claim revenue
contract IntegrationTest is Test {
    // ── Canonical Base Addresses ──
    address constant SWAP_ROUTER_ADDR = 0x2626664c2603336E57B271c5C0b26F421741e481;
    address constant WETH_ADDR = 0x4200000000000000000000000000000000000006;

    AgentFactory public factory;
    AgentRegistry public registry;
    RevenuePool public revenuePool;
    CreatorScore public creatorScore;
    ERC8004TrustRegistry public trustRegistry;
    X402PaymentGate public paymentGate;
    FeeSplitter public feeSplitter;
    RunToken public runToken;
    MockERC20 public usdc;
    MockVirtualsFactory public mockVirtualsFactory;

    address public deployer;
    address public protocolFeeRecipient;
    address public creator1;
    address public creator2;
    address public payer;

    uint256 public constant DEPLOY_FEE = 0.005 ether;

    /// @notice Accept ETH transfers
    receive() external payable {}

    function setUp() public {
        deployer = address(this);
        protocolFeeRecipient = makeAddr("protocolFeeRecipient");
        creator1 = makeAddr("creator1");
        creator2 = makeAddr("creator2");
        payer = makeAddr("payer");

        // Deploy mocks at canonical addresses
        MockWETH mockWeth = new MockWETH();
        vm.etch(WETH_ADDR, address(mockWeth).code);

        MockSwapRouter mockRouter = new MockSwapRouter();
        vm.etch(SWAP_ROUTER_ADDR, address(mockRouter).code);
        MockSwapRouter(payable(SWAP_ROUTER_ADDR)).setExchangeRate(2);

        // Deploy mock USDC
        usdc = new MockERC20("USDC", "USDC", 6);

        // Deploy RunToken and grant MINTER_ROLE to swap router
        runToken = new RunToken(deployer);
        runToken.grantRole(runToken.MINTER_ROLE(), SWAP_ROUTER_ADDR);

        // Deploy FeeSplitter
        feeSplitter = new FeeSplitter(
            SWAP_ROUTER_ADDR,
            address(runToken),
            protocolFeeRecipient,
            3000
        );
        feeSplitter.setAuthorizedDistributor(deployer, true);

        // Deploy all other contracts
        trustRegistry = new ERC8004TrustRegistry();
        registry = new AgentRegistry(address(0));
        creatorScore = new CreatorScore(deployer);
        revenuePool = new RevenuePool(address(usdc), deployer);
        paymentGate = new X402PaymentGate(address(usdc), address(revenuePool));
        mockVirtualsFactory = new MockVirtualsFactory();

        // Deploy AgentFactory with Virtuals integration
        factory = new AgentFactory(
            address(mockVirtualsFactory),
            address(registry),
            address(trustRegistry),
            address(feeSplitter)
        );

        // Wire references
        registry.setFactory(address(factory));
        trustRegistry.setAuthorizedMinter(address(factory), true);
        paymentGate.setAuthorizedProcessor(deployer, true);
        feeSplitter.setAuthorizedDistributor(address(factory), true);
    }

    /// @notice Full lifecycle: deploy -> scores -> claim
    function test_fullLifecycle() public {
        // === Phase 1: Deploy Agents ===
        vm.deal(creator1, 1 ether);
        vm.deal(creator2, 1 ether);

        vm.prank(creator1);
        address agent1 = factory.deployAgent{ value: DEPLOY_FEE }("Agent1", "A1", "ipfs://agent1");

        vm.prank(creator2);
        address agent2 = factory.deployAgent{ value: DEPLOY_FEE }("Agent2", "A2", "ipfs://agent2");

        assertTrue(agent1 != address(0), "Agent1 should be deployed");
        assertTrue(agent2 != address(0), "Agent2 should be deployed");

        // === Phase 2: Verify Registration ===
        assertTrue(registry.isRegistered(agent1), "Agent1 should be registered");
        assertTrue(registry.isRegistered(agent2), "Agent2 should be registered");

        IAgentRegistry.AgentInfo memory info1 = registry.getAgent(agent1);
        assertEq(info1.creator, creator1, "Agent1 creator should be creator1");
        assertEq(uint256(info1.status), uint256(IAgentRegistry.AgentStatus.Active), "Agent1 should be active");

        // === Phase 3: Verify ERC-8004 Identity ===
        uint256 token1 = trustRegistry.getTokenByAgent(agent1);
        uint256 token2 = trustRegistry.getTokenByAgent(agent2);
        assertTrue(token1 > 0, "Agent1 should have identity token");
        assertTrue(token2 > 0, "Agent2 should have identity token");

        // === Phase 4: Generate Revenue via x402 ===
        bytes32 resourceId = keccak256("premium-endpoint");
        paymentGate.setResourcePrice(resourceId, 100e6);

        usdc.mint(payer, 1000e6);
        vm.prank(payer);
        usdc.approve(address(paymentGate), type(uint256).max);

        // Process multiple payments
        paymentGate.processPayment(payer, 100e6, resourceId);
        paymentGate.processPayment(payer, 100e6, resourceId);

        // Route revenue to pool
        paymentGate.routeRevenue();

        // Add ETH revenue via deposit
        vm.deal(deployer, 1 ether);
        revenuePool.deposit{ value: 1 ether }();

        // === Phase 5: Submit Creator Scores ===
        address[] memory creators = new address[](2);
        creators[0] = creator1;
        creators[1] = creator2;

        uint256[] memory engagement = new uint256[](2);
        engagement[0] = 8000;
        engagement[1] = 6000;

        uint256[] memory growth = new uint256[](2);
        growth[0] = 7000;
        growth[1] = 5000;

        uint256[] memory quality = new uint256[](2);
        quality[0] = 9000;
        quality[1] = 7000;

        uint256[] memory uptime = new uint256[](2);
        uptime[0] = 9500;
        uptime[1] = 8000;

        creatorScore.submitScores(0, creators, engagement, growth, quality, uptime);

        ICreatorScore.ScoreBreakdown memory score1 = creatorScore.getScore(creator1, 0);
        ICreatorScore.ScoreBreakdown memory score2 = creatorScore.getScore(creator2, 0);
        assertTrue(score1.totalScore > score2.totalScore, "Creator1 should have higher score");

        // === Phase 6: Finalize Epoch with Revenue Distribution ===
        uint256[] memory scores = new uint256[](2);
        scores[0] = score1.totalScore;
        scores[1] = score2.totalScore;

        revenuePool.submitEpochScores(0, creators, scores);

        (,, bool finalized) = revenuePool.getEpochRevenue(0);
        assertTrue(finalized, "Epoch should be finalized");

        // === Phase 7: Claim Revenue ===
        uint256 claimable1 = revenuePool.getClaimable(creator1, 0);
        uint256 claimable2 = revenuePool.getClaimable(creator2, 0);
        assertTrue(claimable1 > 0, "Creator1 should have claimable amount");
        assertTrue(claimable2 > 0, "Creator2 should have claimable amount");
        assertTrue(claimable1 > claimable2, "Creator1 should get more than creator2");

        uint256 bal1Before = creator1.balance;
        vm.prank(creator1);
        revenuePool.claimRevenue(0);
        assertTrue(creator1.balance > bal1Before, "Creator1 should receive ETH");

        uint256 bal2Before = creator2.balance;
        vm.prank(creator2);
        revenuePool.claimRevenue(0);
        assertTrue(creator2.balance > bal2Before, "Creator2 should receive ETH");

        // Verify no more claims possible
        assertEq(revenuePool.getClaimable(creator1, 0), 0, "Creator1 should have 0 claimable after claim");
        assertEq(revenuePool.getClaimable(creator2, 0), 0, "Creator2 should have 0 claimable after claim");
    }

    /// @notice Test agent status lifecycle: Active -> Paused -> Active -> Terminated
    function test_agentStatusLifecycle() public {
        vm.deal(creator1, 1 ether);
        vm.prank(creator1);
        address agent = factory.deployAgent{ value: DEPLOY_FEE }("Agent1", "A1", "ipfs://agent1");

        // Active -> Paused
        vm.prank(creator1);
        registry.updateAgentStatus(agent, IAgentRegistry.AgentStatus.Paused);
        IAgentRegistry.AgentInfo memory info = registry.getAgent(agent);
        assertEq(uint256(info.status), uint256(IAgentRegistry.AgentStatus.Paused));

        // Paused -> Active
        vm.prank(creator1);
        registry.updateAgentStatus(agent, IAgentRegistry.AgentStatus.Active);
        info = registry.getAgent(agent);
        assertEq(uint256(info.status), uint256(IAgentRegistry.AgentStatus.Active));

        // Active -> Terminated
        vm.prank(creator1);
        registry.updateAgentStatus(agent, IAgentRegistry.AgentStatus.Terminated);
        info = registry.getAgent(agent);
        assertEq(uint256(info.status), uint256(IAgentRegistry.AgentStatus.Terminated));
    }

    /// @notice Test multi-epoch revenue distribution
    function test_multiEpochRevenue() public {
        vm.deal(creator1, 1 ether);
        vm.prank(creator1);
        factory.deployAgent{ value: DEPLOY_FEE }("Agent1", "A1", "ipfs://agent1");

        // Epoch 0: Deposit and finalize
        vm.deal(deployer, 10 ether);
        revenuePool.deposit{ value: 2 ether }();

        address[] memory creators = new address[](1);
        creators[0] = creator1;

        uint256[] memory scores = new uint256[](1);
        scores[0] = 10_000;

        revenuePool.submitEpochScores(0, creators, scores);

        vm.prank(creator1);
        revenuePool.claimRevenue(0);

        // Advance to epoch 1
        vm.warp(block.timestamp + 7 days);
        assertEq(revenuePool.getCurrentEpoch(), 1, "Should be epoch 1");

        // Epoch 1: Deposit and finalize
        revenuePool.deposit{ value: 3 ether }();
        revenuePool.submitEpochScores(1, creators, scores);

        uint256 claimable = revenuePool.getClaimable(creator1, 1);
        assertTrue(claimable > 0, "Creator should have claimable for epoch 1");

        vm.prank(creator1);
        revenuePool.claimRevenue(1);
    }

    /// @notice Test x402 payment to revenue pool pipeline
    function test_x402ToRevenuePoolPipeline() public {
        // Setup resource
        bytes32 resourceId = keccak256("api-call");
        paymentGate.setResourcePrice(resourceId, 50e6); // 50 USDC

        // Fund payer
        usdc.mint(payer, 500e6);
        vm.prank(payer);
        usdc.approve(address(paymentGate), type(uint256).max);

        // Process payments
        for (uint256 i; i < 5; ++i) {
            paymentGate.processPayment(payer, 50e6, resourceId);
        }

        assertEq(paymentGate.accumulatedRevenue(), 250e6, "Should accumulate 250 USDC");

        // Route to revenue pool
        paymentGate.routeRevenue();
        assertEq(usdc.balanceOf(address(revenuePool)), 250e6, "RevenuePool should receive 250 USDC");
    }
}
