// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IScoutFund
/// @notice Interface for the protocol-owned venture capital fund (v2 Scout Engine)
/// @dev Receives 20% of all protocol fees via FeeSplitter pull pattern. Invests autonomously
///      into whitelisted low-cap agent tokens via Uniswap V3, creating buy pressure
///      that drives the agent flywheel. Holds purchased tokens as Protocol Owned Liquidity (POL).
///
///      Investment lifecycle:
///        1. FeeSplitter allocates 20% → ScoutFund claims via claimETH/claimUSDC
///        2. Scout worker (backend) identifies promising agents
///        3. Owner whitelists agent token via setScoutableToken()
///        4. Scout worker calls invest() → swaps ETH/USDC → agent token
///        5. Fund holds tokens long-term (POL, no auto-sell)
///        6. Optional: Owner can divest() in governance-approved scenarios
interface IScoutFund {
    // ── Structs ────────────────────────────────────────────

    /// @notice Tracks a single investment position in an agent token
    /// @param token The agent token contract address
    /// @param totalInvested The cumulative input asset spent (ETH or USDC, in wei/decimals)
    /// @param totalTokensAcquired The cumulative agent tokens bought
    /// @param totalDivested The cumulative agent tokens divested (sold or withdrawn)
    /// @param investmentCount Number of individual investment transactions
    /// @param firstInvestedAt Timestamp of the first investment
    /// @param lastInvestedAt Timestamp of the most recent investment
    struct Position {
        address token;
        uint256 totalInvested;
        uint256 totalTokensAcquired;
        uint256 totalDivested;
        uint256 investmentCount;
        uint256 firstInvestedAt;
        uint256 lastInvestedAt;
    }

    /// @notice Summary of fund holdings for dashboard display
    /// @param token The agent token address
    /// @param currentBalance The current token balance held by the fund
    /// @param totalInvested The cumulative input asset spent
    /// @param totalTokensAcquired The cumulative tokens acquired
    struct HoldingSummary {
        address token;
        uint256 currentBalance;
        uint256 totalInvested;
        uint256 totalTokensAcquired;
    }

    // ── Events ─────────────────────────────────────────────

    /// @notice Emitted when the fund invests in an agent token
    /// @param token The agent token purchased
    /// @param inputToken The token spent (WETH or USDC)
    /// @param amountIn The amount of input token spent
    /// @param amountOut The amount of agent tokens received
    event Invested(address indexed token, address indexed inputToken, uint256 amountIn, uint256 amountOut);

    /// @notice Emitted when the fund divests from an agent token
    /// @param token The agent token sold
    /// @param outputToken The token received (WETH or USDC)
    /// @param amountIn The amount of agent tokens sold
    /// @param amountOut The amount of output token received
    event Divested(address indexed token, address indexed outputToken, uint256 amountIn, uint256 amountOut);

    /// @notice Emitted when an agent token is added to or removed from the scoutable whitelist
    /// @param token The agent token address
    /// @param scoutable Whether the token is now scoutable
    event ScoutableTokenUpdated(address indexed token, bool scoutable);

    /// @notice Emitted when a scout worker address is authorized or revoked
    /// @param worker The scout worker address
    /// @param authorized Whether the worker is now authorized
    event ScoutWorkerUpdated(address indexed worker, bool authorized);

    /// @notice Emitted when the maximum investment per token is updated
    /// @param oldLimit The previous limit
    /// @param newLimit The new limit
    event MaxInvestmentPerTokenUpdated(uint256 oldLimit, uint256 newLimit);

    /// @notice Emitted when ETH is deposited into the fund
    /// @param sender The depositor address
    /// @param amount The ETH amount
    event ETHDeposited(address indexed sender, uint256 amount);

    /// @notice Emitted when an emergency withdrawal is executed
    /// @param token The token withdrawn (address(0) for ETH)
    /// @param amount The amount withdrawn
    /// @param recipient The address that received the withdrawal
    event EmergencyWithdrawal(address indexed token, uint256 amount, address indexed recipient);

    // ── Errors ─────────────────────────────────────────────

    /// @notice Thrown when a zero address is provided
    error ZeroAddress();

    /// @notice Thrown when a zero amount is provided
    error ZeroAmount();

    /// @notice Thrown when the caller is not an authorized scout worker
    error UnauthorizedScoutWorker();

    /// @notice Thrown when attempting to invest in a non-whitelisted token
    error TokenNotScoutable();

