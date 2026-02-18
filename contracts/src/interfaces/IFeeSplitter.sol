// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IFeeSplitter
/// @notice Interface for the hybrid fee distribution contract (Virtuals Protocol v2).
/// @dev Routes protocol revenue using the 40/40/20 split:
///      40% $RUN buyback-and-burn (atomic, on-chain via Uniswap V3)
///      40% Agent token treasury (pull pattern)
///      20% Protocol fee (pull pattern)
interface IFeeSplitter {
    // ── Events ─────────────────────────────────────────────

    /// @notice Emitted when fees are distributed across the three channels
    /// @param distributionId Unique sequential ID for this distribution
    /// @param agentTreasury The agent treasury receiving the 40% agent allocation
    /// @param amountAgent ETH credited to agent treasury (claimable via pull)
    /// @param amountBuyback ETH used for the $RUN buyback-and-burn swap
    /// @param amountProtocol ETH credited to protocol fee recipient (claimable via pull)
    event FeesDistributed(
        uint256 indexed distributionId,
        address indexed agentTreasury,
        uint256 amountAgent,
        uint256 amountBuyback,
        uint256 amountProtocol
    );

    /// @notice Emitted when the $RUN buyback-and-burn swap executes successfully
    /// @param distributionId The distribution ID this buyback belongs to
    /// @param ethSpent The ETH amount swapped for $RUN
    /// @param runBurned The $RUN amount received from Uniswap and burned
    event BuybackExecuted(uint256 indexed distributionId, uint256 ethSpent, uint256 runBurned);

    /// @notice Emitted when $RUN tokens are burned (granular burn tracking)
    /// @param amount The $RUN amount burned in this transaction
    event RunBurned(uint256 amount);

    /// @notice Emitted when a recipient claims their accumulated ETH
    /// @param recipient The address that claimed
    /// @param amount The ETH amount claimed
    event ETHClaimed(address indexed recipient, uint256 amount);

    /// @notice Emitted when the protocol fee recipient is updated
    /// @param oldRecipient The previous protocol fee recipient
    /// @param newRecipient The new protocol fee recipient
    event ProtocolFeeRecipientUpdated(address oldRecipient, address newRecipient);

    /// @notice Emitted when the Uniswap pool fee tier is updated
    /// @param oldFee The previous pool fee
    /// @param newFee The new pool fee
    event PoolFeeUpdated(uint24 oldFee, uint24 newFee);

    /// @notice Emitted when a distributor's authorization status changes
    /// @param distributor The distributor address
    /// @param authorized Whether the distributor is now authorized
    event DistributorUpdated(address indexed distributor, bool authorized);

    // ── Errors ─────────────────────────────────────────────

    /// @notice Thrown when attempting to distribute zero fees
    error NoFeesToDistribute();

    /// @notice Thrown when a zero address is provided where not allowed
    error ZeroAddress();

    /// @notice Thrown when an ETH transfer fails during claim
    error ETHTransferFailed();

    /// @notice Thrown when a caller is not an authorized distributor
    error UnauthorizedDistributor();

    /// @notice Thrown when attempting to claim with zero balance
    error NothingToClaim();

    /// @notice Thrown when an invalid pool fee is provided (zero)
    error InvalidPoolFee();

    // ── Core: Distribution ─────────────────────────────────

    /// @notice Distribute ETH fees: atomic $RUN buyback-and-burn + pull-pattern allocations
    /// @dev Performs the 40/40/20 split:
    ///      - 40% buyback: ETH -> WETH -> Uniswap swap -> $RUN -> burn (atomic)
    ///      - 40% agent: credited to agentTreasury (claimable via claimETH)
    ///      - 20% protocol: credited to protocolFeeRecipient (claimable via claimETH)
    ///      Agent treasury gets remainder after buyback + protocol to absorb rounding dust.
    /// @param agentTreasury The agent's treasury address receiving the 40% growth allocation
    /// @param minRunOut Minimum $RUN tokens to receive from the swap (slippage protection)
    function distribute(address agentTreasury, uint256 minRunOut) external payable;

    // ── Claims ─────────────────────────────────────────────

    /// @notice Claim all accumulated ETH for the caller
    /// @dev Uses checks-effects-interactions: zeroes balance before transfer.
    function claimETH() external;

    // ── Views ──────────────────────────────────────────────

    /// @notice Get the claimable ETH balance for a recipient
    /// @param recipient The address to check
    /// @return ethAmount The claimable ETH amount
    function getClaimable(address recipient) external view returns (uint256 ethAmount);

    /// @notice Get the total number of distribution events
    /// @return The distribution count
    function getDistributionCount() external view returns (uint256);

    // ── Admin ──────────────────────────────────────────────

    /// @notice Update the protocol fee recipient address
    /// @param newRecipient The new protocol fee recipient address
    function setProtocolFeeRecipient(address newRecipient) external;

    /// @notice Update the Uniswap V3 pool fee tier
    /// @param newFee The new pool fee (e.g., 3000 for 0.30%)
    function setPoolFee(uint24 newFee) external;

    /// @notice Authorize or revoke a distributor address
    /// @param distributor The address to authorize or revoke
    /// @param authorized Whether to grant or revoke distribution rights
    function setAuthorizedDistributor(address distributor, bool authorized) external;
}
