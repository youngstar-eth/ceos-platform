// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IAgentTreasury
/// @notice Interface for per-agent autonomous treasury contracts (v2 Hedge Fund Engine)
/// @dev Deployed as EIP-1167 minimal proxies via AgentFactory. Each agent has its own
///      treasury that holds assets, executes DEX swaps, and performs buyback-and-burn
///      on the agent's $AGENT token.
///
///      Lifecycle:
///        1. Factory deploys clone → calls initialize()
///        2. FeeSplitter allocates growth capital → treasury claims via claimETH/claimUSDC
///        3. Controller (backend worker) triggers swaps → executeSwap()
///        4. Controller triggers buyback → executeBuybackAndBurn()
///        5. Anyone can query AUM via getAUM()
interface IAgentTreasury {
    // ── Structs ────────────────────────────────────────────

    /// @notice Parameters for a Uniswap V3 single-hop swap
    /// @param tokenIn The address of the input token
    /// @param tokenOut The address of the output token
    /// @param fee The Uniswap V3 pool fee tier (500, 3000, or 10000 bps)
    /// @param amountIn The exact amount of tokenIn to swap
    /// @param amountOutMinimum The minimum acceptable output (slippage protection)
    /// @param deadline The unix timestamp after which the swap reverts
    struct SwapParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint256 deadline;
    }

    /// @notice Snapshot of tracked ERC-20 token balance
    /// @param token The token contract address
    /// @param balance The current balance held by this treasury
    struct TokenBalance {
        address token;
        uint256 balance;
    }

    // ── Events ─────────────────────────────────────────────

    /// @notice Emitted when the treasury is initialized for an agent
    /// @param agent The agent address this treasury belongs to
    /// @param creator The creator who deployed the agent
    /// @param controller The backend wallet authorized to execute trades
    event TreasuryInitialized(address indexed agent, address indexed creator, address indexed controller);

    /// @notice Emitted when a DEX swap is executed
    /// @param tokenIn The input token address
    /// @param tokenOut The output token address
    /// @param amountIn The amount of input token spent
    /// @param amountOut The amount of output token received
    event SwapExecuted(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);

    /// @notice Emitted when a buyback-and-burn is executed on the agent's token
    /// @param agentToken The agent token that was bought back and burned
    /// @param amountSpent The amount of input token spent on buyback
    /// @param amountBurned The amount of agent tokens sent to dead address
    event BuybackAndBurn(address indexed agentToken, uint256 amountSpent, uint256 amountBurned);

    /// @notice Emitted when ETH is deposited into the treasury
    /// @param sender The address that sent the ETH
    /// @param amount The amount of ETH deposited
    event ETHDeposited(address indexed sender, uint256 amount);

    /// @notice Emitted when ERC-20 tokens are deposited into the treasury
    /// @param token The token contract address
    /// @param sender The address that sent the tokens
    /// @param amount The amount deposited
    event ERC20Deposited(address indexed token, address indexed sender, uint256 amount);

    /// @notice Emitted when the controller address is updated
    /// @param oldController The previous controller address
    /// @param newController The new controller address
    event ControllerUpdated(address oldController, address newController);

    /// @notice Emitted when a token is added or removed from tracking
    /// @param token The token address
    /// @param tracked Whether the token is now tracked
    event TokenTrackingUpdated(address indexed token, bool tracked);

    /// @notice Emitted when the creator emergency-withdraws assets
    /// @param token The token withdrawn (address(0) for ETH)
    /// @param amount The amount withdrawn
    event EmergencyWithdrawal(address indexed token, uint256 amount);

    // ── Errors ─────────────────────────────────────────────

    /// @notice Thrown when initialize() is called more than once
    error AlreadyInitialized();

    /// @notice Thrown when a zero address is provided where one is not allowed
    error ZeroAddress();

    /// @notice Thrown when the caller is not the authorized controller
    error UnauthorizedController();

    /// @notice Thrown when the caller is not the creator or owner
    error UnauthorizedCreator();

    /// @notice Thrown when a swap or burn amount is zero
    error ZeroAmount();

    /// @notice Thrown when the treasury has insufficient balance for an operation
    error InsufficientBalance();

    /// @notice Thrown when an ETH transfer fails
    error ETHTransferFailed();

    /// @notice Thrown when no agent token is configured for buyback-and-burn
    error AgentTokenNotSet();

    /// @notice Thrown when a swap returns less than the minimum output
    error SlippageExceeded();

    // ── Initialization ─────────────────────────────────────

    /// @notice Initialize the treasury for a specific agent (called once by factory)
    /// @dev Replaces constructor for EIP-1167 clone compatibility. Sets agent identity,
    ///      creator (for emergency withdrawal), and controller (for trade execution).
    /// @param agent The agent address this treasury belongs to
    /// @param creator The creator wallet (emergency withdrawal authority)
    /// @param controller The backend worker wallet (trade execution authority)
    /// @param feeSplitter The FeeSplitter contract to claim growth capital from
    /// @param agentToken The agent's $AGENT token address (for buyback-and-burn, address(0) if not yet deployed)
    function initialize(
        address agent,
        address creator,
        address controller,
        address feeSplitter,
        address agentToken
    ) external;

    // ── Capital Ingress ────────────────────────────────────

    /// @notice Claim accumulated ETH from the FeeSplitter (pull pattern)
    /// @dev Calls FeeSplitter.claimETH() to pull the 40% growth allocation
    function claimGrowthETH() external;

    /// @notice Claim accumulated USDC from the FeeSplitter (pull pattern)
    /// @dev Calls FeeSplitter.claimUSDC() to pull the 40% growth allocation
    function claimGrowthUSDC() external;

    /// @notice Deposit ERC-20 tokens into the treasury
    /// @param token The token contract address
    /// @param amount The amount to deposit (caller must have approved this contract)
    function depositERC20(address token, uint256 amount) external;

    // ── Trading (The Engine) ───────────────────────────────

    /// @notice Execute a single-hop swap on Uniswap V3
    /// @dev Only callable by the controller. Wraps ETH to WETH if tokenIn is WETH and
    ///      treasury holds ETH. Uses ISwapRouter.exactInputSingle().
    /// @param params The swap parameters (tokenIn, tokenOut, fee, amountIn, amountOutMinimum, deadline)
    /// @return amountOut The actual amount of output tokens received
    function executeSwap(SwapParams calldata params) external returns (uint256 amountOut);

    /// @notice Execute buyback-and-burn on the agent's $AGENT token
    /// @dev Only callable by the controller. Swaps inputToken → agentToken via Uniswap V3,
    ///      then sends the acquired agent tokens to the dead address (0x...dEaD).
    /// @param inputToken The token to spend for buyback (typically WETH or USDC)
    /// @param amountIn The amount of input token to spend
    /// @param fee The Uniswap V3 pool fee tier for the swap
    /// @param amountOutMinimum The minimum agent tokens to receive (slippage protection)
    /// @param deadline The unix timestamp after which the transaction reverts
    /// @return amountBurned The amount of agent tokens sent to the dead address
    function executeBuybackAndBurn(
        address inputToken,
        uint256 amountIn,
        uint24 fee,
        uint256 amountOutMinimum,
        uint256 deadline
    ) external returns (uint256 amountBurned);

    // ── AUM & Views ────────────────────────────────────────

    /// @notice Get the treasury's ETH balance
    /// @return The ETH balance in wei
    function getETHBalance() external view returns (uint256);

    /// @notice Get all tracked token balances held by this treasury
    /// @return balances Array of TokenBalance structs (token address + balance)
    function getTrackedBalances() external view returns (TokenBalance[] memory balances);

    /// @notice Get the total number of buyback-and-burn events executed
    /// @return The cumulative burn count
    function getTotalBurns() external view returns (uint256);

    /// @notice Get the cumulative amount of agent tokens burned
    /// @return The total agent tokens sent to the dead address
    function getTotalBurnedAmount() external view returns (uint256);

    // ── Admin ──────────────────────────────────────────────

    /// @notice Update the controller (trade executor) address
    /// @dev Only callable by the creator or current controller
    /// @param newController The new controller wallet address
    function setController(address newController) external;

    /// @notice Set the agent's $AGENT token address (for buyback-and-burn)
    /// @dev Only callable by the controller. Used when token is deployed after treasury.
    /// @param newAgentToken The agent's ERC-20 token address
    function setAgentToken(address newAgentToken) external;

    /// @notice Add or remove a token from AUM tracking
    /// @dev Only callable by the controller. Tracked tokens appear in getTrackedBalances().
    /// @param token The token address to track or untrack
    /// @param tracked Whether to track (true) or untrack (false) this token
    function setTrackedToken(address token, bool tracked) external;

    /// @notice Emergency withdrawal of all assets to the creator
    /// @dev Only callable by the creator. Safety valve for contract migration or emergency.
    ///      Transfers all ETH and all tracked ERC-20 tokens to the creator address.
    function emergencyWithdraw() external;
}
