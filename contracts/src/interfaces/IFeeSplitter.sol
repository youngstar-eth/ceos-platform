// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IFeeSplitter
/// @notice Interface for the protocol fee distribution contract (v2)
/// @dev Routes protocol revenue using the 40/40/20 split:
///      40% Agent Growth, 40% $RUN Buyback & Burn, 20% Scout Fund.
///      Uses a two-phase pull pattern for failure isolation.
interface IFeeSplitter {
    // ── Structs ────────────────────────────────────────────

    /// @notice Tracks allocated but unclaimed shares for a recipient
    /// @param ethAmount Accumulated ETH available to claim
    /// @param usdcAmount Accumulated USDC available to claim
    struct ClaimableBalance {
        uint256 ethAmount;
        uint256 usdcAmount;
    }

    /// @notice Snapshot of a single fee distribution event
    /// @param distributor The address that initiated the distribution
    /// @param agentTreasury The agent treasury that received the growth allocation
    /// @param totalETH Total ETH distributed in this event
    /// @param totalUSDC Total USDC distributed in this event
    /// @param timestamp Block timestamp of the distribution
    struct DistributionRecord {
        address distributor;
        address agentTreasury;
        uint256 totalETH;
        uint256 totalUSDC;
        uint256 timestamp;
    }

    // ── Events ─────────────────────────────────────────────

    /// @notice Emitted when fees are allocated to the three recipient pools
    /// @param distributionId Unique identifier for this distribution
    /// @param agentTreasury The agent treasury receiving the growth share
    /// @param growthETH ETH allocated to agent growth
    /// @param buybackETH ETH allocated to $RUN buyback
    /// @param scoutETH ETH allocated to scout fund
    /// @param isUSDC Whether this was a USDC distribution (false = ETH)
    event FeesAllocated(
        uint256 indexed distributionId,
        address indexed agentTreasury,
        uint256 growthETH,
        uint256 buybackETH,
        uint256 scoutETH,
        bool isUSDC
    );

    /// @notice Emitted when a recipient claims their accumulated ETH balance
    /// @param recipient The address that claimed
    /// @param amount The ETH amount claimed
    event ETHClaimed(address indexed recipient, uint256 amount);

    /// @notice Emitted when a recipient claims their accumulated USDC balance
    /// @param recipient The address that claimed
    /// @param amount The USDC amount claimed
    event USDCClaimed(address indexed recipient, uint256 amount);

    /// @notice Emitted when the protocol treasury (buyback) address is updated
    /// @param oldTreasury The previous protocol treasury address
    /// @param newTreasury The new protocol treasury address
    event ProtocolTreasuryUpdated(address oldTreasury, address newTreasury);

    /// @notice Emitted when the scout fund address is updated
    /// @param oldFund The previous scout fund address
    /// @param newFund The new scout fund address
    event ScoutFundUpdated(address oldFund, address newFund);

    /// @notice Emitted when a distributor's authorization status changes
    /// @param distributor The distributor address
    /// @param authorized Whether the distributor is now authorized
    event DistributorUpdated(address indexed distributor, bool authorized);

    // ── Errors ─────────────────────────────────────────────

    /// @notice Thrown when attempting to distribute zero fees
    error NoFeesToDistribute();

    /// @notice Thrown when a zero address is provided where one is not allowed
    error ZeroAddress();

    /// @notice Thrown when an ETH transfer fails during claim
    error ETHTransferFailed();

    /// @notice Thrown when a caller is not an authorized distributor
    error UnauthorizedDistributor();

    /// @notice Thrown when attempting to claim with zero balance
    error NothingToClaim();

    // ── Phase 1: Allocation ────────────────────────────────

    /// @notice Allocate ETH fees into the three recipient pools (growth, buyback, scout)
    /// @dev Phase 1 of the pull pattern. Calculates shares and updates claimable balances.
    ///      The agent treasury receives 40% (growth), protocol treasury receives 40% (buyback),
    ///      and scout fund receives 20%. Growth gets remainder to prevent rounding loss.
    ///      Does NOT transfer funds — recipients must call claim functions.
    /// @param agentTreasury The agent's treasury address to receive the 40% growth allocation
    function distributeFees(address agentTreasury) external payable;

    /// @notice Allocate USDC fees into the three recipient pools (growth, buyback, scout)
    /// @dev Phase 1 of the pull pattern for USDC. Transfers USDC from caller to this contract,
    ///      then calculates and records claimable shares. Requires prior USDC approval.
    /// @param agentTreasury The agent's treasury address to receive the 40% growth allocation
    /// @param amount The total USDC amount to distribute (caller must have approved this contract)
    function distributeUSDCFees(address agentTreasury, uint256 amount) external;

    // ── Phase 2: Claims ────────────────────────────────────

    /// @notice Claim all accumulated ETH for the caller
    /// @dev Phase 2 of the pull pattern. Uses checks-effects-interactions and ReentrancyGuard.
    ///      Zeroes the balance before transferring to prevent reentrancy.
    function claimETH() external;

    /// @notice Claim all accumulated USDC for the caller
    /// @dev Phase 2 of the pull pattern. Uses SafeERC20 for the transfer.
    ///      Zeroes the balance before transferring to prevent reentrancy.
    function claimUSDC() external;

    // ── Views ──────────────────────────────────────────────

    /// @notice Get the claimable ETH and USDC balances for a recipient
    /// @param recipient The address to check
    /// @return ethAmount The claimable ETH amount
    /// @return usdcAmount The claimable USDC amount
    function getClaimable(address recipient) external view returns (uint256 ethAmount, uint256 usdcAmount);

    /// @notice Get details of a specific distribution event
    /// @param distributionId The distribution event ID
    /// @return record The distribution record
    function getDistribution(uint256 distributionId) external view returns (DistributionRecord memory record);

    /// @notice Get the total number of distribution events
    /// @return The distribution count
    function getDistributionCount() external view returns (uint256);

    // ── Admin ──────────────────────────────────────────────

    /// @notice Update the protocol treasury (buyback destination) address
    /// @param newTreasury The new protocol treasury address
    function setProtocolTreasury(address newTreasury) external;

    /// @notice Update the scout fund address
    /// @param newScoutFund The new scout fund address
    function setScoutFund(address newScoutFund) external;

    /// @notice Authorize or revoke a distributor address
    /// @param distributor The address to authorize or revoke
    /// @param authorized Whether to grant or revoke distribution rights
    function setAuthorizedDistributor(address distributor, bool authorized) external;
}
