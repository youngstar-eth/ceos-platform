// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { RunToken } from "../src/RunToken.sol";
import { StakingRewards } from "../src/StakingRewards.sol";
import { IStakingRewards } from "../src/interfaces/IStakingRewards.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @title StakingRewardsTest
/// @notice Comprehensive unit, integration, and fuzz tests for StakingRewards.sol
contract StakingRewardsTest is Test {
    RunToken public runToken;
    StakingRewards public staking;

    MockERC20 public lpToken;
    MockERC20 public agentToken;
    MockERC20 public lpToken2;
    MockERC20 public agentToken2;

    address public owner;
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public carol = makeAddr("carol");

    uint256 public constant RUN_PER_SECOND = 1e18; // 1 RUN/sec
    uint256 public constant AGENT_THRESHOLD = 100e18; // 100 agent tokens for boost
    uint256 public constant ALLOC_POINT = 100;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    function setUp() public {
        owner = address(this);

        // Deploy RunToken
        runToken = new RunToken(owner);

        // Deploy StakingRewards
        staking = new StakingRewards(address(runToken), RUN_PER_SECOND);

        // Grant MINTER_ROLE to StakingRewards
        runToken.grantRole(MINTER_ROLE, address(staking));

        // Deploy mock tokens
        lpToken = new MockERC20("LP AGENT/ETH", "LP", 18);
        agentToken = new MockERC20("Agent Token", "AGENT", 18);
        lpToken2 = new MockERC20("LP AGENT2/ETH", "LP2", 18);
        agentToken2 = new MockERC20("Agent Token 2", "AGENT2", 18);

        // Add pool 0: LP token with agent boost
        staking.addPool(address(lpToken), address(agentToken), AGENT_THRESHOLD, ALLOC_POINT);

        // Fund users with LP tokens
        lpToken.mint(alice, 10_000e18);
        lpToken.mint(bob, 10_000e18);
        lpToken.mint(carol, 10_000e18);

        // Approve staking contract
        vm.prank(alice);
        lpToken.approve(address(staking), type(uint256).max);
        vm.prank(bob);
        lpToken.approve(address(staking), type(uint256).max);
        vm.prank(carol);
        lpToken.approve(address(staking), type(uint256).max);
    }

    // ═══════════════════════════════════════════════════════
    // ── Constructor Tests ─────────────────────────────────
    // ═══════════════════════════════════════════════════════

    function test_constructor_setsState() public view {
        assertEq(address(staking.runToken()), address(runToken));
        assertEq(staking.runPerSecond(), RUN_PER_SECOND);
        assertEq(staking.owner(), owner);
    }

    function test_constructor_revertZeroRunToken() public {
        vm.expectRevert(IStakingRewards.ZeroAddress.selector);
        new StakingRewards(address(0), RUN_PER_SECOND);
    }

    function test_constructor_revertExceedsMaxEmission() public {
        vm.expectRevert(IStakingRewards.ExceedsMaxEmissionRate.selector);
        new StakingRewards(address(runToken), 11e18); // > MAX_RUN_PER_SECOND
    }

    // ═══════════════════════════════════════════════════════
    // ── Staking Tests ─────────────────────────────────────
    // ═══════════════════════════════════════════════════════

    function test_stake_success() public {
        uint256 stakeAmount = 100e18;

        vm.prank(alice);
        staking.stake(0, stakeAmount);

        IStakingRewards.UserInfo memory info = staking.getUserInfo(0, alice);
        assertEq(info.amount, stakeAmount);
        assertEq(info.effectiveAmount, stakeAmount); // No boost (no agent tokens)
        assertFalse(info.boosted);

        assertEq(lpToken.balanceOf(address(staking)), stakeAmount);
    }

    function test_stake_revertZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(IStakingRewards.ZeroAmount.selector);
        staking.stake(0, 0);
    }

    function test_stake_revertPoolNotFound() public {
        vm.prank(alice);
        vm.expectRevert(IStakingRewards.PoolNotFound.selector);
        staking.stake(999, 100e18);
    }

    function test_stake_multipleStakesSameUser() public {
        vm.startPrank(alice);
        staking.stake(0, 100e18);

        // Advance time so there are pending rewards
        vm.warp(block.timestamp + 50);

        staking.stake(0, 200e18);
        vm.stopPrank();

        IStakingRewards.UserInfo memory info = staking.getUserInfo(0, alice);
        assertEq(info.amount, 300e18);

        // Alice should have received ~50 RUN from the first 50 seconds
        assertApproxEqAbs(runToken.balanceOf(alice), 50e18, 1e15);
    }

    // ═══════════════════════════════════════════════════════
    // ── Withdraw Tests ────────────────────────────────────
    // ═══════════════════════════════════════════════════════

    function test_withdraw_success() public {
        vm.prank(alice);
        staking.stake(0, 100e18);

        vm.warp(block.timestamp + 100);

        vm.prank(alice);
        staking.withdraw(0, 100e18);

        IStakingRewards.UserInfo memory info = staking.getUserInfo(0, alice);
        assertEq(info.amount, 0);
        assertEq(lpToken.balanceOf(alice), 10_000e18); // All LP returned

        // Should have received ~100 RUN
        assertApproxEqAbs(runToken.balanceOf(alice), 100e18, 1e15);
    }

    function test_withdraw_partial() public {
        vm.prank(alice);
        staking.stake(0, 100e18);

        vm.warp(block.timestamp + 50);

        vm.prank(alice);
        staking.withdraw(0, 40e18);

        IStakingRewards.UserInfo memory info = staking.getUserInfo(0, alice);
        assertEq(info.amount, 60e18);
    }

    function test_withdraw_revertInsufficientStake() public {
        vm.prank(alice);
        staking.stake(0, 100e18);

        vm.prank(alice);
        vm.expectRevert(IStakingRewards.InsufficientStake.selector);
        staking.withdraw(0, 200e18);
    }

    function test_withdraw_revertZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(IStakingRewards.ZeroAmount.selector);
        staking.withdraw(0, 0);
    }

    // ═══════════════════════════════════════════════════════
    // ── Claim Tests ───────────────────────────────────────
    // ═══════════════════════════════════════════════════════

    function test_claim_success() public {
        vm.prank(alice);
        staking.stake(0, 100e18);

        vm.warp(block.timestamp + 100);

        vm.prank(alice);
        staking.claim(0);

        // ~100 RUN (1 RUN/sec * 100 sec, sole staker)
        assertApproxEqAbs(runToken.balanceOf(alice), 100e18, 1e15);
    }

    function test_claim_multipleUsers() public {
        // Alice and Bob each stake 100 LP
        vm.prank(alice);
        staking.stake(0, 100e18);
        vm.prank(bob);
        staking.stake(0, 100e18);

        vm.warp(block.timestamp + 100);

        vm.prank(alice);
        staking.claim(0);
        vm.prank(bob);
        staking.claim(0);

        // Each should get ~50 RUN (equal stake, 100 RUN total / 2)
        assertApproxEqAbs(runToken.balanceOf(alice), 50e18, 1e15);
        assertApproxEqAbs(runToken.balanceOf(bob), 50e18, 1e15);
    }

    function test_claim_revertNothingToClaim() public {
        // Alice never staked
        vm.prank(alice);
        vm.expectRevert(IStakingRewards.NothingToClaim.selector);
        staking.claim(0);
    }

    function test_claim_revertPoolNotFound() public {
        vm.prank(alice);
        vm.expectRevert(IStakingRewards.PoolNotFound.selector);
        staking.claim(999);
    }

    // ═══════════════════════════════════════════════════════
    // ── Patron Multiplier Tests ───────────────────────────
    // ═══════════════════════════════════════════════════════

    function test_patronBoost_appliedOnStake() public {
        // Give Alice agent tokens above threshold
        agentToken.mint(alice, 200e18); // 200 > 100 threshold

        vm.prank(alice);
        staking.stake(0, 100e18);

        IStakingRewards.UserInfo memory info = staking.getUserInfo(0, alice);
        assertEq(info.amount, 100e18);
        assertEq(info.effectiveAmount, 300e18); // 100 * 3x boost
        assertTrue(info.boosted);
    }

    function test_patronBoost_notAppliedBelowThreshold() public {
        // Give Alice agent tokens below threshold
        agentToken.mint(alice, 50e18); // 50 < 100 threshold

        vm.prank(alice);
        staking.stake(0, 100e18);

        IStakingRewards.UserInfo memory info = staking.getUserInfo(0, alice);
        assertEq(info.effectiveAmount, 100e18); // No boost
        assertFalse(info.boosted);
    }

    function test_patronBoost_3xRewards() public {
        // Alice has boost (200 agent tokens > 100 threshold)
        agentToken.mint(alice, 200e18);
        // Bob has no boost
        // Both stake 100 LP

        vm.prank(alice);
        staking.stake(0, 100e18); // effective: 300
        vm.prank(bob);
        staking.stake(0, 100e18); // effective: 100

        // Total effective supply: 400
        // Alice share: 300/400 = 75%
        // Bob share: 100/400 = 25%

        vm.warp(block.timestamp + 100); // 100 RUN total

        vm.prank(alice);
        staking.claim(0);
        vm.prank(bob);
        staking.claim(0);

        // Alice: 75 RUN, Bob: 25 RUN
        assertApproxEqAbs(runToken.balanceOf(alice), 75e18, 1e15);
        assertApproxEqAbs(runToken.balanceOf(bob), 25e18, 1e15);
    }

    function test_patronBoost_exactThreshold() public {
        // Give Alice exactly the threshold amount
        agentToken.mint(alice, AGENT_THRESHOLD);

        vm.prank(alice);
        staking.stake(0, 100e18);

        IStakingRewards.UserInfo memory info = staking.getUserInfo(0, alice);
        assertTrue(info.boosted); // >= threshold should qualify
        assertEq(info.effectiveAmount, 300e18);
    }

    // ═══════════════════════════════════════════════════════
    // ── Refresh Boost Tests ───────────────────────────────
    // ═══════════════════════════════════════════════════════

    function test_refreshBoost_gainBoost() public {
        // Alice stakes without boost
        vm.prank(alice);
        staking.stake(0, 100e18);

        IStakingRewards.UserInfo memory infoBefore = staking.getUserInfo(0, alice);
        assertFalse(infoBefore.boosted);

        vm.warp(block.timestamp + 50);

        // Alice acquires agent tokens
        agentToken.mint(alice, 200e18);

        // Refresh boost
        vm.prank(alice);
        staking.refreshBoost(0);

        IStakingRewards.UserInfo memory infoAfter = staking.getUserInfo(0, alice);
        assertTrue(infoAfter.boosted);
        assertEq(infoAfter.effectiveAmount, 300e18); // 100 * 3x

        // Alice should have received ~50 RUN for the first 50 seconds at 1x
        assertApproxEqAbs(runToken.balanceOf(alice), 50e18, 1e15);
    }

    function test_refreshBoost_loseBoost() public {
        // Alice starts with boost
        agentToken.mint(alice, 200e18);
        vm.prank(alice);
        staking.stake(0, 100e18);

        assertTrue(staking.getUserInfo(0, alice).boosted);

        vm.warp(block.timestamp + 50);

        // Alice loses agent tokens (simulated transfer out)
        vm.prank(alice);
        agentToken.transfer(bob, 200e18);

        // Refresh boost
        vm.prank(alice);
        staking.refreshBoost(0);

        IStakingRewards.UserInfo memory info = staking.getUserInfo(0, alice);
        assertFalse(info.boosted);
        assertEq(info.effectiveAmount, 100e18); // Back to 1x
    }

    function test_refreshBoost_noChange() public {
        // Alice stakes without boost, refreshes — nothing should happen
        vm.prank(alice);
        staking.stake(0, 100e18);

        vm.prank(alice);
        staking.refreshBoost(0);
        // No revert, no event (silent return)

        IStakingRewards.UserInfo memory info = staking.getUserInfo(0, alice);
        assertFalse(info.boosted);
    }

    function test_refreshBoost_revertZeroStake() public {
        vm.prank(alice);
        vm.expectRevert(IStakingRewards.ZeroAmount.selector);
        staking.refreshBoost(0);
    }

    // ═══════════════════════════════════════════════════════
    // ── Multi-Pool Tests ──────────────────────────────────
    // ═══════════════════════════════════════════════════════

    function test_multiPool_allocation() public {
        // Add pool 1 with 300 allocPoint (pool 0 has 100)
        staking.addPool(address(lpToken2), address(agentToken2), AGENT_THRESHOLD, 300);

        // Total allocPoint = 400
        assertEq(staking.getTotalAllocPoint(), 400);
        assertEq(staking.getPoolCount(), 2);

        // Alice stakes in pool 0, Bob stakes in pool 1
        lpToken2.mint(bob, 10_000e18);
        vm.prank(bob);
        lpToken2.approve(address(staking), type(uint256).max);

        vm.prank(alice);
        staking.stake(0, 100e18);
        vm.prank(bob);
        staking.stake(1, 100e18);

        vm.warp(block.timestamp + 100); // 100 RUN total

        vm.prank(alice);
        staking.claim(0);
        vm.prank(bob);
        staking.claim(1);

        // Pool 0: 100/400 = 25% → 25 RUN
        // Pool 1: 300/400 = 75% → 75 RUN
        assertApproxEqAbs(runToken.balanceOf(alice), 25e18, 1e15);
        assertApproxEqAbs(runToken.balanceOf(bob), 75e18, 1e15);
    }

    function test_addPool_revertDuplicate() public {
        vm.expectRevert(IStakingRewards.PoolAlreadyExists.selector);
        staking.addPool(address(lpToken), address(agentToken), AGENT_THRESHOLD, 100);
    }

    function test_addPool_revertZeroAddress() public {
        vm.expectRevert(IStakingRewards.ZeroAddress.selector);
        staking.addPool(address(0), address(agentToken), AGENT_THRESHOLD, 100);
    }

    function test_addPool_revertNotOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        staking.addPool(address(lpToken2), address(agentToken2), AGENT_THRESHOLD, 100);
    }

    function test_setPool_updateAllocPoint() public {
        staking.setPool(0, 200, 50e18);

        assertEq(staking.getTotalAllocPoint(), 200);
        IStakingRewards.PoolInfo memory info = staking.getPoolInfo(0);
        assertEq(info.allocPoint, 200);
        assertEq(info.agentTokenThreshold, 50e18);
    }

    function test_setPool_revertPoolNotFound() public {
        vm.expectRevert(IStakingRewards.PoolNotFound.selector);
        staking.setPool(999, 200, 50e18);
    }

    // ═══════════════════════════════════════════════════════
    // ── Admin Tests ───────────────────────────────────────
    // ═══════════════════════════════════════════════════════

    function test_setRunPerSecond_success() public {
        // Anchor at a known timestamp
        vm.warp(1000);

        // Alice stakes first
        vm.prank(alice);
        staking.stake(0, 100e18);

        vm.warp(1050); // 50 seconds at 1 RUN/sec = 50 RUN

        // Double the rate
        staking.setRunPerSecond(2e18);

        vm.warp(1100); // Another 50 seconds at 2 RUN/sec = 100 RUN

        vm.prank(alice);
        staking.claim(0);

        // Total: 50 + 100 = 150 RUN
        assertApproxEqAbs(runToken.balanceOf(alice), 150e18, 1e15);
    }

    function test_setRunPerSecond_revertNotOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        staking.setRunPerSecond(2e18);
    }

    function test_setRunPerSecond_revertExceedsMax() public {
        vm.expectRevert(IStakingRewards.ExceedsMaxEmissionRate.selector);
        staking.setRunPerSecond(11e18);
    }

    // ═══════════════════════════════════════════════════════
    // ── Emergency Withdraw Tests ──────────────────────────
    // ═══════════════════════════════════════════════════════

    function test_emergencyWithdraw_success() public {
        vm.prank(alice);
        staking.stake(0, 100e18);

        vm.warp(block.timestamp + 100); // 100 RUN accrued but forfeited

        vm.prank(alice);
        staking.emergencyWithdraw(0);

        // LP returned, no rewards
        assertEq(lpToken.balanceOf(alice), 10_000e18);
        assertEq(runToken.balanceOf(alice), 0);

        // User state zeroed
        IStakingRewards.UserInfo memory info = staking.getUserInfo(0, alice);
        assertEq(info.amount, 0);
        assertEq(info.effectiveAmount, 0);
        assertEq(info.rewardDebt, 0);
        assertFalse(info.boosted);
    }

    function test_emergencyWithdraw_revertZeroStake() public {
        vm.prank(alice);
        vm.expectRevert(IStakingRewards.ZeroAmount.selector);
        staking.emergencyWithdraw(0);
    }

    // ═══════════════════════════════════════════════════════
    // ── Edge Case Tests ───────────────────────────────────
    // ═══════════════════════════════════════════════════════

    function test_stakeAfterLongGap() public {
        // No one stakes for 1000 seconds
        vm.warp(block.timestamp + 1000);

        // Alice stakes — should NOT receive phantom rewards
        vm.prank(alice);
        staking.stake(0, 100e18);

        vm.warp(block.timestamp + 10);

        uint256 pending = staking.pendingReward(0, alice);
        // Should only have 10 seconds of rewards, not 1010
        assertApproxEqAbs(pending, 10e18, 1e15);
    }

    function test_noBoostPool() public {
        // Add a pool with no agent token (address(0))
        staking.addPool(address(lpToken2), address(0), 0, ALLOC_POINT);

        lpToken2.mint(alice, 1_000e18);
        vm.prank(alice);
        lpToken2.approve(address(staking), type(uint256).max);

        // Give Alice agent tokens (shouldn't matter for this pool)
        agentToken.mint(alice, 200e18);

        vm.prank(alice);
        staking.stake(1, 100e18);

        IStakingRewards.UserInfo memory info = staking.getUserInfo(1, alice);
        assertFalse(info.boosted);
        assertEq(info.effectiveAmount, 100e18); // No boost even with agent tokens
    }

    function test_pendingReward_viewAccuracy() public {
        vm.prank(alice);
        staking.stake(0, 100e18);

        vm.warp(block.timestamp + 100);

        uint256 pending = staking.pendingReward(0, alice);
        assertApproxEqAbs(pending, 100e18, 1e15);

        // Claim and verify the view was accurate
        vm.prank(alice);
        staking.claim(0);

        assertApproxEqAbs(runToken.balanceOf(alice), pending, 1e15);
    }

    function test_pendingReward_nonexistentPool() public view {
        // Should return 0 for non-existent pool, not revert
        uint256 pending = staking.pendingReward(999, alice);
        assertEq(pending, 0);
    }

    // ═══════════════════════════════════════════════════════
    // ── Fuzz Tests ────────────────────────────────────────
    // ═══════════════════════════════════════════════════════

    function testFuzz_stake_withdraw_claim(uint256 stakeAmount, uint256 timeElapsed) public {
        stakeAmount = bound(stakeAmount, 1e18, 1_000_000e18);
        timeElapsed = bound(timeElapsed, 1, 365 days);

        // Mint enough LP tokens
        lpToken.mint(alice, stakeAmount);

        vm.prank(alice);
        staking.stake(0, stakeAmount);

        vm.warp(block.timestamp + timeElapsed);

        uint256 pending = staking.pendingReward(0, alice);

        // Expected: timeElapsed * runPerSecond (sole staker, sole pool)
        uint256 expected = timeElapsed * RUN_PER_SECOND;
        assertApproxEqAbs(pending, expected, 1e15);

        vm.prank(alice);
        staking.claim(0);

        assertApproxEqAbs(runToken.balanceOf(alice), expected, 1e15);
    }

    function testFuzz_boostedVsUnboosted(uint256 stakeAmount) public {
        stakeAmount = bound(stakeAmount, 1e18, 100_000e18);

        // Alice boosted, Bob unboosted, same stake
        agentToken.mint(alice, 200e18);
        lpToken.mint(alice, stakeAmount);
        lpToken.mint(bob, stakeAmount);

        vm.prank(alice);
        staking.stake(0, stakeAmount);
        vm.prank(bob);
        staking.stake(0, stakeAmount);

        vm.warp(block.timestamp + 100);

        uint256 alicePending = staking.pendingReward(0, alice);
        uint256 bobPending = staking.pendingReward(0, bob);

        // Alice effective = stakeAmount * 3, Bob effective = stakeAmount * 1
        // Total effective = stakeAmount * 4
        // Alice share = 3/4, Bob share = 1/4
        // Total rewards = 100 * RUN_PER_SECOND = 100e18
        uint256 totalRewards = 100 * RUN_PER_SECOND;
        assertApproxEqAbs(alicePending, (totalRewards * 3) / 4, 1e15);
        assertApproxEqAbs(bobPending, totalRewards / 4, 1e15);
    }
}
