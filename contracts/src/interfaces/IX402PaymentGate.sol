// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IX402PaymentGate {
    struct PaymentInfo {
        address payer;
        uint256 amount;
        bytes32 resourceId;
        uint256 timestamp;
        bool settled;
    }

    event PaymentProcessed(bytes32 indexed paymentId, address indexed payer, uint256 amount, bytes32 resourceId);
    event PriceUpdated(bytes32 indexed resourceId, uint256 oldPrice, uint256 newPrice);
    event RevenueRouted(uint256 amount, address indexed revenuePool);

    error PaymentAlreadyProcessed();
    error InsufficientPayment();
    error InvalidResource();
    error TransferFailed();
    error UnauthorizedProcessor();

    function processPayment(address payer, uint256 amount, bytes32 resourceId) external returns (bytes32 paymentId);
    function getPayment(bytes32 paymentId) external view returns (PaymentInfo memory);
    function setResourcePrice(bytes32 resourceId, uint256 price) external;
    function getResourcePrice(bytes32 resourceId) external view returns (uint256);
    function routeRevenue() external;
}
