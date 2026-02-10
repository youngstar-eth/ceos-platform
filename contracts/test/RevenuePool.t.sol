// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { RevenuePool } from "../src/RevenuePool.sol";
import { IRevenuePool } from "../src/interfaces/IRevenuePool.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";

/// @title RevenuePoolTest
/// @notice Comprehensive tests for RevenuePool contract
contract RevenuePoolTest is Test {
    RevenuePool public pool;
    MockERC20 public usdc;

    address public owner;
    address public submitter;
    address public creator1;
    address public creator2;
    address public depositor;

    function setUp() public {
        owner = address(this);
        submitter = makeAddr("submitter");
        creator1 = makeAddr("creator1");
        creator2 = makeAddr("creator2");
        depositor = makeAddr("depositor");

        usdc = new MockERC20("USDC", "USDC", 6);
        pool = new RevenuePool(address(usdc), submitter);
    }

    /// @notice Test ETH deposit to current epoch
    function test_deposit_eth() public {
        vm.deal(depositor, 1 ether);
        vm.prank(depositor);
        pool.deposit{ value: 0.5 ether }();

        (uint256 total,,) = pool.getEpochRevenue(0);
        assertEq(total, 0.5 ether, "Epoch revenue should be 0.5 ETH");
    }

    /// @notice Test USDC deposit to current epoch
    function test_deposit_usdc() public {
        uint256 amount = 1000e6; // 1000 USDC
        usdc.mint(depositor, amount);

        vm.prank(depositor);
        usdc.approve(address(pool), amount);

        vm.prank(depositor);
        pool.depositUSDC(amount);

        (uint256 total,,) = pool.getEpochRevenue(0);
        assertEq(total, amount, "Epoch revenue should be 1000 USDC");
    }

    /// @notice Test epoch score submission and finalization
    function test_submitEpochScores() public {
        // Deposit some ETH
        vm.deal(depositor, 2 ether);
        vm.prank(depositor);
        pool.deposit{ value: 2 ether }();

        // Submit scores
        address[] memory creators = new address[](2);
        creators[0] = creator1;
        creators[1] = creator2;

        uint256[] memory scores = new uint256[](2);
        scores[0] = 7000; // 70%
        scores[1] = 3000; // 30%

        vm.prank(submitter);
        pool.submitEpochScores(0, creators, scores);

        (,, bool finalized) = pool.getEpochRevenue(0);
        assertTrue(finalized, "Epoch should be finalized");
    }

    /// @notice Test revenue claim (pull pattern)
    function test_claimRevenue() public {
        // Deposit ETH
        vm.deal(depositor, 2 ether);
        vm.prank(depositor);
        pool.deposit{ value: 2 ether }();

        // Submit scores
        address[] memory creators = new address[](2);
        creators[0] = creator1;
        creators[1] = creator2;

        uint256[] memory scores = new uint256[](2);
        scores[0] = 7000;
        scores[1] = 3000;

        vm.prank(submitter);
        pool.submitEpochScores(0, creators, scores);

        // Claim for creator1
        uint256 claimable = pool.getClaimable(creator1, 0);
        assertTrue(claimable > 0, "Creator1 should have claimable amount");

        uint256 balBefore = creator1.balance;
        vm.prank(creator1);
        pool.claimRevenue(0);
        uint256 balAfter = creator1.balance;

        assertTrue(balAfter > balBefore, "Creator1 balance should increase");
    }

    /// @notice Test double-claim protection
    function test_claimRevenue_doubleClaim() public {
        vm.deal(depositor, 2 ether);
        vm.prank(depositor);
        pool.deposit{ value: 2 ether }();

        address[] memory creators = new address[](1);
        creators[0] = creator1;

        uint256[] memory scores = new uint256[](1);
        scores[0] = 10_000;

        vm.prank(submitter);
        pool.submitEpochScores(0, creators, scores);

        vm.prank(creator1);
        pool.claimRevenue(0);

        vm.prank(creator1);
        vm.expectRevert(IRevenuePool.AlreadyClaimed.selector);
        pool.claimRevenue(0);
    }

    /// @notice Test claiming from non-finalized epoch reverts
    function test_claimRevenue_epochNotFinalized() public {
        vm.prank(creator1);
        vm.expectRevert(IRevenuePool.EpochNotFinalized.selector);
        pool.claimRevenue(0);
    }

    /// @notice Test claiming with no claimable amount reverts
    function test_claimRevenue_nothingToClaim() public {
        vm.deal(depositor, 2 ether);
        vm.prank(depositor);
        pool.deposit{ value: 2 ether }();

        address[] memory creators = new address[](1);
        creators[0] = creator1;

        uint256[] memory scores = new uint256[](1);
        scores[0] = 10_000;

        vm.prank(submitter);
        pool.submitEpochScores(0, creators, scores);

        // creator2 has no score, so nothing to claim
        vm.prank(creator2);
        vm.expectRevert(IRevenuePool.NothingToClaim.selector);
        pool.claimRevenue(0);
    }

    /// @notice Test array length mismatch reverts
    function test_submitEpochScores_arrayMismatch() public {
        address[] memory creators = new address[](2);
        creators[0] = creator1;
        creators[1] = creator2;

        uint256[] memory scores = new uint256[](1);
        scores[0] = 10_000;

        vm.prank(submitter);
        vm.expectRevert(IRevenuePool.ArrayLengthMismatch.selector);
        pool.submitEpochScores(0, creators, scores);
    }

    /// @notice Test epoch finalization
    function test_getEpochRevenue() public {
        vm.deal(depositor, 1 ether);
        vm.prank(depositor);
        pool.deposit{ value: 1 ether }();

        (uint256 total, uint256 creatorShare, bool finalized) = pool.getEpochRevenue(0);
        assertEq(total, 1 ether, "Total should be 1 ETH");
        assertEq(creatorShare, 0.5 ether, "Creator share should be 50%");
        assertFalse(finalized, "Should not be finalized yet");
    }

    /// @notice Test getCurrentEpoch calculation
    function test_getCurrentEpoch() public view {
        assertEq(pool.getCurrentEpoch(), 0, "Initial epoch should be 0");
    }

    /// @notice Test epoch advances with time
    function test_getCurrentEpoch_advances() public {
        assertEq(pool.getCurrentEpoch(), 0);

        // Advance 7 days
        vm.warp(block.timestamp + 7 days);
        assertEq(pool.getCurrentEpoch(), 1, "Should be epoch 1 after 7 days");

        // Advance another 7 days
        vm.warp(block.timestamp + 7 days);
        assertEq(pool.getCurrentEpoch(), 2, "Should be epoch 2 after 14 days");
    }

    /// @notice Test receive() function credits revenue
    function test_receive_creditsRevenue() public {
        vm.deal(depositor, 1 ether);
        vm.prank(depositor);
        (bool sent,) = address(pool).call{ value: 0.5 ether }("");
        assertTrue(sent, "ETH transfer should succeed");

        (uint256 total,,) = pool.getEpochRevenue(0);
        assertEq(total, 0.5 ether, "Revenue should be credited via receive()");
    }

    /// @notice Test setEpochDuration
    function test_setEpochDuration() public {
        pool.setEpochDuration(14 days);
        assertEq(pool.epochDuration(), 14 days, "Epoch duration should be updated");
    }
}
