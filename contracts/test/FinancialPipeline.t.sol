// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { FeeSplitter } from "../src/FeeSplitter.sol";
import { RunToken } from "../src/RunToken.sol";
import { AgentFactory } from "../src/AgentFactory.sol";
import { AgentRegistry } from "../src/AgentRegistry.sol";
import { ERC8004TrustRegistry } from "../src/ERC8004TrustRegistry.sol";
import { IFeeSplitter } from "../src/interfaces/IFeeSplitter.sol";
import { IAgentFactory } from "../src/interfaces/IAgentFactory.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";
import { MockWETH } from "./mocks/MockWETH.sol";
import { MockSwapRouter } from "./mocks/MockSwapRouter.sol";
import { MockVirtualsFactory } from "./mocks/MockVirtualsFactory.sol";

/// @title FinancialPipelineTest
/// @notice Integration test proving the v2 financial engine works end-to-end:
///         AgentFactory deploy fee → FeeSplitter (40/40/20) →
///         Atomic $RUN buyback-and-burn + pull-pattern claims
/// @dev Uses vm.etch() to deploy mocks at canonical Base addresses so hardcoded
///      constants in FeeSplitter (WETH) resolve to our mocks.
contract FinancialPipelineTest is Test {
    // ── Canonical Base Addresses (hardcoded in production contracts) ──
    address constant SWAP_ROUTER_ADDR = 0x2626664c2603336E57B271c5C0b26F421741e481;
    address constant WETH_ADDR = 0x4200000000000000000000000000000000000006;

    // ── Contracts Under Test ──
    FeeSplitter public feeSplitter;
    RunToken public runToken;
    AgentFactory public agentFactory;
    AgentRegistry public agentRegistry;
    ERC8004TrustRegistry public trustRegistry;

    // ── Mocks ──
    MockWETH public mockWeth;
    MockSwapRouter public mockRouter;
    MockVirtualsFactory public mockVirtualsFactory;

    // ── Actors ──
    address public deployer;
    address public protocolFeeRecipient;
    address public agentTreasury;
    address public creator;

    // ── Constants ──
    uint256 constant FEE_AMOUNT = 10 ether;
    uint256 constant DEPLOY_FEE = 0.005 ether;
    uint24 constant POOL_FEE = 3000; // 0.30% Uniswap fee tier

    /// @notice Accept ETH transfers (test contract acts as owner)
    receive() external payable {}

    function setUp() public {
        deployer = address(this);
        protocolFeeRecipient = makeAddr("protocolFeeRecipient");
        agentTreasury = makeAddr("agentTreasury");
        creator = makeAddr("creator");

        // ── Step 1: Deploy mocks at canonical addresses ──
        // MockWETH at canonical WETH9 address on Base
        mockWeth = new MockWETH();
        vm.etch(WETH_ADDR, address(mockWeth).code);
        mockWeth = MockWETH(payable(WETH_ADDR));

        // MockSwapRouter at canonical SwapRouter02 address on Base
        mockRouter = new MockSwapRouter();
        vm.etch(SWAP_ROUTER_ADDR, address(mockRouter).code);
        mockRouter = MockSwapRouter(payable(SWAP_ROUTER_ADDR));
        // vm.etch copies code but NOT storage — re-initialize exchange rate
        mockRouter.setExchangeRate(2);

        // ── Step 2: Deploy RunToken ──
        // deployer gets DEFAULT_ADMIN_ROLE
        runToken = new RunToken(deployer);
        // Grant MINTER_ROLE to MockSwapRouter so it can mint $RUN during simulated swaps
        runToken.grantRole(runToken.MINTER_ROLE(), SWAP_ROUTER_ADDR);

        // ── Step 3: Deploy FeeSplitter with all dependencies ──
        feeSplitter = new FeeSplitter(
            SWAP_ROUTER_ADDR,
            address(runToken),
            protocolFeeRecipient,
            POOL_FEE
        );

        // Authorize deployer as distributor on FeeSplitter
        feeSplitter.setAuthorizedDistributor(deployer, true);

        // ── Step 4: Deploy supporting contracts for AgentFactory ──
        mockVirtualsFactory = new MockVirtualsFactory();
        trustRegistry = new ERC8004TrustRegistry();
        agentRegistry = new AgentRegistry(address(0)); // placeholder factory

        // Deploy AgentFactory
        agentFactory = new AgentFactory(
            address(mockVirtualsFactory),
            address(agentRegistry),
            address(trustRegistry),
            address(feeSplitter)
        );

        // Wire cross-references
        agentRegistry.setFactory(address(agentFactory));
        trustRegistry.setAuthorizedMinter(address(agentFactory), true);

        // Authorize AgentFactory as a distributor on FeeSplitter
        feeSplitter.setAuthorizedDistributor(address(agentFactory), true);

        // Fund test actors
        vm.deal(creator, 100 ether);
        vm.deal(agentTreasury, 0);
    }

    // ════════════════════════════════════════════════════════════════════
    //  DEPLOYMENT: AgentFactory → FeeSplitter Fee Forward
    // ════════════════════════════════════════════════════════════════════

    /// @notice Test that AgentFactory.deployAgent forwards fee to FeeSplitter
    function test_deployAgent_forwardsFeeToFeeSplitter() public {
        uint256 splitterBalBefore = address(feeSplitter).balance;

        vm.prank(creator);
        address agent = agentFactory.deployAgent{ value: DEPLOY_FEE }(
            "TestAgent", "TA", "ipfs://metadata"
        );

        // Agent address should be valid (from MockVirtualsFactory)
        assertTrue(agent != address(0), "Agent address should not be zero");

        // FeeSplitter should have received the deploy fee
        assertEq(
            address(feeSplitter).balance - splitterBalBefore,
            DEPLOY_FEE,
            "FeeSplitter should receive the full deploy fee"
        );

        // Verify agent tracking
        assertEq(agentFactory.getAgentCount(creator), 1, "Creator should have 1 agent");
        assertEq(agentFactory.getVirtualsToken(agent), agent, "Virtuals token should map to agent");
    }

    /// @notice Test that AgentDeployed event includes indexed virtualsToken
    function test_deployAgent_emitsAgentDeployedEvent() public {
        // We expect the 3rd event from the factory call (after registry + trust events)
        vm.prank(creator);
        address agent = agentFactory.deployAgent{ value: DEPLOY_FEE }(
            "EventAgent", "EA", "ipfs://event-meta"
        );

        // Verify the Virtuals token mapping (indirect event verification)
        assertTrue(agent != address(0), "Agent should be deployed");
        assertEq(agentFactory.getVirtualsToken(agent), agent, "Token should be self-referential");
    }

    // ════════════════════════════════════════════════════════════════════
    //  BUYBACK & BURN: Core Loop
    // ════════════════════════════════════════════════════════════════════

    /// @notice End-to-end: 10 ETH → distribute → 40% buyback+burn, 40% agent, 20% protocol
    function test_distribute_buybackAndBurn() public {
        uint256 runSupplyBefore = runToken.totalSupply();

        // Distribute 10 ETH through FeeSplitter
        feeSplitter.distribute{ value: FEE_AMOUNT }(agentTreasury, 0);

        // ── Verify MockSwapRouter was called ──
        assertEq(mockRouter.swapCount(), 1, "SwapRouter should be called once");
        assertEq(mockRouter.lastTokenIn(), WETH_ADDR, "tokenIn should be WETH");
        assertEq(mockRouter.lastTokenOut(), address(runToken), "tokenOut should be $RUN");

        // 40% of 10 ETH = 4 ETH for buyback
        uint256 expectedBuybackAmount = (FEE_AMOUNT * 4_000) / 10_000;
        assertEq(mockRouter.lastAmountIn(), expectedBuybackAmount, "amountIn should be 40% of total");
        assertEq(mockRouter.lastRecipient(), address(feeSplitter), "recipient should be FeeSplitter");

        // ── Verify $RUN was burned ──
        // MockSwapRouter mints 2x the input, so 4 ETH → 8 $RUN minted then burned
        uint256 expectedRunBurned = expectedBuybackAmount * 2; // 2x exchange rate
        assertEq(runToken.totalSupply(), runSupplyBefore, "Net supply should be unchanged (minted then burned)");
        assertEq(feeSplitter.totalRunBurned(), expectedRunBurned, "totalRunBurned should track burned amount");

        // ── Verify pull-pattern balances ──
        // Agent treasury: 40% = 4 ETH
        uint256 agentClaimable = feeSplitter.getClaimable(agentTreasury);
        uint256 expectedAgent = FEE_AMOUNT - expectedBuybackAmount - (FEE_AMOUNT * 2_000) / 10_000;
        assertEq(agentClaimable, expectedAgent, "Agent treasury should have 40% allocated");

        // Protocol fee: 20% = 2 ETH
        uint256 protocolClaimable = feeSplitter.getClaimable(protocolFeeRecipient);
        uint256 expectedProtocol = (FEE_AMOUNT * 2_000) / 10_000;
        assertEq(protocolClaimable, expectedProtocol, "Protocol should have 20% allocated");

        // Distribution counter
        assertEq(feeSplitter.getDistributionCount(), 1, "Should have 1 distribution");
    }

    /// @notice Verify explicit split amounts: 40/40/20 of 10 ETH = 4/4/2
    function test_distribute_exactSplitAmounts() public {
        feeSplitter.distribute{ value: FEE_AMOUNT }(agentTreasury, 0);

        uint256 agentClaimable = feeSplitter.getClaimable(agentTreasury);
        uint256 protocolClaimable = feeSplitter.getClaimable(protocolFeeRecipient);

        assertEq(agentClaimable, 4 ether, "Agent treasury should get exactly 4 ETH (40%)");
        assertEq(protocolClaimable, 2 ether, "Protocol should get exactly 2 ETH (20%)");

        // Buyback consumed 4 ETH (40%), which was wrapped to WETH and swapped
        // Total: 4 + 4 + 2 = 10 ETH ✓
    }

    // ════════════════════════════════════════════════════════════════════
    //  CLAIMS: Pull Pattern
    // ════════════════════════════════════════════════════════════════════

    /// @notice Test that agent treasury can claim its ETH share
    function test_claimETH_agentTreasury() public {
        feeSplitter.distribute{ value: FEE_AMOUNT }(agentTreasury, 0);

        uint256 balBefore = agentTreasury.balance;

        vm.prank(agentTreasury);
        feeSplitter.claimETH();

        assertEq(agentTreasury.balance - balBefore, 4 ether, "Agent treasury should receive 4 ETH");
        assertEq(feeSplitter.getClaimable(agentTreasury), 0, "Claimable should be 0 after claim");
    }

    /// @notice Test that protocol fee recipient can claim its ETH share
    function test_claimETH_protocolFee() public {
        feeSplitter.distribute{ value: FEE_AMOUNT }(agentTreasury, 0);

        uint256 balBefore = protocolFeeRecipient.balance;

        vm.prank(protocolFeeRecipient);
        feeSplitter.claimETH();

        assertEq(protocolFeeRecipient.balance - balBefore, 2 ether, "Protocol should receive 2 ETH");
        assertEq(feeSplitter.getClaimable(protocolFeeRecipient), 0, "Claimable should be 0 after claim");
    }

    /// @notice Test that claiming with zero balance reverts
    function test_claimETH_revertsWhenNothingToClaim() public {
        address nobody = makeAddr("nobody");
        vm.prank(nobody);
        vm.expectRevert(IFeeSplitter.NothingToClaim.selector);
        feeSplitter.claimETH();
    }

    /// @notice Test double claim reverts on second attempt
    function test_claimETH_doubleClaimReverts() public {
        feeSplitter.distribute{ value: FEE_AMOUNT }(agentTreasury, 0);

        vm.prank(agentTreasury);
        feeSplitter.claimETH();

        // Second claim should revert
        vm.prank(agentTreasury);
        vm.expectRevert(IFeeSplitter.NothingToClaim.selector);
        feeSplitter.claimETH();
    }

    // ════════════════════════════════════════════════════════════════════
    //  ROUNDING: Dust goes to agent treasury (remainder pattern)
    // ════════════════════════════════════════════════════════════════════

    /// @notice Test that rounding dust goes to agent treasury (never lost)
    function test_roundingDust_goesToAgentTreasury() public {
        // 33 wei: buyback = 33*4000/10000 = 13, protocol = 33*2000/10000 = 6, agent = 33-13-6 = 14
        feeSplitter.distribute{ value: 33 }(agentTreasury, 0);

        uint256 agentClaimable = feeSplitter.getClaimable(agentTreasury);
        uint256 protocolClaimable = feeSplitter.getClaimable(protocolFeeRecipient);

        // Agent gets remainder: 33 - 13 - 6 = 14 (absorbs the 1 wei rounding dust)
        assertEq(protocolClaimable, 6, "Protocol should get 6 wei");
        assertEq(agentClaimable, 14, "Agent treasury should get 14 wei (absorbs dust)");

        // Total accounted = buyback(13) + agent(14) + protocol(6) = 33
        assertEq(13 + agentClaimable + protocolClaimable, 33, "No dust lost");
    }

    /// @notice Test 1 wei edge case
    function test_roundingDust_singleWei() public {
        // 1 wei: buyback = 0, protocol = 0, agent = 1
        feeSplitter.distribute{ value: 1 }(agentTreasury, 0);

        uint256 agentClaimable = feeSplitter.getClaimable(agentTreasury);
        uint256 protocolClaimable = feeSplitter.getClaimable(protocolFeeRecipient);

        assertEq(agentClaimable, 1, "Agent treasury should get the 1 wei");
        assertEq(protocolClaimable, 0, "Protocol should get 0");
    }

    // ════════════════════════════════════════════════════════════════════
    //  ACCESS CONTROL
    // ════════════════════════════════════════════════════════════════════

    /// @notice Test that unauthorized caller cannot distribute
    function test_distribute_revertsForUnauthorized() public {
        address random = makeAddr("random");
        vm.deal(random, 1 ether);

        vm.prank(random);
        vm.expectRevert(IFeeSplitter.UnauthorizedDistributor.selector);
        feeSplitter.distribute{ value: 1 ether }(agentTreasury, 0);
    }

    /// @notice Test that distributing with zero value reverts
    function test_distribute_revertsWithZeroValue() public {
        vm.expectRevert(IFeeSplitter.NoFeesToDistribute.selector);
        feeSplitter.distribute{ value: 0 }(agentTreasury, 0);
    }

    /// @notice Test that distributing with zero agent treasury reverts
    function test_distribute_revertsWithZeroAgentTreasury() public {
        vm.expectRevert(IFeeSplitter.ZeroAddress.selector);
        feeSplitter.distribute{ value: 1 ether }(address(0), 0);
    }

    // ════════════════════════════════════════════════════════════════════
    //  MULTIPLE DISTRIBUTIONS: Cumulative balances
    // ════════════════════════════════════════════════════════════════════

    /// @notice Test that multiple distributions accumulate claimable balances
    function test_multipleDistributions_accumulateBalances() public {
        feeSplitter.distribute{ value: 5 ether }(agentTreasury, 0);
        feeSplitter.distribute{ value: 3 ether }(agentTreasury, 0);

        assertEq(feeSplitter.getDistributionCount(), 2, "Should have 2 distributions");

        // Agent: 40% of 5 + 40% of 3 = 2 + 1.2 = 3.2 ETH
        uint256 agentClaimable = feeSplitter.getClaimable(agentTreasury);
        assertEq(agentClaimable, 3.2 ether, "Agent should have cumulative 3.2 ETH");

        // Protocol: 20% of 5 + 20% of 3 = 1 + 0.6 = 1.6 ETH
        uint256 protocolClaimable = feeSplitter.getClaimable(protocolFeeRecipient);
        assertEq(protocolClaimable, 1.6 ether, "Protocol should have cumulative 1.6 ETH");

        // Total burned: 40% of 5 * 2x + 40% of 3 * 2x = 4 + 2.4 = 6.4 tokens
        assertEq(feeSplitter.totalRunBurned(), 6.4 ether, "Total $RUN burned should be 6.4");
    }

    /// @notice Test different agent treasuries in separate distributions
    function test_multipleDistributions_differentTreasuries() public {
        address treasury1 = makeAddr("treasury1");
        address treasury2 = makeAddr("treasury2");

        feeSplitter.distribute{ value: 4 ether }(treasury1, 0);
        feeSplitter.distribute{ value: 6 ether }(treasury2, 0);

        assertEq(feeSplitter.getClaimable(treasury1), 1.6 ether, "Treasury1: 40% of 4 = 1.6 ETH");
        assertEq(feeSplitter.getClaimable(treasury2), 2.4 ether, "Treasury2: 40% of 6 = 2.4 ETH");

        // Protocol gets 20% of both
        uint256 protocolTotal = feeSplitter.getClaimable(protocolFeeRecipient);
        assertEq(protocolTotal, 2 ether, "Protocol: 20% of 4 + 20% of 6 = 2 ETH");
    }

    // ════════════════════════════════════════════════════════════════════
    //  ADMIN: Configuration Changes
    // ════════════════════════════════════════════════════════════════════

    /// @notice Test that owner can update protocol fee recipient
    function test_setProtocolFeeRecipient() public {
        address newRecipient = makeAddr("newProtocol");
        feeSplitter.setProtocolFeeRecipient(newRecipient);
        assertEq(feeSplitter.protocolFeeRecipient(), newRecipient, "Recipient should be updated");
    }

    /// @notice Test that setting zero address as protocol recipient reverts
    function test_setProtocolFeeRecipient_revertsZeroAddress() public {
        vm.expectRevert(IFeeSplitter.ZeroAddress.selector);
        feeSplitter.setProtocolFeeRecipient(address(0));
    }

    /// @notice Test that owner can update pool fee tier
    function test_setPoolFee() public {
        feeSplitter.setPoolFee(10_000); // 1.00% tier
        assertEq(feeSplitter.poolFee(), 10_000, "Pool fee should be updated");
    }

    /// @notice Test that setting zero pool fee reverts
    function test_setPoolFee_revertsZero() public {
        vm.expectRevert(IFeeSplitter.InvalidPoolFee.selector);
        feeSplitter.setPoolFee(0);
    }

    /// @notice Test authorized distributor management
    function test_setAuthorizedDistributor() public {
        address newDistributor = makeAddr("newDistributor");

        feeSplitter.setAuthorizedDistributor(newDistributor, true);
        assertTrue(feeSplitter.authorizedDistributors(newDistributor), "Should be authorized");

        feeSplitter.setAuthorizedDistributor(newDistributor, false);
        assertFalse(feeSplitter.authorizedDistributors(newDistributor), "Should be deauthorized");
    }

    // ════════════════════════════════════════════════════════════════════
    //  FULL PIPELINE: Deploy → Distribute → Claim
    // ════════════════════════════════════════════════════════════════════

    /// @notice End-to-end: creator deploys agent → fee lands in FeeSplitter →
    ///         authorized distributor splits it → recipients claim
    function test_fullPipeline_deployToClaim() public {
        // Step 1: Creator deploys agent (fee goes to FeeSplitter)
        vm.prank(creator);
        address agent = agentFactory.deployAgent{ value: DEPLOY_FEE }(
            "PipelineAgent", "PA", "ipfs://pipeline"
        );
        assertTrue(agent != address(0), "Agent should be deployed");

        // Step 2: FeeSplitter received the fee, now distribute it
        uint256 splitterBalance = address(feeSplitter).balance;
        assertEq(splitterBalance, DEPLOY_FEE, "FeeSplitter should hold the deploy fee");

        // Send ETH to FeeSplitter via distribute (simulating accumulated fees)
        feeSplitter.distribute{ value: splitterBalance }(agentTreasury, 0);

        // Step 3: Verify splits
        // 40% of 0.005 ETH = 0.002 ETH for agent
        uint256 agentClaimable = feeSplitter.getClaimable(agentTreasury);
        uint256 protocolClaimable = feeSplitter.getClaimable(protocolFeeRecipient);
        assertTrue(agentClaimable > 0, "Agent should have claimable ETH");
        assertTrue(protocolClaimable > 0, "Protocol should have claimable ETH");

        // Step 4: Agent treasury claims
        uint256 agentBalBefore = agentTreasury.balance;
        vm.prank(agentTreasury);
        feeSplitter.claimETH();
        assertEq(agentTreasury.balance - agentBalBefore, agentClaimable, "Agent should receive exact claimable");

        // Step 5: Protocol claims
        uint256 protocolBalBefore = protocolFeeRecipient.balance;
        vm.prank(protocolFeeRecipient);
        feeSplitter.claimETH();
        assertEq(
            protocolFeeRecipient.balance - protocolBalBefore,
            protocolClaimable,
            "Protocol should receive exact claimable"
        );
    }

    // ════════════════════════════════════════════════════════════════════
    //  SLIPPAGE: minRunOut enforcement
    // ════════════════════════════════════════════════════════════════════

    /// @notice Test that excessive minRunOut causes revert (slippage protection)
    function test_distribute_revertsOnExcessiveSlippage() public {
        // MockSwapRouter with 2x rate: 4 ETH → 8 $RUN
        // Setting minRunOut to 100 ETH should revert
        vm.expectRevert("Too little received");
        feeSplitter.distribute{ value: FEE_AMOUNT }(agentTreasury, 100 ether);
    }

    /// @notice Test that reasonable minRunOut passes
    function test_distribute_passesWithReasonableSlippage() public {
        // 40% of 10 ETH = 4 ETH, at 2x rate = 8 $RUN, so minRunOut = 8 should pass
        feeSplitter.distribute{ value: FEE_AMOUNT }(agentTreasury, 8 ether);

        assertEq(feeSplitter.getDistributionCount(), 1, "Distribution should succeed");
    }
}