    /// @notice Thrown when an investment would exceed the per-token limit
    error MaxInvestmentExceeded();

    /// @notice Thrown when the fund has insufficient balance for an operation
    error InsufficientBalance();

    /// @notice Thrown when an ETH transfer fails
    error ETHTransferFailed();

    /// @notice Thrown when attempting to divest more tokens than the fund holds
    error InsufficientPosition();

    /// @notice Thrown when a token is already in the requested whitelist state
    error TokenAlreadyInState();

    // ── Capital Ingress ────────────────────────────────────

    /// @notice Claim accumulated ETH from the FeeSplitter (pull pattern)
    /// @dev Calls FeeSplitter.claimETH() to pull the 20% scout allocation
    function claimFundingETH() external;

    /// @notice Claim accumulated USDC from the FeeSplitter (pull pattern)
    /// @dev Calls FeeSplitter.claimUSDC() to pull the 20% scout allocation
    function claimFundingUSDC() external;

    // ── Investment (The VC Engine) ─────────────────────────

    /// @notice Invest fund capital into a whitelisted agent token via Uniswap V3
    /// @dev Only callable by authorized scout workers. Token must be in the scoutable whitelist.
    ///      Investment is capped per-token to prevent concentration risk.
    /// @param agentToken The whitelisted agent token to purchase
    /// @param inputToken The token to spend (WETH address for ETH, or USDC)
    /// @param amountIn The amount of input token to invest
    /// @param fee The Uniswap V3 pool fee tier (500, 3000, or 10000)
    /// @param amountOutMinimum Minimum agent tokens to receive (slippage protection)
    /// @return amountOut The actual amount of agent tokens acquired
    function invest(
        address agentToken,
        address inputToken,
        uint256 amountIn,
        uint24 fee,
        uint256 amountOutMinimum
    ) external returns (uint256 amountOut);

    /// @notice Divest from an agent token position (governance-gated emergency)
    /// @dev Only callable by the contract owner. Used for governance-approved divestments
    ///      when a position needs to be unwound (e.g., compromised token, rebalancing).
    /// @param agentToken The agent token to sell
    /// @param outputToken The token to receive (WETH or USDC)
    /// @param amountIn The amount of agent tokens to sell
    /// @param fee The Uniswap V3 pool fee tier
    /// @param amountOutMinimum Minimum output to receive (slippage protection)
    /// @return amountOut The actual amount of output token received
    function divest(
        address agentToken,
        address outputToken,
        uint256 amountIn,
        uint24 fee,
        uint256 amountOutMinimum
    ) external returns (uint256 amountOut);

    // ── Views (Scout Dashboard) ────────────────────────────

    /// @notice Get the fund's current ETH balance
    /// @return The ETH balance in wei
    function getETHBalance() external view returns (uint256);

    /// @notice Get all current fund holdings with balances
    /// @return holdings Array of HoldingSummary structs for all positions
    function getFundHoldings() external view returns (HoldingSummary[] memory holdings);

    /// @notice Get the detailed position for a specific agent token
    /// @param agentToken The agent token address
    /// @return position The full position details
    function getPosition(address agentToken) external view returns (Position memory position);

    /// @notice Get the total number of active positions
    /// @return The count of unique tokens with positions
    function getPositionCount() external view returns (uint256);

    /// @notice Check if an agent token is in the scoutable whitelist
    /// @param token The token address to check
    /// @return Whether the token is scoutable
    function isScoutable(address token) external view returns (bool);

    // ── Admin (Owner Only) ─────────────────────────────────

    /// @notice Add or remove an agent token from the scoutable whitelist
    /// @param token The agent token address
    /// @param scoutable Whether to whitelist (true) or delist (false)
    function setScoutableToken(address token, bool scoutable) external;

    /// @notice Authorize or revoke a scout worker address
    /// @param worker The scout worker (backend bot) address
    /// @param authorized Whether to authorize or revoke
    function setScoutWorker(address worker, bool authorized) external;

    /// @notice Update the maximum cumulative investment per token
    /// @param newLimit The new maximum in wei (applies to input token, not agent token)
    function setMaxInvestmentPerToken(uint256 newLimit) external;

    /// @notice Emergency withdrawal of all assets to the owner
    /// @dev Only callable by owner. Safety valve for contract migration or emergency.
    function emergencyWithdraw() external;
}
