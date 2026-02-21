// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test, console } from "forge-std/Test.sol";
import { CeosAgentIdentity } from "../src/CeosAgentIdentity.sol";
import { AgentPaymaster } from "../src/AgentPaymaster.sol";
import { ICeosAgentIdentity } from "../src/interfaces/ICeosAgentIdentity.sol";
import { IAgentPaymaster } from "../src/interfaces/IAgentPaymaster.sol";
import { MockUSDC } from "../src/mocks/MockUSDC.sol";

/// @title CeosAgentTest
/// @notice Comprehensive test suite for CeosAgentIdentity + AgentPaymaster V1 contracts.
/// @dev Tests cover: minting, reputation tracking, deposits, compute payments,
///      protocol fee routing, withdrawals, and access-control reverts.
///      All USDC amounts use 6-decimal micro-USDC (1e6 = 1 USDC).
contract CeosAgentTest is Test {
    // ── Contracts under test ───────────────────────────────
    CeosAgentIdentity public identity;
    AgentPaymaster public paymaster;
    MockUSDC public usdc;

    // ── Named actors ───────────────────────────────────────
    address public deployer;      // Contract owner / admin
    address public operator;      // Authorized backend worker
    address public creator;       // Agent NFT owner (funds & withdraws)
    address public funder;        // Third party topping up agent balance
    address public feeRecipient;  // Receives protocol fees (simulates RevenuePool)
    address public unauthorized;  // No special roles

    // ── Constants ──────────────────────────────────────────
    uint256 public constant ONE_USDC = 1e6;       // 1 USDC in micro-USDC
    uint256 public constant HUNDRED_USDC = 100e6; // 100 USDC
    uint256 public constant PROTOCOL_FEE_BPS = 200; // 2%

    // ── Setup ──────────────────────────────────────────────

    function setUp() public {
        deployer     = address(this);
        operator     = makeAddr("operator");
        creator      = makeAddr("creator");
        funder       = makeAddr("funder");
        feeRecipient = makeAddr("feeRecipient");
        unauthorized = makeAddr("unauthorized");

        // 1. Deploy MockUSDC
        usdc = new MockUSDC();

        // 2. Deploy CeosAgentIdentity
        identity = new CeosAgentIdentity();

        // 3. Deploy AgentPaymaster — references identity for ownership checks
        paymaster = new AgentPaymaster(address(usdc), address(identity), feeRecipient);

        // 4. Authorize operator in both contracts
        identity.setAuthorizedOperator(operator, true);
        paymaster.setAuthorizedOperator(operator, true);

        // 5. Fund test accounts with USDC and approve paymaster
        usdc.mint(creator, 10_000e6);
        usdc.mint(funder, 10_000e6);

        vm.prank(creator);
        usdc.approve(address(paymaster), type(uint256).max);

        vm.prank(funder);
        usdc.approve(address(paymaster), type(uint256).max);
    }

    // ══════════════════════════════════════════════════════
    //  CeosAgentIdentity — Minting
    // ══════════════════════════════════════════════════════

    /// @notice Owner can mint an agent identity NFT
    function test_mintAgent_byOwner_success() public {
        uint256 tokenId = identity.mintAgent(creator);

        assertEq(tokenId, 1, "First token should be ID 1");
        assertEq(identity.ownerOf(tokenId), creator, "Creator should own the NFT");
        assertEq(identity.totalMinted(), 1, "Total minted should be 1");
    }

    /// @notice Authorized operator can mint an agent identity NFT
    function test_mintAgent_byOperator_success() public {
        vm.prank(operator);
        uint256 tokenId = identity.mintAgent(creator);

        assertEq(tokenId, 1, "Token ID should be 1");
        assertEq(identity.ownerOf(1), creator, "Creator should own the token");
    }

    /// @notice Unauthorized caller cannot mint (access control)
    function test_mintAgent_unauthorized_reverts() public {
        vm.prank(unauthorized);
        vm.expectRevert(ICeosAgentIdentity.UnauthorizedCaller.selector);
        identity.mintAgent(creator);
    }

    /// @notice Token IDs increment sequentially across multiple mints
    function test_mintAgent_sequentialIds() public {
        address agent1 = makeAddr("agent1");
        address agent2 = makeAddr("agent2");
        address agent3 = makeAddr("agent3");

        uint256 id1 = identity.mintAgent(agent1);
        uint256 id2 = identity.mintAgent(agent2);
        uint256 id3 = identity.mintAgent(agent3);

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(id3, 3);
        assertEq(identity.totalMinted(), 3);
    }

    /// @notice Profile is correctly initialized on mint
    function test_mintAgent_profileInitialized() public {
        uint256 tokenId = identity.mintAgent(creator);
        (uint256 totalTrades, uint256 successfulTrades, address profileCreator, uint256 createdAt) =
            identity.agentProfiles(tokenId);

        assertEq(totalTrades, 0, "Initial trades should be 0");
        assertEq(successfulTrades, 0, "Initial successful trades should be 0");
        assertEq(profileCreator, creator, "Creator should match");
        assertTrue(createdAt > 0, "createdAt should be set");
        assertEq(createdAt, block.timestamp, "createdAt should be current block");
    }

    /// @notice AgentMinted event is emitted correctly
    function test_mintAgent_emitsEvent() public {
        vm.expectEmit(true, true, false, false);
        emit ICeosAgentIdentity.AgentMinted(creator, 1);
        identity.mintAgent(creator);
    }

    /// @notice agentExists returns true for minted tokens and false for unminted
    function test_agentExists() public {
        assertFalse(identity.agentExists(1), "Token 1 should not exist yet");
        identity.mintAgent(creator);
        assertTrue(identity.agentExists(1), "Token 1 should exist after mint");
        assertFalse(identity.agentExists(2), "Token 2 should not exist");
    }

    // ══════════════════════════════════════════════════════
    //  CeosAgentIdentity — Reputation / Trade Recording
    // ══════════════════════════════════════════════════════

    /// @notice recordTrade increments total and successful trade counts
    function test_recordTrade_success() public {
        uint256 tokenId = identity.mintAgent(creator);

        identity.recordTrade(tokenId, true);

        (uint256 totalTrades, uint256 successfulTrades,,) = identity.agentProfiles(tokenId);
        assertEq(totalTrades, 1, "Total trades should be 1");
        assertEq(successfulTrades, 1, "Successful trades should be 1");
    }

    /// @notice recordTrade for a failed trade increments only totalTrades
    function test_recordTrade_failure() public {
        uint256 tokenId = identity.mintAgent(creator);

        identity.recordTrade(tokenId, false);

        (uint256 totalTrades, uint256 successfulTrades,,) = identity.agentProfiles(tokenId);
        assertEq(totalTrades, 1, "Total trades should be 1");
        assertEq(successfulTrades, 0, "Successful trades should remain 0");
    }

    /// @notice Operator can record trades
    function test_recordTrade_byOperator() public {
        uint256 tokenId = identity.mintAgent(creator);

        vm.prank(operator);
        identity.recordTrade(tokenId, true);

        (uint256 totalTrades, uint256 successfulTrades,,) = identity.agentProfiles(tokenId);
        assertEq(totalTrades, 1);
        assertEq(successfulTrades, 1);
    }

    /// @notice Unauthorized caller cannot record trades
    function test_recordTrade_unauthorized_reverts() public {
        uint256 tokenId = identity.mintAgent(creator);

        vm.prank(unauthorized);
        vm.expectRevert(ICeosAgentIdentity.UnauthorizedCaller.selector);
        identity.recordTrade(tokenId, true);
    }

    /// @notice recordTrade reverts for a non-existent agentId
    function test_recordTrade_nonexistentAgent_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(ICeosAgentIdentity.AgentNotFound.selector, 999));
        identity.recordTrade(999, true);
    }

    /// @notice TradeRecorded event is emitted with correct parameters
    function test_recordTrade_emitsEvent() public {
        uint256 tokenId = identity.mintAgent(creator);

        vm.expectEmit(true, false, false, true);
        emit ICeosAgentIdentity.TradeRecorded(tokenId, true, 1);
        identity.recordTrade(tokenId, true);
    }

    // ══════════════════════════════════════════════════════
    //  CeosAgentIdentity — getReputation
    // ══════════════════════════════════════════════════════

    /// @notice getReputation returns zeros before any trades
    function test_getReputation_noTrades() public {
        uint256 tokenId = identity.mintAgent(creator);

        (uint256 total, uint256 successful, uint256 successRate) = identity.getReputation(tokenId);

        assertEq(total, 0);
        assertEq(successful, 0);
        assertEq(successRate, 0, "Success rate should be 0 when no trades");
    }

    /// @notice getReputation returns 100% when all trades succeed
    function test_getReputation_allSuccess() public {
        uint256 tokenId = identity.mintAgent(creator);

        identity.recordTrade(tokenId, true);
        identity.recordTrade(tokenId, true);
        identity.recordTrade(tokenId, true);

        (uint256 total, uint256 successful, uint256 successRate) = identity.getReputation(tokenId);

        assertEq(total, 3);
        assertEq(successful, 3);
        assertEq(successRate, 10_000, "100% = 10000 bps");
    }

    /// @notice getReputation returns 50% when half the trades succeed
    function test_getReputation_halfSuccess() public {
        uint256 tokenId = identity.mintAgent(creator);

        identity.recordTrade(tokenId, true);
        identity.recordTrade(tokenId, false);

        (, , uint256 successRate) = identity.getReputation(tokenId);

        assertEq(successRate, 5_000, "50% = 5000 bps");
    }

    /// @notice getReputation reverts for a non-existent agentId
    function test_getReputation_nonexistentAgent_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(ICeosAgentIdentity.AgentNotFound.selector, 42));
        identity.getReputation(42);
    }

    /// @notice Mixed success/failure: 3 successes out of 4 trades = 75%
    function test_getReputation_mixedOutcomes() public {
        uint256 tokenId = identity.mintAgent(creator);

        identity.recordTrade(tokenId, true);
        identity.recordTrade(tokenId, true);
        identity.recordTrade(tokenId, true);
        identity.recordTrade(tokenId, false);

        (uint256 total, uint256 successful, uint256 successRate) = identity.getReputation(tokenId);

        assertEq(total, 4);
        assertEq(successful, 3);
        assertEq(successRate, 7_500, "75% = 7500 bps");
    }

    // ══════════════════════════════════════════════════════
    //  AgentPaymaster — Deposits
    // ══════════════════════════════════════════════════════

    /// @notice Anyone can deposit USDC to fund an agent's compute balance
    function test_depositForAgent_success() public {
        uint256 tokenId = identity.mintAgent(creator);

        vm.prank(creator);
        paymaster.depositForAgent(tokenId, HUNDRED_USDC);

        assertEq(paymaster.getAgentBalance(tokenId), HUNDRED_USDC, "Balance should be 100 USDC");
        assertEq(usdc.balanceOf(address(paymaster)), HUNDRED_USDC, "Paymaster should hold USDC");
    }

    /// @notice Third party can fund an agent's balance
    function test_depositForAgent_byThirdParty() public {
        uint256 tokenId = identity.mintAgent(creator);

        vm.prank(funder);
        paymaster.depositForAgent(tokenId, 50e6);

        assertEq(paymaster.getAgentBalance(tokenId), 50e6);
    }

    /// @notice Multiple deposits accumulate correctly
    function test_depositForAgent_accumulates() public {
        uint256 tokenId = identity.mintAgent(creator);

        vm.prank(creator);
        paymaster.depositForAgent(tokenId, 50e6);

        vm.prank(funder);
        paymaster.depositForAgent(tokenId, 50e6);

        assertEq(paymaster.getAgentBalance(tokenId), HUNDRED_USDC, "Should accumulate to 100 USDC");
    }

    /// @notice FundsDeposited event is emitted correctly
    function test_depositForAgent_emitsEvent() public {
        uint256 tokenId = identity.mintAgent(creator);

        vm.expectEmit(true, true, false, true);
        emit IAgentPaymaster.FundsDeposited(tokenId, creator, HUNDRED_USDC);

        vm.prank(creator);
        paymaster.depositForAgent(tokenId, HUNDRED_USDC);
    }

    /// @notice Deposit for a non-existent agentId reverts
    function test_depositForAgent_nonexistentAgent_reverts() public {
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(IAgentPaymaster.AgentNotFound.selector, 999));
        paymaster.depositForAgent(999, HUNDRED_USDC);
    }

    /// @notice Zero-amount deposit reverts
    function test_depositForAgent_zeroAmount_reverts() public {
        uint256 tokenId = identity.mintAgent(creator);

        vm.prank(creator);
        vm.expectRevert(IAgentPaymaster.ZeroAmount.selector);
        paymaster.depositForAgent(tokenId, 0);
    }

    // ══════════════════════════════════════════════════════
    //  AgentPaymaster — payForCompute
    // ══════════════════════════════════════════════════════

    /// @notice Operator can deduct compute costs with correct 2% protocol fee
    function test_payForCompute_success() public {
        uint256 tokenId = identity.mintAgent(creator);

        vm.prank(creator);
        paymaster.depositForAgent(tokenId, HUNDRED_USDC);

        uint256 feeRecipientBefore = usdc.balanceOf(feeRecipient);

        vm.prank(operator);
        paymaster.payForCompute(tokenId, HUNDRED_USDC);

        // Expected: 2% fee = 2 USDC, net = 98 USDC
        uint256 expectedFee = (HUNDRED_USDC * PROTOCOL_FEE_BPS) / 10_000;
        uint256 expectedNet = HUNDRED_USDC - expectedFee;

        assertEq(paymaster.getAgentBalance(tokenId), 0, "Agent balance should be zero");
        assertEq(
            usdc.balanceOf(feeRecipient) - feeRecipientBefore,
            expectedFee,
            "feeRecipient should receive 2 USDC"
        );
        // Net (98 USDC) remains in the paymaster contract
        // totalDeposit(100) - fee(2) = 98 held
        assertEq(usdc.balanceOf(address(paymaster)), expectedNet, "Paymaster holds net amount");
    }

    /// @notice Protocol fee is correctly calculated on partial deductions
    function test_payForCompute_partialDeduction() public {
        uint256 tokenId = identity.mintAgent(creator);

        vm.prank(creator);
        paymaster.depositForAgent(tokenId, HUNDRED_USDC);

        // Deduct 10 USDC; fee = 0.2 USDC, net = 9.8 USDC
        uint256 charge = 10e6;
        uint256 expectedFee = (charge * PROTOCOL_FEE_BPS) / 10_000;

        uint256 feeRecipientBefore = usdc.balanceOf(feeRecipient);

        vm.prank(operator);
        paymaster.payForCompute(tokenId, charge);

        assertEq(
            usdc.balanceOf(feeRecipient) - feeRecipientBefore,
            expectedFee,
            "Fee should be 0.2 USDC"
        );
        assertEq(paymaster.getAgentBalance(tokenId), HUNDRED_USDC - charge, "Remaining balance should be 90 USDC");
    }

    /// @notice Owner can also call payForCompute without being an operator
    function test_payForCompute_byOwner() public {
        uint256 tokenId = identity.mintAgent(creator);

        vm.prank(creator);
        paymaster.depositForAgent(tokenId, HUNDRED_USDC);

        // deployer (owner) calls payForCompute without being an explicit operator
        paymaster.payForCompute(tokenId, 10e6);
        assertEq(paymaster.getAgentBalance(tokenId), 90e6);
    }

    /// @notice Unauthorized caller cannot call payForCompute
    function test_payForCompute_unauthorized_reverts() public {
        uint256 tokenId = identity.mintAgent(creator);

        vm.prank(creator);
        paymaster.depositForAgent(tokenId, HUNDRED_USDC);

        vm.prank(unauthorized);
        vm.expectRevert(IAgentPaymaster.UnauthorizedCaller.selector);
        paymaster.payForCompute(tokenId, HUNDRED_USDC);
    }

    /// @notice payForCompute reverts when agent balance is insufficient
    function test_payForCompute_insufficientBalance_reverts() public {
        uint256 tokenId = identity.mintAgent(creator);

        vm.prank(creator);
        paymaster.depositForAgent(tokenId, 50e6);

        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(IAgentPaymaster.InsufficientAgentBalance.selector, tokenId, 50e6, HUNDRED_USDC)
        );
        paymaster.payForCompute(tokenId, HUNDRED_USDC);
    }

    /// @notice payForCompute reverts on zero amount
    function test_payForCompute_zeroAmount_reverts() public {
        uint256 tokenId = identity.mintAgent(creator);

        vm.prank(operator);
        vm.expectRevert(IAgentPaymaster.ZeroAmount.selector);
        paymaster.payForCompute(tokenId, 0);
    }

    /// @notice ComputePaid event is emitted with correct values
    function test_payForCompute_emitsEvent() public {
        uint256 tokenId = identity.mintAgent(creator);

        vm.prank(creator);
        paymaster.depositForAgent(tokenId, HUNDRED_USDC);

        uint256 charge = 10e6;
        uint256 expectedFee = (charge * PROTOCOL_FEE_BPS) / 10_000;
        uint256 expectedNet = charge - expectedFee;

        vm.expectEmit(true, false, false, true);
        emit IAgentPaymaster.ComputePaid(tokenId, charge, expectedFee, expectedNet);

        vm.prank(operator);
        paymaster.payForCompute(tokenId, charge);
    }

    /// @notice Multiple sequential compute charges deplete balance correctly
    function test_payForCompute_multipleCharges() public {
        uint256 tokenId = identity.mintAgent(creator);

        vm.prank(creator);
        paymaster.depositForAgent(tokenId, HUNDRED_USDC);

        vm.prank(operator);
        paymaster.payForCompute(tokenId, 40e6);

        vm.prank(operator);
        paymaster.payForCompute(tokenId, 30e6);

        // Remaining balance: 100 - 40 - 30 = 30 USDC
        assertEq(paymaster.getAgentBalance(tokenId), 30e6, "Balance should be 30 USDC");
    }

    // ══════════════════════════════════════════════════════
    //  AgentPaymaster — Withdrawals
    // ══════════════════════════════════════════════════════

    /// @notice Agent NFT owner can withdraw remaining balance
    function test_withdrawBalance_success() public {
        uint256 tokenId = identity.mintAgent(creator);

        vm.prank(creator);
        paymaster.depositForAgent(tokenId, HUNDRED_USDC);

        // Deduct some compute costs
        vm.prank(operator);
        paymaster.payForCompute(tokenId, 20e6);

        // Remaining: 80 USDC
        uint256 creatorUsdcBefore = usdc.balanceOf(creator);

        vm.prank(creator);
        paymaster.withdrawBalance(tokenId, 80e6);

        assertEq(usdc.balanceOf(creator) - creatorUsdcBefore, 80e6, "Creator should receive 80 USDC");
        assertEq(paymaster.getAgentBalance(tokenId), 0, "Agent balance should be zero");
    }

    /// @notice Partial withdrawal leaves remaining balance intact
    function test_withdrawBalance_partial() public {
        uint256 tokenId = identity.mintAgent(creator);

        vm.prank(creator);
        paymaster.depositForAgent(tokenId, HUNDRED_USDC);

        vm.prank(creator);
        paymaster.withdrawBalance(tokenId, 30e6);

        assertEq(paymaster.getAgentBalance(tokenId), 70e6, "Remaining balance should be 70 USDC");
    }

    /// @notice Non-owner cannot withdraw (access control)
    function test_withdrawBalance_nonOwner_reverts() public {
        uint256 tokenId = identity.mintAgent(creator);

        vm.prank(creator);
        paymaster.depositForAgent(tokenId, HUNDRED_USDC);

        vm.prank(unauthorized);
        vm.expectRevert(IAgentPaymaster.UnauthorizedCaller.selector);
        paymaster.withdrawBalance(tokenId, HUNDRED_USDC);
    }

    /// @notice withdrawBalance reverts when requested amount exceeds available balance
    function test_withdrawBalance_insufficientBalance_reverts() public {
        uint256 tokenId = identity.mintAgent(creator);

        vm.prank(creator);
        paymaster.depositForAgent(tokenId, 50e6);

        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(IAgentPaymaster.InsufficientAgentBalance.selector, tokenId, 50e6, HUNDRED_USDC)
        );
        paymaster.withdrawBalance(tokenId, HUNDRED_USDC);
    }

    /// @notice withdrawBalance reverts on zero amount
    function test_withdrawBalance_zeroAmount_reverts() public {
        uint256 tokenId = identity.mintAgent(creator);

        vm.prank(creator);
        vm.expectRevert(IAgentPaymaster.ZeroAmount.selector);
        paymaster.withdrawBalance(tokenId, 0);
    }

    /// @notice FundsWithdrawn event is emitted correctly
    function test_withdrawBalance_emitsEvent() public {
        uint256 tokenId = identity.mintAgent(creator);

        vm.prank(creator);
        paymaster.depositForAgent(tokenId, HUNDRED_USDC);

        vm.expectEmit(true, true, false, true);
        emit IAgentPaymaster.FundsWithdrawn(tokenId, creator, HUNDRED_USDC);

        vm.prank(creator);
        paymaster.withdrawBalance(tokenId, HUNDRED_USDC);
    }

    // ══════════════════════════════════════════════════════
    //  AgentPaymaster — Admin Functions
    // ══════════════════════════════════════════════════════

    /// @notice Owner can update the protocol fee rate
    function test_setProtocolFeeRate_success() public {
        paymaster.setProtocolFeeRate(300); // 3%
        assertEq(paymaster.protocolFeeRate(), 300, "Fee rate should be 300 bps");
    }

    /// @notice FeeRateUpdated event is emitted on rate change
    function test_setProtocolFeeRate_emitsEvent() public {
        vm.expectEmit(false, false, false, true);
        emit IAgentPaymaster.FeeRateUpdated(200, 300);
        paymaster.setProtocolFeeRate(300);
    }

    /// @notice Fee rate cannot exceed MAX_FEE_RATE_BPS (10%)
    function test_setProtocolFeeRate_exceedsMax_reverts() public {
        vm.expectRevert(IAgentPaymaster.UnauthorizedCaller.selector);
        paymaster.setProtocolFeeRate(1_001); // > 10%
    }

    /// @notice Owner can update the fee recipient
    function test_setFeeRecipient_success() public {
        address newRecipient = makeAddr("newRecipient");
        paymaster.setFeeRecipient(newRecipient);
        assertEq(paymaster.feeRecipient(), newRecipient);
    }

    /// @notice Zero-address fee recipient reverts
    function test_setFeeRecipient_zeroAddress_reverts() public {
        vm.expectRevert(IAgentPaymaster.ZeroAddress.selector);
        paymaster.setFeeRecipient(address(0));
    }

    /// @notice Owner can grant/revoke operator authorization
    function test_setAuthorizedOperator_grantRevoke() public {
        address newOperator = makeAddr("newOperator");
        assertFalse(paymaster.authorizedOperators(newOperator));

        paymaster.setAuthorizedOperator(newOperator, true);
        assertTrue(paymaster.authorizedOperators(newOperator));

        paymaster.setAuthorizedOperator(newOperator, false);
        assertFalse(paymaster.authorizedOperators(newOperator));
    }

    // ══════════════════════════════════════════════════════
    //  End-to-End: Full Lifecycle Test
    // ══════════════════════════════════════════════════════

    /// @notice Full agent lifecycle: mint → fund → compute → reputation → withdraw
    function test_fullLifecycle() public {
        console.log("=== V1 Agent Lifecycle Test ===");

        // 1. Mint agent identity NFT
        uint256 tokenId = identity.mintAgent(creator);
        console.log("Agent minted, tokenId:", tokenId);

        assertEq(tokenId, 1);
        assertEq(identity.ownerOf(tokenId), creator);
        assertTrue(identity.agentExists(tokenId));

        // 2. Fund agent compute balance
        vm.prank(creator);
        paymaster.depositForAgent(tokenId, HUNDRED_USDC);

        assertEq(paymaster.getAgentBalance(tokenId), HUNDRED_USDC);
        console.log("Agent funded: 100 USDC");

        // 3. Record several trades (some successful, some not)
        vm.prank(operator);
        identity.recordTrade(tokenId, true);  // success

        vm.prank(operator);
        identity.recordTrade(tokenId, true);  // success

        vm.prank(operator);
        identity.recordTrade(tokenId, false); // failure

        (uint256 total, uint256 successful, uint256 successRate) = identity.getReputation(tokenId);
        assertEq(total, 3);
        assertEq(successful, 2);
        assertEq(successRate, 6_666, "~66.66% = 6666 bps (integer division)");
        console.log("Reputation: 2/3 success rate:", successRate);

        // 4. Pay for compute (deducts 40 USDC with 2% fee)
        vm.prank(operator);
        paymaster.payForCompute(tokenId, 40e6);

        uint256 expectedFee = (40e6 * 200) / 10_000; // 0.8 USDC
        uint256 remainingBalance = HUNDRED_USDC - 40e6;
        assertEq(paymaster.getAgentBalance(tokenId), remainingBalance);
        assertEq(usdc.balanceOf(feeRecipient), expectedFee);
        console.log("Compute paid: 40 USDC, fee:", expectedFee);

        // 5. Creator withdraws remaining balance
        uint256 creatorBefore = usdc.balanceOf(creator);

        vm.prank(creator);
        paymaster.withdrawBalance(tokenId, remainingBalance);

        assertEq(usdc.balanceOf(creator) - creatorBefore, remainingBalance);
        assertEq(paymaster.getAgentBalance(tokenId), 0);
        console.log("Withdrawal: 60 USDC returned to creator");

        console.log("=== Lifecycle complete ===");
    }

    // ══════════════════════════════════════════════════════
    //  MockUSDC
    // ══════════════════════════════════════════════════════

    /// @notice MockUSDC has 6 decimals matching real USDC
    function test_mockUSDC_decimals() public view {
        assertEq(usdc.decimals(), 6, "MockUSDC should have 6 decimals");
    }

    /// @notice MockUSDC has correct name and symbol
    function test_mockUSDC_metadata() public view {
        assertEq(usdc.name(), "Mock USDC");
        assertEq(usdc.symbol(), "mUSDC");
    }

    /// @notice MockUSDC mint function works
    function test_mockUSDC_mint() public {
        address recipient = makeAddr("recipient");
        usdc.mint(recipient, ONE_USDC);
        assertEq(usdc.balanceOf(recipient), ONE_USDC);
    }

    // ══════════════════════════════════════════════════════
    //  CeosAgentIdentity — Operator Management
    // ══════════════════════════════════════════════════════

    /// @notice Owner can grant and revoke operator roles in the identity contract
    function test_identity_setAuthorizedOperator_grantRevoke() public {
        address newOperator = makeAddr("newOperator");
        assertFalse(identity.authorizedOperators(newOperator));

        identity.setAuthorizedOperator(newOperator, true);
        assertTrue(identity.authorizedOperators(newOperator));

        identity.setAuthorizedOperator(newOperator, false);
        assertFalse(identity.authorizedOperators(newOperator));
    }

    /// @notice Revoked operator can no longer mint
    function test_identity_revokedOperator_cannotMint() public {
        identity.setAuthorizedOperator(operator, true);
        identity.setAuthorizedOperator(operator, false);

        vm.prank(operator);
        vm.expectRevert(ICeosAgentIdentity.UnauthorizedCaller.selector);
        identity.mintAgent(creator);
    }
}
