// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IRevenuePool {
    event RevenueDeposited(address indexed depositor, uint256 amount, bool isUSDC);
    event EpochFinalized(uint256 indexed epoch, uint256 totalRevenue, uint256 creatorShare);
    event RevenueClaimed(address indexed creator, uint256 indexed epoch, uint256 amount);
    event EpochDurationUpdated(uint256 oldDuration, uint256 newDuration);

    error EpochNotFinalized();
    error AlreadyClaimed();
    error NothingToClaim();
    error InvalidEpoch();
    error ArrayLengthMismatch();
    error TransferFailed();

    function deposit() external payable;
    function depositUSDC(uint256 amount) external;
    function submitEpochScores(uint256 epoch, address[] calldata creators, uint256[] calldata scores) external;
    function claimRevenue(uint256 epoch) external;
    function getClaimable(address creator, uint256 epoch) external view returns (uint256);
    function getCurrentEpoch() external view returns (uint256);
    function getEpochRevenue(uint256 epoch)
        external
        view
        returns (uint256 total, uint256 creatorShare, bool finalized);
}
