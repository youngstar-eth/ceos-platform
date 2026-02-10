// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IX402PaymentGate } from "./interfaces/IX402PaymentGate.sol";

/// @title X402PaymentGate
/// @notice Payment gateway for x402 HTTP-native micropayments using USDC on Base.
/// @dev Processes USDC payments for resource access, stores payment records,
///      and routes accumulated revenue to the RevenuePool contract. Integrates
///      with the Coinbase CDP facilitator for payment verification.
contract X402PaymentGate is IX402PaymentGate, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The USDC token contract on Base
    IERC20 public immutable usdc;

    /// @notice The RevenuePool contract that receives routed revenue
    address public revenuePool;

    /// @notice Running counter for generating unique payment IDs
    uint256 private _paymentNonce;

    /// @notice Mapping of payment ID to payment details
    mapping(bytes32 => PaymentInfo) private _payments;

    /// @notice Mapping of resource ID to its price in USDC
    mapping(bytes32 => uint256) private _resourcePrices;

    /// @notice Set of addresses authorized to process payments
    mapping(address => bool) public authorizedProcessors;

    /// @notice Total accumulated USDC revenue awaiting routing
    uint256 public accumulatedRevenue;

    /// @param _usdc The USDC token contract address on Base
    /// @param _revenuePool The RevenuePool contract address
    constructor(address _usdc, address _revenuePool) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        revenuePool = _revenuePool;
    }

    /// @notice Modifier to restrict payment processing to authorized addresses
    modifier onlyProcessor() {
        if (!authorizedProcessors[msg.sender] && msg.sender != owner()) revert UnauthorizedProcessor();
        _;
    }

    /// @notice Process a USDC payment for resource access
    /// @dev Transfers USDC from the payer to this contract. Validates payment amount
    ///      against the resource price. Generates a unique payment ID for the record.
    /// @param payer The address making the payment
    /// @param amount The USDC amount being paid
    /// @param resourceId The identifier of the resource being accessed
    /// @return paymentId The unique identifier for this payment record
    function processPayment(address payer, uint256 amount, bytes32 resourceId)
        external
        onlyProcessor
        nonReentrant
        returns (bytes32 paymentId)
    {
        uint256 price = _resourcePrices[resourceId];
        if (price == 0) revert InvalidResource();
        if (amount < price) revert InsufficientPayment();

        // Transfer USDC from payer to this contract
        usdc.safeTransferFrom(payer, address(this), amount);

        // Generate unique payment ID
        _paymentNonce++;
        paymentId = keccak256(abi.encodePacked(payer, resourceId, _paymentNonce, block.timestamp));

        _payments[paymentId] = PaymentInfo({
            payer: payer,
            amount: amount,
            resourceId: resourceId,
            timestamp: block.timestamp,
            settled: true
        });

        accumulatedRevenue += amount;

        emit PaymentProcessed(paymentId, payer, amount, resourceId);
    }

    /// @notice Get payment details by payment ID
    /// @param paymentId The unique payment identifier
    /// @return The PaymentInfo struct with payer, amount, resource, timestamp, and settlement status
    function getPayment(bytes32 paymentId) external view returns (PaymentInfo memory) {
        return _payments[paymentId];
    }

    /// @notice Set the price for a resource in USDC
    /// @dev Only callable by the contract owner. Setting price to 0 effectively disables the resource.
    /// @param resourceId The identifier of the resource
    /// @param price The price in USDC (with USDC decimals)
    function setResourcePrice(bytes32 resourceId, uint256 price) external onlyOwner {
        uint256 oldPrice = _resourcePrices[resourceId];
        _resourcePrices[resourceId] = price;
        emit PriceUpdated(resourceId, oldPrice, price);
    }

    /// @notice Get the price of a resource in USDC
    /// @param resourceId The identifier of the resource
    /// @return The price in USDC (with USDC decimals)
    function getResourcePrice(bytes32 resourceId) external view returns (uint256) {
        return _resourcePrices[resourceId];
    }

    /// @notice Route accumulated USDC revenue to the RevenuePool contract
    /// @dev Transfers all accumulated USDC revenue to the RevenuePool. Can be called
    ///      by anyone to trigger the routing (permissionless for liveness).
    function routeRevenue() external nonReentrant {
        uint256 amount = accumulatedRevenue;
        if (amount == 0) revert TransferFailed();

        accumulatedRevenue = 0;

        usdc.safeTransfer(revenuePool, amount);

        emit RevenueRouted(amount, revenuePool);
    }

    /// @notice Authorize or revoke a payment processor address (owner only)
    /// @param processor The address to authorize or revoke
    /// @param authorized Whether the address should be authorized
    function setAuthorizedProcessor(address processor, bool authorized) external onlyOwner {
        authorizedProcessors[processor] = authorized;
    }

    /// @notice Update the revenue pool address (owner only)
    /// @param newRevenuePool The new RevenuePool contract address
    function setRevenuePool(address newRevenuePool) external onlyOwner {
        revenuePool = newRevenuePool;
    }
}
