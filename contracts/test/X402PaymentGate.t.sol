// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { X402PaymentGate } from "../src/X402PaymentGate.sol";
import { IX402PaymentGate } from "../src/interfaces/IX402PaymentGate.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";

/// @title X402PaymentGateTest
/// @notice Comprehensive tests for X402PaymentGate contract
contract X402PaymentGateTest is Test {
    X402PaymentGate public gate;
    MockERC20 public usdc;

    address public owner;
    address public processor;
    address public revenuePool;
    address public payer;
    address public unauthorized;

    bytes32 public resourceId = keccak256("premium-api-endpoint");
    uint256 public resourcePrice = 100e6; // 100 USDC

    function setUp() public {
        owner = address(this);
        processor = makeAddr("processor");
        revenuePool = makeAddr("revenuePool");
        payer = makeAddr("payer");
        unauthorized = makeAddr("unauthorized");

        usdc = new MockERC20("USDC", "USDC", 6);
        gate = new X402PaymentGate(address(usdc), revenuePool);

        // Setup
        gate.setAuthorizedProcessor(processor, true);
        gate.setResourcePrice(resourceId, resourcePrice);

        // Fund payer
        usdc.mint(payer, 10_000e6);
        vm.prank(payer);
        usdc.approve(address(gate), type(uint256).max);
    }

    /// @notice Test successful payment processing
    function test_processPayment_success() public {
        vm.prank(processor);
        bytes32 paymentId = gate.processPayment(payer, resourcePrice, resourceId);

        assertTrue(paymentId != bytes32(0), "Payment ID should be non-zero");

        IX402PaymentGate.PaymentInfo memory info = gate.getPayment(paymentId);
        assertEq(info.payer, payer, "Payer should match");
        assertEq(info.amount, resourcePrice, "Amount should match");
        assertEq(info.resourceId, resourceId, "Resource ID should match");
        assertTrue(info.settled, "Payment should be settled");
    }

    /// @notice Test payment with insufficient amount reverts
    function test_processPayment_insufficientPayment() public {
        vm.prank(processor);
        vm.expectRevert(IX402PaymentGate.InsufficientPayment.selector);
        gate.processPayment(payer, 50e6, resourceId); // 50 USDC < 100 USDC price
    }

    /// @notice Test payment for invalid resource reverts
    function test_processPayment_invalidResource() public {
        bytes32 unknownResource = keccak256("unknown-resource");

        vm.prank(processor);
        vm.expectRevert(IX402PaymentGate.InvalidResource.selector);
        gate.processPayment(payer, resourcePrice, unknownResource);
    }

    /// @notice Test unauthorized processor reverts
    function test_processPayment_unauthorizedProcessor() public {
        vm.prank(unauthorized);
        vm.expectRevert(IX402PaymentGate.UnauthorizedProcessor.selector);
        gate.processPayment(payer, resourcePrice, resourceId);
    }

    /// @notice Test get payment for nonexistent ID returns empty
    function test_getPayment_nonexistent() public view {
        IX402PaymentGate.PaymentInfo memory info = gate.getPayment(bytes32(0));
        assertEq(info.payer, address(0), "Payer should be zero for nonexistent");
    }

    /// @notice Test set resource price
    function test_setResourcePrice() public {
        bytes32 newResource = keccak256("new-resource");
        gate.setResourcePrice(newResource, 200e6);

        assertEq(gate.getResourcePrice(newResource), 200e6, "Price should be 200 USDC");
    }

    /// @notice Test resource price update
    function test_setResourcePrice_update() public {
        gate.setResourcePrice(resourceId, 500e6);
        assertEq(gate.getResourcePrice(resourceId), 500e6, "Price should be updated to 500 USDC");
    }

    /// @notice Test route revenue to RevenuePool
    function test_routeRevenue() public {
        // Process a payment first
        vm.prank(processor);
        gate.processPayment(payer, resourcePrice, resourceId);

        uint256 accumulated = gate.accumulatedRevenue();
        assertEq(accumulated, resourcePrice, "Should have accumulated revenue");

        uint256 poolBefore = usdc.balanceOf(revenuePool);
        gate.routeRevenue();
        uint256 poolAfter = usdc.balanceOf(revenuePool);

        assertEq(poolAfter - poolBefore, resourcePrice, "Revenue should be routed to pool");
        assertEq(gate.accumulatedRevenue(), 0, "Accumulated should be reset to 0");
    }

    /// @notice Test route revenue with no accumulated revenue reverts
    function test_routeRevenue_noRevenue() public {
        vm.expectRevert(IX402PaymentGate.TransferFailed.selector);
        gate.routeRevenue();
    }

    /// @notice Test multiple payments accumulate
    function test_processPayment_multipleAccumulate() public {
        vm.prank(processor);
        gate.processPayment(payer, resourcePrice, resourceId);

        vm.prank(processor);
        gate.processPayment(payer, resourcePrice, resourceId);

        assertEq(gate.accumulatedRevenue(), resourcePrice * 2, "Should accumulate both payments");
    }

    /// @notice Test setAuthorizedProcessor
    function test_setAuthorizedProcessor() public {
        address newProcessor = makeAddr("newProcessor");
        gate.setAuthorizedProcessor(newProcessor, true);
        assertTrue(gate.authorizedProcessors(newProcessor), "Should be authorized");

        gate.setAuthorizedProcessor(newProcessor, false);
        assertFalse(gate.authorizedProcessors(newProcessor), "Should be revoked");
    }

    /// @notice Test setRevenuePool
    function test_setRevenuePool() public {
        address newPool = makeAddr("newPool");
        gate.setRevenuePool(newPool);
        assertEq(gate.revenuePool(), newPool, "Revenue pool should be updated");
    }
}
