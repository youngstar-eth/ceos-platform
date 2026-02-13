// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IRevenuePool } from "./interfaces/IRevenuePool.sol";

/// @title RevenuePool
/// @notice Epoch-based revenue distribution pool for OpenClaw protocol.
/// @dev Accepts ETH and USDC deposits. At epoch end, 50% of revenue is distributed
///      to creators based on their creator scores. Uses pull pattern for claims
///      with double-claim protection.
contract RevenuePool is IRevenuePool, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Epoch duration in seconds (default: 7 days)
    uint256 public epochDuration;

    /// @notice Timestamp when the first epoch started
    uint256 public genesisTimestamp;

    /// @notice The USDC token contract on Base
    IERC20 public immutable usdc;

    /// @notice The address authorized to submit epoch scores
    address public scoreSubmitter;

    /// @notice Creator share percentage in basis points (50% = 5000)
    uint256 public constant CREATOR_SHARE_BPS = 5_000;

    /// @notice Basis points denominator
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Revenue accumulated per epoch (in ETH wei)
    mapping(uint256 => uint256) private _epochRevenue;

    /// @notice USDC revenue accumulated per epoch
    mapping(uint256 => uint256) private _epochRevenueUSDC;

    /// @notice Whether an epoch has been finalized with score submissions
    mapping(uint256 => bool) private _epochFinalized;

    /// @notice Creator's claimable share per epoch (in ETH wei)
    mapping(address => mapping(uint256 => uint256)) private _creatorShares;

    /// @notice Creator's claimable USDC share per epoch
    mapping(address => mapping(uint256 => uint256)) private _creatorSharesUSDC;

    /// @notice Double-claim protection: tracks whether a creator has claimed for an epoch
    mapping(address => mapping(uint256 => bool)) private _claimed;

    /// @notice Total score sum per epoch for proportional distribution
    mapping(uint256 => uint256) private _epochTotalScores;

    /// @param _usdc The USDC token contract address on Base
    /// @param _scoreSubmitter The address authorized to submit epoch scores
    constructor(address _usdc, address _scoreSubmitter) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        scoreSubmitter = _scoreSubmitter;
        epochDuration = 7 days;
        genesisTimestamp = block.timestamp;
    }

    /// @notice Deposit ETH into the revenue pool for the current epoch
    /// @dev Accepts ETH via msg.value and credits it to the current epoch's revenue
    function deposit() external payable nonReentrant {
        uint256 epoch = getCurrentEpoch();
        _epochRevenue[epoch] += msg.value;
        emit RevenueDeposited(msg.sender, msg.value, false);
    }

    /// @notice Deposit USDC into the revenue pool for the current epoch
    /// @dev Transfers USDC from sender and credits it to the current epoch's revenue
    /// @param amount The amount of USDC to deposit (in USDC decimals)
    function depositUSDC(uint256 amount) external nonReentrant {
        uint256 epoch = getCurrentEpoch();
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        _epochRevenueUSDC[epoch] += amount;
        emit RevenueDeposited(msg.sender, amount, true);
    }

    /// @notice Submit creator scores for an epoch and finalize revenue distribution
    /// @dev Only callable by the authorized score submitter. Calculates each creator's
    ///      proportional share of 50% of the epoch's total revenue based on their scores.
    /// @param epoch The epoch number to finalize
    /// @param creators Array of creator addresses
    /// @param scores Array of creator scores (must match creators array length)
    function submitEpochScores(uint256 epoch, address[] calldata creators, uint256[] calldata scores)
        external
        nonReentrant
    {
        if (msg.sender != scoreSubmitter && msg.sender != owner()) revert InvalidEpoch();
        if (creators.length != scores.length) revert ArrayLengthMismatch();
        if (_epochFinalized[epoch]) revert InvalidEpoch();

        uint256 totalScore;
        for (uint256 i; i < scores.length; ++i) {
            totalScore += scores[i];
        }

        if (totalScore == 0) revert InvalidEpoch();

        // Calculate creator share (50% of total revenue)
        uint256 ethCreatorPool = (_epochRevenue[epoch] * CREATOR_SHARE_BPS) / BPS_DENOMINATOR;
        uint256 usdcCreatorPool = (_epochRevenueUSDC[epoch] * CREATOR_SHARE_BPS) / BPS_DENOMINATOR;

        // Distribute proportionally based on scores
        for (uint256 i; i < creators.length; ++i) {
            if (scores[i] > 0) {
                _creatorShares[creators[i]][epoch] = (ethCreatorPool * scores[i]) / totalScore;
                _creatorSharesUSDC[creators[i]][epoch] = (usdcCreatorPool * scores[i]) / totalScore;
            }
        }

        _epochFinalized[epoch] = true;
        _epochTotalScores[epoch] = totalScore;

        emit EpochFinalized(epoch, _epochRevenue[epoch] + _epochRevenueUSDC[epoch], ethCreatorPool + usdcCreatorPool);
    }

    /// @notice Claim revenue for a finalized epoch using pull pattern
    /// @dev Double-claim protection ensures each creator can only claim once per epoch.
    ///      Transfers both ETH and USDC shares if available.
    /// @param epoch The epoch number to claim revenue for
    function claimRevenue(uint256 epoch) external nonReentrant {
        if (!_epochFinalized[epoch]) revert EpochNotFinalized();
        if (_claimed[msg.sender][epoch]) revert AlreadyClaimed();

        uint256 ethShare = _creatorShares[msg.sender][epoch];
        uint256 usdcShare = _creatorSharesUSDC[msg.sender][epoch];

        if (ethShare == 0 && usdcShare == 0) revert NothingToClaim();

        _claimed[msg.sender][epoch] = true;

        if (ethShare > 0) {
            (bool sent,) = msg.sender.call{ value: ethShare }("");
            if (!sent) revert TransferFailed();
        }

        if (usdcShare > 0) {
            usdc.safeTransfer(msg.sender, usdcShare);
        }

        emit RevenueClaimed(msg.sender, epoch, ethShare + usdcShare);
    }

    /// @notice Get the claimable amount for a creator in a specific epoch
    /// @param creator The creator's wallet address
    /// @param epoch The epoch number to check
    /// @return The total claimable amount (ETH + USDC combined value)
    function getClaimable(address creator, uint256 epoch) external view returns (uint256) {
        if (_claimed[creator][epoch]) return 0;
        return _creatorShares[creator][epoch] + _creatorSharesUSDC[creator][epoch];
    }

    /// @notice Get the current epoch number based on genesis timestamp and epoch duration
    /// @return The current epoch number (0-indexed)
    function getCurrentEpoch() public view returns (uint256) {
        return (block.timestamp - genesisTimestamp) / epochDuration;
    }

    /// @notice Get revenue details for a specific epoch
    /// @param epoch The epoch number to query
    /// @return total The total revenue deposited in the epoch
    /// @return creatorShare The creator's share (50%) of the total revenue
    /// @return finalized Whether the epoch has been finalized
    function getEpochRevenue(uint256 epoch) external view returns (uint256 total, uint256 creatorShare, bool finalized) {
        total = _epochRevenue[epoch] + _epochRevenueUSDC[epoch];
        creatorShare = (total * CREATOR_SHARE_BPS) / BPS_DENOMINATOR;
        finalized = _epochFinalized[epoch];
    }

    /// @notice Update the epoch duration (owner only)
    /// @param newDuration The new epoch duration in seconds
    function setEpochDuration(uint256 newDuration) external onlyOwner {
        uint256 oldDuration = epochDuration;
        epochDuration = newDuration;
        emit EpochDurationUpdated(oldDuration, newDuration);
    }

    /// @notice Update the score submitter address (owner only)
    /// @param newSubmitter The new score submitter address
    function setScoreSubmitter(address newSubmitter) external onlyOwner {
        scoreSubmitter = newSubmitter;
    }

    /// @notice Accept ETH transfers (e.g., from AgentFactory fee splits)
    receive() external payable {
        uint256 epoch = getCurrentEpoch();
        _epochRevenue[epoch] += msg.value;
        emit RevenueDeposited(msg.sender, msg.value, false);
    }
}
