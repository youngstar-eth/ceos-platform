// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { FeeSplitter } from "../src/FeeSplitter.sol";
import { ScoutFund } from "../src/ScoutFund.sol";
import { AgentTreasury } from "../src/AgentTreasury.sol";
import { IFeeSplitter } from "../src/interfaces/IFeeSplitter.sol";
import { IScoutFund } from "../src/interfaces/IScoutFund.sol";
import { IAgentTreasury } from "../src/interfaces/IAgentTreasury.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";
import { MockWETH } from "./mocks/MockWETH.sol";
import { MockSwapRouter } from "./mocks/MockSwapRouter.sol";

/// @title FinancialPipelineTest
/// @notice Integration test proving the v2 financial engine works end-to-end:
///         Fees → FeeSplitter (40/40/20) → ScoutFund pull → Invest via Uniswap V3
/// @dev Uses vm.etch() to deploy mocks at canonical Base addresses so hardcoded
///      constants in ScoutFund and AgentTreasury resolve to our mocks.
contract FinancialPipelineTest is Test {
    // ── Canonical Base Addresses (hardcoded in production contracts) ──
    address constant SWAP_ROUTER_ADDR = 0x2626664c2603336E57B271c5C0b26F421741e481;
    address constant WETH_ADDR = 0x4200000000000000000000000000000000000006;

    // ── Contracts Under Test ──
    FeeSplitter public feeSplitter;
    ScoutFund public scoutFund;
    AgentTreasury public treasuryImpl;

    // ── Mocks ──
    MockERC20 public usdc;
    MockERC20 public agentToken;
    MockWETH public mockWeth;
    MockSwapRouter public mockRouter;

    // ── Actors ──
    address public deployer;
    address public protocolTreasury;
    address public scoutWorker;
    address public agentTreasuryAddr;
    address public controller;
    address public creator;

    // ── Constants ──
    uint256 constant FEE_AMOUNT = 10 ether;
    uint256 constant USDC_FEE_AMOUNT = 10_000e6; // 10,000 USDC

    /// @notice Accept ETH transfers (test contract is the owner of ScoutFund and receives emergencyWithdraw)
    receive() external payable {}

    function setUp() public {
        deployer = address(this);
        protocolTreasury = makeAddr("protocolTreasury");
        scoutWorker = makeAddr("scoutWorker");
        controller = makeAddr("controller");
        creator = makeAddr("creator");

        // ── Step 1: Deploy mocks at canonical addresses ──
        // Deploy MockWETH and copy bytecode to the canonical WETH9 address
        mockWeth = new MockWETH();
        vm.etch(WETH_ADDR, address(mockWeth).code);
        // Re-point to the canonical address for test interactions
        mockWeth = MockWETH(payable(WETH_ADDR));

        // Deploy MockSwapRouter and copy bytecode to canonical SwapRouter02 address
        mockRouter = new MockSwapRouter();
        vm.etch(SWAP_ROUTER_ADDR, address(mockRouter).code);
        mockRouter = MockSwapRouter(payable(SWAP_ROUTER_ADDR));
        // vm.etch copies code but NOT storage — re-initialize the exchange rate
        mockRouter.setExchangeRate(2);

        // Deploy mock tokens
        usdc = new MockERC20("USD Coin", "USDC", 6);
        agentToken = new MockERC20("Agent Token", "AGENT", 18);

        // ── Step 2: Deploy FeeSplitter ──
        // We need the ScoutFund address before deploying FeeSplitter, but ScoutFund
        // needs FeeSplitter in its constructor. Use CREATE2 prediction or deploy in order.
        // Solution: Deploy ScoutFund first with a temporary FeeSplitter address, then update.
        // Actually, ScoutFund stores feeSplitter as immutable, so we must know FeeSplitter addr.
        // Use vm.computeCreateAddress to predict FeeSplitter's address.
        //
        // Simpler approach: Deploy FeeSplitter with a temporary scoutFund, then deploy ScoutFund,
        // then update FeeSplitter's scoutFund address via setScoutFund().

        // Deploy with a temporary scoutFund placeholder
        feeSplitter = new FeeSplitter(
            protocolTreasury,
            address(1), // temporary placeholder for scoutFund
            address(usdc)
        );

        // ── Step 3: Deploy ScoutFund (needs feeSplitter address) ──
        scoutFund = new ScoutFund(
            address(feeSplitter),
            address(usdc)
        );

        // Update FeeSplitter to point to real ScoutFund
        feeSplitter.setScoutFund(address(scoutFund));

        // ── Step 4: Configure access control ──
        // Authorize deployer as distributor on FeeSplitter
        feeSplitter.setAuthorizedDistributor(deployer, true);

        // Authorize scout worker on ScoutFund
        scoutFund.setScoutWorker(scoutWorker, true);

        // Whitelist the agent token for investment
        scoutFund.setScoutableToken(address(agentToken), true);

        // ── Step 5: Create a mock AgentTreasury (uses an address that can receive ETH) ──
        agentTreasuryAddr = makeAddr("agentTreasury");
        vm.deal(agentTreasuryAddr, 0);
    }

    // ════════════════════════════════════════════════════════════════════
    //  HAPPY PATH: Full ETH Financial Pipeline
    // ════════════════════════════════════════════════════════════════════

    /// @notice End-to-end test: 10 ETH fees → 40/40/20 split → ScoutFund pulls 2 ETH → invests
    function test_fullETHPipeline() public {
        // ── Step 1: Ingest — Send 10 ETH to FeeSplitter as protocol fees ──
        feeSplitter.distributeFees{ value: FEE_AMOUNT }(agentTreasuryAddr);

        // Verify allocation was recorded
        assertEq(feeSplitter.getDistributionCount(), 1, "Should have 1 distribution");

        // ── Step 2: Verify 40/40/20 split allocations ──
        // ScoutFund should have 20% = 2 ETH allocated
        (uint256 scoutETH,) = feeSplitter.getClaimable(address(scoutFund));
        assertEq(scoutETH, 2 ether, "ScoutFund should have 2 ETH allocated (20%)");

        // Protocol treasury should have 40% = 4 ETH allocated
        (uint256 buybackETH,) = feeSplitter.getClaimable(protocolTreasury);
        assertEq(buybackETH, 4 ether, "ProtocolTreasury should have 4 ETH allocated (40%)");

        // Agent treasury should have 40% = 4 ETH allocated (gets remainder for rounding)
        (uint256 growthETH,) = feeSplitter.getClaimable(agentTreasuryAddr);
        assertEq(growthETH, 4 ether, "AgentTreasury should have 4 ETH allocated (40%)");

        // Total allocated should equal total input
        assertEq(scoutETH + buybackETH + growthETH, FEE_AMOUNT, "Total allocation should equal input");

        // ── Step 3: Pull — ScoutFund claims its share from FeeSplitter ──
        uint256 scoutBalBefore = address(scoutFund).balance;
        scoutFund.claimFundingETH();
        uint256 scoutBalAfter = address(scoutFund).balance;

        assertEq(scoutBalAfter - scoutBalBefore, 2 ether, "ScoutFund should receive 2 ETH");

        // Verify FeeSplitter allocation is now zero
        (uint256 scoutETHAfter,) = feeSplitter.getClaimable(address(scoutFund));
        assertEq(scoutETHAfter, 0, "ScoutFund claimable should be 0 after claim");

        // ── Step 4: Invest — ScoutFund invests 1 ETH into agent token via Uniswap ──
        uint256 investAmount = 1 ether;

        vm.prank(scoutWorker);
        uint256 tokensAcquired = scoutFund.invest(
            address(agentToken), // agentToken to buy
            WETH_ADDR,           // pay with WETH (auto-wraps from ETH)
            investAmount,        // invest 1 ETH
            3000,                // 0.3% fee tier
            0                    // no minimum (mock always succeeds)
        );

        // Verify swap executed: MockSwapRouter uses 2x exchange rate
        assertEq(tokensAcquired, investAmount * 2, "Should receive 2x agent tokens (mock rate)");

        // Verify ScoutFund holds the agent tokens
        assertEq(agentToken.balanceOf(address(scoutFund)), investAmount * 2, "ScoutFund should hold agent tokens");

        // Verify position tracking
        IScoutFund.Position memory pos = scoutFund.getPosition(address(agentToken));
        assertEq(pos.token, address(agentToken), "Position token should match");
        assertEq(pos.totalInvested, investAmount, "Position totalInvested should be 1 ETH");
        assertEq(pos.totalTokensAcquired, investAmount * 2, "Position totalTokensAcquired should be 2x");
        assertEq(pos.investmentCount, 1, "Position investmentCount should be 1");
        assertTrue(pos.firstInvestedAt > 0, "firstInvestedAt should be set");
        assertEq(pos.firstInvestedAt, pos.lastInvestedAt, "First and last should match on single invest");

        // Verify ScoutFund's remaining ETH balance (had 2 ETH, invested 1)
        assertEq(address(scoutFund).balance, 1 ether, "ScoutFund should have 1 ETH remaining");

        // Verify portfolio view
        assertEq(scoutFund.getPositionCount(), 1, "Should have 1 position");
        IScoutFund.HoldingSummary[] memory holdings = scoutFund.getFundHoldings();
        assertEq(holdings.length, 1, "Holdings array should have 1 entry");
        assertEq(holdings[0].token, address(agentToken), "Holdings token should match");
        assertEq(holdings[0].currentBalance, investAmount * 2, "Holdings balance should match");
    }

    // ════════════════════════════════════════════════════════════════════
    //  USDC Pipeline
    // ════════════════════════════════════════════════════════════════════

    /// @notice Test USDC pipeline: distribute USDC fees → ScoutFund claims USDC
    function test_USDCDistributionAndClaim() public {
        // Mint USDC to deployer and approve FeeSplitter
        usdc.mint(deployer, USDC_FEE_AMOUNT);
        usdc.approve(address(feeSplitter), USDC_FEE_AMOUNT);

        // Distribute USDC fees
        feeSplitter.distributeUSDCFees(agentTreasuryAddr, USDC_FEE_AMOUNT);

        // Verify USDC allocations
        (, uint256 scoutUSDC) = feeSplitter.getClaimable(address(scoutFund));
        assertEq(scoutUSDC, 2_000e6, "ScoutFund should have 2,000 USDC allocated (20%)");

        (, uint256 buybackUSDC) = feeSplitter.getClaimable(protocolTreasury);
        assertEq(buybackUSDC, 4_000e6, "ProtocolTreasury should have 4,000 USDC (40%)");

        (, uint256 growthUSDC) = feeSplitter.getClaimable(agentTreasuryAddr);
        assertEq(growthUSDC, 4_000e6, "AgentTreasury should have 4,000 USDC (40%)");

        // ScoutFund claims USDC
        scoutFund.claimFundingUSDC();

        assertEq(usdc.balanceOf(address(scoutFund)), 2_000e6, "ScoutFund should hold 2,000 USDC");

        (, uint256 scoutUSDCAfter) = feeSplitter.getClaimable(address(scoutFund));
        assertEq(scoutUSDCAfter, 0, "ScoutFund USDC claimable should be 0 after claim");
    }

    // ════════════════════════════════════════════════════════════════════
    //  Multiple Investment Rounds
    // ════════════════════════════════════════════════════════════════════

    /// @notice Test multiple investment rounds with position accumulation
    function test_multipleInvestmentRounds() public {
        // Fund ScoutFund with 5 ETH and raise cap (default is 1 ETH)
        vm.deal(address(scoutFund), 5 ether);
        scoutFund.setMaxInvestmentPerToken(10 ether);

        // Round 1: Invest 1 ETH
        vm.prank(scoutWorker);
        scoutFund.invest(address(agentToken), WETH_ADDR, 1 ether, 3000, 0);

        // Round 2: Invest 2 ETH
        vm.warp(block.timestamp + 1 hours);
        vm.prank(scoutWorker);
        scoutFund.invest(address(agentToken), WETH_ADDR, 2 ether, 3000, 0);

        // Verify accumulated position
        IScoutFund.Position memory pos = scoutFund.getPosition(address(agentToken));
        assertEq(pos.totalInvested, 3 ether, "Total invested should be 3 ETH");
        assertEq(pos.totalTokensAcquired, 6 ether, "Total tokens should be 6 (3 ETH * 2x rate)");
        assertEq(pos.investmentCount, 2, "Should have 2 investments");
        assertTrue(pos.lastInvestedAt > pos.firstInvestedAt, "Last should be after first");

        // Verify remaining balance (5 - 3 = 2 ETH)
        assertEq(address(scoutFund).balance, 2 ether, "Should have 2 ETH remaining");
    }

    // ════════════════════════════════════════════════════════════════════
    //  Concentration Limit Enforcement
    // ════════════════════════════════════════════════════════════════════

    /// @notice Test that per-token investment cap is enforced
    function test_maxInvestmentPerToken() public {
        // Default max is 1 ETH, fund ScoutFund with 5 ETH
        vm.deal(address(scoutFund), 5 ether);

        // First investment: 0.5 ETH — should succeed
        vm.prank(scoutWorker);
        scoutFund.invest(address(agentToken), WETH_ADDR, 0.5 ether, 3000, 0);

        // Second investment: 0.6 ETH — would push total to 1.1 ETH, exceeding 1 ETH cap
        vm.prank(scoutWorker);
        vm.expectRevert(IScoutFund.MaxInvestmentExceeded.selector);
        scoutFund.invest(address(agentToken), WETH_ADDR, 0.6 ether, 3000, 0);

        // Exactly hitting the cap: 0.5 ETH — should succeed (total = 1.0 ETH)
        vm.prank(scoutWorker);
        scoutFund.invest(address(agentToken), WETH_ADDR, 0.5 ether, 3000, 0);

        // Verify position
        IScoutFund.Position memory pos = scoutFund.getPosition(address(agentToken));
        assertEq(pos.totalInvested, 1 ether, "Total invested should be exactly 1 ETH (the cap)");

        // Owner can raise the cap
        scoutFund.setMaxInvestmentPerToken(5 ether);

        // Now additional investment should succeed
        vm.prank(scoutWorker);
        scoutFund.invest(address(agentToken), WETH_ADDR, 2 ether, 3000, 0);

        pos = scoutFund.getPosition(address(agentToken));
        assertEq(pos.totalInvested, 3 ether, "Total invested should be 3 ETH after raising cap");
    }

    // ════════════════════════════════════════════════════════════════════
    //  Whitelist Gate
    // ════════════════════════════════════════════════════════════════════

    /// @notice Test that non-whitelisted tokens are rejected
    function test_investRejectsNonWhitelistedToken() public {
        MockERC20 randomToken = new MockERC20("Random", "RND", 18);
        vm.deal(address(scoutFund), 1 ether);

        vm.prank(scoutWorker);
        vm.expectRevert(IScoutFund.TokenNotScoutable.selector);
        scoutFund.invest(address(randomToken), WETH_ADDR, 0.5 ether, 3000, 0);
    }

    // ════════════════════════════════════════════════════════════════════
    //  Access Control
    // ════════════════════════════════════════════════════════════════════

    /// @notice Test that only authorized scout workers can invest
    function test_investRejectsUnauthorizedCaller() public {
        vm.deal(address(scoutFund), 1 ether);

        address random = makeAddr("random");
        vm.prank(random);
        vm.expectRevert(IScoutFund.UnauthorizedScoutWorker.selector);
        scoutFund.invest(address(agentToken), WETH_ADDR, 0.5 ether, 3000, 0);
    }

    /// @notice Test that owner can always invest (owner bypass in modifier)
    function test_ownerCanInvestDirectly() public {
        vm.deal(address(scoutFund), 1 ether);

        // Deployer is owner, should be able to invest without being a scout worker
        scoutFund.invest(address(agentToken), WETH_ADDR, 0.5 ether, 3000, 0);

        IScoutFund.Position memory pos = scoutFund.getPosition(address(agentToken));
        assertEq(pos.totalInvested, 0.5 ether, "Owner should have invested successfully");
    }

    // ════════════════════════════════════════════════════════════════════
    //  Divestment (Owner Only)
    // ════════════════════════════════════════════════════════════════════

    /// @notice Test that owner can divest (sell) agent tokens back to ETH
    function test_ownerCanDivest() public {
        // Fund and invest first
        vm.deal(address(scoutFund), 2 ether);
        scoutFund.invest(address(agentToken), WETH_ADDR, 1 ether, 3000, 0);

        uint256 agentTokenBalance = agentToken.balanceOf(address(scoutFund));
        assertEq(agentTokenBalance, 2 ether, "Should hold 2 agent tokens (1 ETH * 2x rate)");

        // Divest 1 agent token back to WETH
        // First, agentToken needs to approve SwapRouter (ScoutFund does this in divest())
        uint256 divestAmount = 1 ether; // Sell 1 agent token
        uint256 wethReceived = scoutFund.divest(
            address(agentToken),
            WETH_ADDR,
            divestAmount,
            3000,
            0
        );

        assertEq(wethReceived, divestAmount * 2, "Should receive 2x WETH (mock rate)");

        // Verify position tracking updated
        IScoutFund.Position memory pos = scoutFund.getPosition(address(agentToken));
        assertEq(pos.totalDivested, divestAmount, "totalDivested should reflect divested amount");
    }

    /// @notice Test that non-owner cannot divest
    function test_divestRejectsNonOwner() public {
        vm.deal(address(scoutFund), 1 ether);
        scoutFund.invest(address(agentToken), WETH_ADDR, 0.5 ether, 3000, 0);

        vm.prank(scoutWorker);
        vm.expectRevert();
        scoutFund.divest(address(agentToken), WETH_ADDR, 0.5 ether, 3000, 0);
    }

    // ════════════════════════════════════════════════════════════════════
    //  Emergency Withdrawal
    // ════════════════════════════════════════════════════════════════════

    /// @notice Test emergency withdrawal recovers all assets
    function test_emergencyWithdrawRecovery() public {
        // Fund ScoutFund with ETH and invest
        vm.deal(address(scoutFund), 3 ether);
        scoutFund.invest(address(agentToken), WETH_ADDR, 1 ether, 3000, 0);

        // Also mint some USDC to ScoutFund (simulating USDC claim)
        usdc.mint(address(scoutFund), 1_000e6);

        uint256 ownerBalBefore = deployer.balance;
        uint256 ownerUsdcBefore = usdc.balanceOf(deployer);
        uint256 ownerAgentBefore = agentToken.balanceOf(deployer);

        scoutFund.emergencyWithdraw();

        // Verify all assets transferred to owner
        assertTrue(deployer.balance > ownerBalBefore, "Owner should receive ETH");
        assertEq(usdc.balanceOf(deployer) - ownerUsdcBefore, 1_000e6, "Owner should receive USDC");
        assertEq(agentToken.balanceOf(deployer) - ownerAgentBefore, 2 ether, "Owner should receive agent tokens");

        // Verify ScoutFund is drained
        assertEq(address(scoutFund).balance, 0, "ScoutFund ETH should be 0");
        assertEq(usdc.balanceOf(address(scoutFund)), 0, "ScoutFund USDC should be 0");
        assertEq(agentToken.balanceOf(address(scoutFund)), 0, "ScoutFund agent tokens should be 0");
    }

    // ════════════════════════════════════════════════════════════════════
    //  Rounding Correctness
    // ════════════════════════════════════════════════════════════════════

    /// @notice Test that rounding dust goes to growth (never lost)
    function test_roundingDustGoesToGrowth() public {
        // Use an amount that doesn't divide evenly: 1 wei
        // 1 * 2000 / 10000 = 0 (scout), 1 * 4000 / 10000 = 0 (buyback), remainder = 1 (growth)
        feeSplitter.distributeFees{ value: 1 }(agentTreasuryAddr);

        (uint256 growthETH,) = feeSplitter.getClaimable(agentTreasuryAddr);
        (uint256 scoutETH,) = feeSplitter.getClaimable(address(scoutFund));
        (uint256 buybackETH,) = feeSplitter.getClaimable(protocolTreasury);

        // Growth should absorb the dust
        assertEq(growthETH + scoutETH + buybackETH, 1, "Total should equal 1 wei (no dust lost)");
        assertEq(growthETH, 1, "Growth should get the 1 wei (remainder)");

        // Use a tricky amount: 33 wei
        // Scout: 33 * 2000 / 10000 = 6 wei
        // Buyback: 33 * 4000 / 10000 = 13 wei
        // Growth: 33 - 6 - 13 = 14 wei (absorbs rounding dust)
        feeSplitter.distributeFees{ value: 33 }(agentTreasuryAddr);

        (uint256 g2,) = feeSplitter.getClaimable(agentTreasuryAddr);
        (uint256 s2,) = feeSplitter.getClaimable(address(scoutFund));
        (uint256 b2,) = feeSplitter.getClaimable(protocolTreasury);

        assertEq(g2 + s2 + b2, 34, "Total should equal 34 wei (1 + 33, cumulative)");
    }

    // ════════════════════════════════════════════════════════════════════
    //  Distribution Audit Trail
    // ════════════════════════════════════════════════════════════════════

    /// @notice Test that distribution records are stored correctly
    function test_distributionAuditTrail() public {
        feeSplitter.distributeFees{ value: 5 ether }(agentTreasuryAddr);
        feeSplitter.distributeFees{ value: 3 ether }(agentTreasuryAddr);

        assertEq(feeSplitter.getDistributionCount(), 2, "Should have 2 distributions");

        IFeeSplitter.DistributionRecord memory rec0 = feeSplitter.getDistribution(0);
        assertEq(rec0.totalETH, 5 ether, "First distribution should be 5 ETH");
        assertEq(rec0.agentTreasury, agentTreasuryAddr, "Should target agentTreasury");
        assertEq(rec0.distributor, deployer, "Distributor should be deployer");

        IFeeSplitter.DistributionRecord memory rec1 = feeSplitter.getDistribution(1);
        assertEq(rec1.totalETH, 3 ether, "Second distribution should be 3 ETH");
    }

    // ════════════════════════════════════════════════════════════════════
    //  Whitelist Toggle
    // ════════════════════════════════════════════════════════════════════

    /// @notice Test whitelist toggle: add → invest → remove → invest fails
    function test_whitelistToggle() public {
        MockERC20 newToken = new MockERC20("NewAgent", "NAGENT", 18);
        vm.deal(address(scoutFund), 2 ether);

        // Not whitelisted → invest should fail
        vm.prank(scoutWorker);
        vm.expectRevert(IScoutFund.TokenNotScoutable.selector);
        scoutFund.invest(address(newToken), WETH_ADDR, 0.1 ether, 3000, 0);

        // Whitelist → invest should succeed
        scoutFund.setScoutableToken(address(newToken), true);
        assertTrue(scoutFund.isScoutable(address(newToken)), "Token should be scoutable");

        vm.prank(scoutWorker);
        scoutFund.invest(address(newToken), WETH_ADDR, 0.1 ether, 3000, 0);

        // Remove from whitelist → invest should fail again
        scoutFund.setScoutableToken(address(newToken), false);
        assertFalse(scoutFund.isScoutable(address(newToken)), "Token should not be scoutable");

        vm.prank(scoutWorker);
        vm.expectRevert(IScoutFund.TokenNotScoutable.selector);
        scoutFund.invest(address(newToken), WETH_ADDR, 0.1 ether, 3000, 0);
    }

    // ════════════════════════════════════════════════════════════════════
    //  Insufficient Balance Protection
    // ════════════════════════════════════════════════════════════════════

    /// @notice Test that investing more ETH than available reverts
    function test_investInsufficientBalance() public {
        vm.deal(address(scoutFund), 0.5 ether);

        scoutFund.setMaxInvestmentPerToken(10 ether); // Raise cap so it's not the blocker

        vm.prank(scoutWorker);
        vm.expectRevert(IScoutFund.InsufficientBalance.selector);
        scoutFund.invest(address(agentToken), WETH_ADDR, 1 ether, 3000, 0);
    }

    // ════════════════════════════════════════════════════════════════════
    //  AgentTreasury Pull Pattern
    // ════════════════════════════════════════════════════════════════════

    /// @notice Test that an AgentTreasury clone can pull its 40% growth share
    function test_agentTreasuryPullsGrowthShare() public {
        // Deploy a real AgentTreasury (as clone would be)
        treasuryImpl = new AgentTreasury();
        treasuryImpl.initialize(
            makeAddr("agent"),
            creator,
            controller,
            address(feeSplitter),
            address(agentToken)
        );

        // Distribute fees with this treasury as the agent treasury
        feeSplitter.distributeFees{ value: FEE_AMOUNT }(address(treasuryImpl));

        // Verify allocation
        (uint256 treasuryETH,) = feeSplitter.getClaimable(address(treasuryImpl));
        assertEq(treasuryETH, 4 ether, "AgentTreasury should have 4 ETH allocated (40%)");

        // Treasury claims its growth share
        treasuryImpl.claimGrowthETH();

        assertEq(address(treasuryImpl).balance, 4 ether, "AgentTreasury should hold 4 ETH");

        // Verify claim zeroed the balance
        (uint256 treasuryETHAfter,) = feeSplitter.getClaimable(address(treasuryImpl));
        assertEq(treasuryETHAfter, 0, "AgentTreasury claimable should be 0 after claim");
    }
}
