// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IAgentTreasury } from "./interfaces/IAgentTreasury.sol";

// ── Minimal Uniswap V3 Interface ───────────────────────────────────────────────
// Defined inline to avoid adding the full @uniswap/v3-periphery submodule.
// Only the exactInputSingle() function is needed for single-hop swaps.

/// @notice Minimal interface for Uniswap V3 SwapRouter02 exactInputSingle
interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

/// @notice Minimal interface for WETH9 deposit/withdraw
interface IWETH9 {
    function deposit() external payable;
    function withdraw(uint256 wad) external;
    function balanceOf(address owner) external view returns (uint256);
}

/// @notice Minimal interface for FeeSplitter claim functions
interface IFeeSplitterClaims {
    function claimETH() external;
    function claimUSDC() external;
}

/// @title AgentTreasury
/// @notice Per-agent autonomous treasury — the on-chain engine of the v2 Hedge Fund.
/// @dev Deployed as EIP-1167 minimal proxy via AgentFactory. Each agent clone gets
///      its own treasury that:
///
///      1. Receives capital via FeeSplitter pull pattern (40% growth allocation)
///      2. Executes DEX swaps via Uniswap V3 SwapRouter02 on Base
///      3. Performs buyback-and-burn on the agent's $AGENT token (deflationary flywheel)
///      4. Reports AUM (Assets Under Management) for leaderboard scoring
///
///      Since this is an EIP-1167 clone, it uses initialize() instead of a constructor.
///      The _initialized flag prevents double-initialization attacks on clones.
///
///      Access control:
///        - Controller (backend worker): executeSwap, executeBuybackAndBurn, setAgentToken, setTrackedToken
///        - Creator (deployer wallet): emergencyWithdraw, setController
///        - Anyone: claimGrowthETH/USDC, depositERC20, view functions, receive()
///
///      Canonical Base addresses:
///        - SwapRouter02: 0x2626664c2603336E57B271c5C0b26F421741e481
///        - WETH9:        0x4200000000000000000000000000000000000006
///        - USDC:         0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
contract AgentTreasury is IAgentTreasury, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Constants ──────────────────────────────────────────

    /// @notice The dead address used for token burns
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    /// @notice Uniswap V3 SwapRouter02 on Base
    ISwapRouter public constant SWAP_ROUTER = ISwapRouter(0x2626664c2603336E57B271c5C0b26F421741e481);

    /// @notice WETH9 on Base (OP Stack pre-deploy)
    IWETH9 public constant WETH = IWETH9(0x4200000000000000000000000000000000000006);

    /// @notice Maximum number of tracked tokens (gas safety for getTrackedBalances loop)
    uint256 public constant MAX_TRACKED_TOKENS = 20;

    // ── Clone Initialization ───────────────────────────────

    /// @notice Whether this clone has been initialized (prevents double-init)
    bool private _initialized;

    // ── Identity ───────────────────────────────────────────

    /// @notice The agent address this treasury belongs to
    address public agent;

    /// @notice The creator wallet (emergency withdrawal authority)
    address public creator;

    /// @notice The backend worker wallet (trade execution authority)
    address public controller;

    // ── External References ────────────────────────────────

    /// @notice The FeeSplitter contract to claim growth capital from
    IFeeSplitterClaims public feeSplitter;

    /// @notice The agent's $AGENT token for buyback-and-burn (can be set post-deploy)
    address public agentToken;

    // ── Token Tracking (AUM) ───────────────────────────────

    /// @notice Array of tracked token addresses for AUM reporting
    address[] private _trackedTokens;

    /// @notice Whether a token is currently tracked
    mapping(address => bool) private _isTracked;

    // ── Burn Accounting ────────────────────────────────────

    /// @notice Total number of buyback-and-burn events executed
    uint256 private _totalBurns;

    /// @notice Cumulative amount of agent tokens burned
    uint256 private _totalBurnedAmount;

    // ── Modifiers ──────────────────────────────────────────

    /// @dev Restricts access to the authorized controller wallet
    modifier onlyController() {
        if (msg.sender != controller) revert UnauthorizedController();
        _;
    }

    /// @dev Restricts access to the creator wallet
    modifier onlyCreator() {
        if (msg.sender != creator) revert UnauthorizedCreator();
        _;
    }

    // ── Initialization (Clone Pattern) ─────────────────────

    /// @inheritdoc IAgentTreasury
    function initialize(
        address _agent,
        address _creator,
        address _controller,
        address _feeSplitter,
        address _agentToken
    ) external {
        if (_initialized) revert AlreadyInitialized();
        if (_agent == address(0)) revert ZeroAddress();
        if (_creator == address(0)) revert ZeroAddress();
        if (_controller == address(0)) revert ZeroAddress();
        if (_feeSplitter == address(0)) revert ZeroAddress();

        _initialized = true;

        agent = _agent;
        creator = _creator;
        controller = _controller;
        feeSplitter = IFeeSplitterClaims(_feeSplitter);

        // agentToken can be address(0) if not yet deployed via Virtuals Protocol
        agentToken = _agentToken;

        // Pre-approve WETH to SwapRouter for gas efficiency on subsequent swaps
        IERC20(address(WETH)).safeIncreaseAllowance(address(SWAP_ROUTER), type(uint256).max);

        emit TreasuryInitialized(_agent, _creator, _controller);
    }

    // ── Capital Ingress ────────────────────────────────────

    /// @inheritdoc IAgentTreasury
    function claimGrowthETH() external nonReentrant {
        feeSplitter.claimETH();
    }

    /// @inheritdoc IAgentTreasury
    function claimGrowthUSDC() external nonReentrant {
        feeSplitter.claimUSDC();
    }

    /// @inheritdoc IAgentTreasury
    function depositERC20(address token, uint256 amount) external nonReentrant {
        if (token == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        emit ERC20Deposited(token, msg.sender, amount);
    }

    // ── Trading (The Engine) ───────────────────────────────

    /// @inheritdoc IAgentTreasury
    function executeSwap(SwapParams calldata params) external nonReentrant onlyController returns (uint256 amountOut) {
        if (params.amountIn == 0) revert ZeroAmount();
        if (params.tokenIn == address(0) || params.tokenOut == address(0)) revert ZeroAddress();

        // If swapping from WETH and we hold raw ETH, wrap it first
        if (params.tokenIn == address(WETH)) {
            uint256 wethBalance = WETH.balanceOf(address(this));
            if (wethBalance < params.amountIn) {
                uint256 ethNeeded = params.amountIn - wethBalance;
                if (address(this).balance < ethNeeded) revert InsufficientBalance();
                WETH.deposit{ value: ethNeeded }();
            }
        } else {
            // For non-WETH tokens, check balance
            uint256 tokenBalance = IERC20(params.tokenIn).balanceOf(address(this));
            if (tokenBalance < params.amountIn) revert InsufficientBalance();
        }

        // Approve SwapRouter if needed (WETH is pre-approved in initialize)
        if (params.tokenIn != address(WETH)) {
            IERC20(params.tokenIn).safeIncreaseAllowance(address(SWAP_ROUTER), params.amountIn);
        }

        // Execute Uniswap V3 single-hop swap
        amountOut = SWAP_ROUTER.exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: params.tokenIn,
                tokenOut: params.tokenOut,
                fee: params.fee,
                recipient: address(this),
                amountIn: params.amountIn,
                amountOutMinimum: params.amountOutMinimum,
                sqrtPriceLimitX96: 0 // No price limit — rely on amountOutMinimum for slippage
            })
        );

        emit SwapExecuted(params.tokenIn, params.tokenOut, params.amountIn, amountOut);
    }

    // ── Buyback & Burn (The Flywheel) ──────────────────────

    /// @inheritdoc IAgentTreasury
    function executeBuybackAndBurn(
        address inputToken,
        uint256 amountIn,
        uint24 fee,
        uint256 amountOutMinimum,
        uint256 deadline
    ) external nonReentrant onlyController returns (uint256 amountBurned) {
        if (agentToken == address(0)) revert AgentTokenNotSet();
        if (amountIn == 0) revert ZeroAmount();
        if (inputToken == address(0)) revert ZeroAddress();

        // deadline is reserved for future SwapRouter versions or multicall wrapping
        deadline;

        // Wrap ETH if needed (same logic as executeSwap)
        if (inputToken == address(WETH)) {
            uint256 wethBalance = WETH.balanceOf(address(this));
            if (wethBalance < amountIn) {
                uint256 ethNeeded = amountIn - wethBalance;
                if (address(this).balance < ethNeeded) revert InsufficientBalance();
                WETH.deposit{ value: ethNeeded }();
            }
        } else {
            uint256 tokenBalance = IERC20(inputToken).balanceOf(address(this));
            if (tokenBalance < amountIn) revert InsufficientBalance();
            IERC20(inputToken).safeIncreaseAllowance(address(SWAP_ROUTER), amountIn);
        }

        // Step 1: Buyback — swap inputToken → agentToken
        amountBurned = SWAP_ROUTER.exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: inputToken,
                tokenOut: agentToken,
                fee: fee,
                recipient: address(this), // Receive to treasury first, then burn
                amountIn: amountIn,
                amountOutMinimum: amountOutMinimum,
                sqrtPriceLimitX96: 0
            })
        );

        // Step 2: Burn — send acquired agent tokens to dead address
        IERC20(agentToken).safeTransfer(BURN_ADDRESS, amountBurned);

        // Update burn accounting
        _totalBurns += 1;
        _totalBurnedAmount += amountBurned;

        emit BuybackAndBurn(agentToken, amountIn, amountBurned);
    }

    // ── AUM & Views ────────────────────────────────────────

    /// @inheritdoc IAgentTreasury
    function getETHBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @inheritdoc IAgentTreasury
    function getTrackedBalances() external view returns (TokenBalance[] memory balances) {
        uint256 count = _trackedTokens.length;
        balances = new TokenBalance[](count);

        for (uint256 i; i < count; ++i) {
            address token = _trackedTokens[i];
            balances[i] = TokenBalance({
                token: token,
                balance: IERC20(token).balanceOf(address(this))
            });
        }
    }

    /// @inheritdoc IAgentTreasury
    function getTotalBurns() external view returns (uint256) {
        return _totalBurns;
    }

    /// @inheritdoc IAgentTreasury
    function getTotalBurnedAmount() external view returns (uint256) {
        return _totalBurnedAmount;
    }

    // ── Admin ──────────────────────────────────────────────

    /// @inheritdoc IAgentTreasury
    function setController(address newController) external {
        if (msg.sender != creator && msg.sender != controller) revert UnauthorizedCreator();
        if (newController == address(0)) revert ZeroAddress();

        address oldController = controller;
        controller = newController;

        emit ControllerUpdated(oldController, newController);
    }

    /// @inheritdoc IAgentTreasury
    function setAgentToken(address newAgentToken) external onlyController {
        if (newAgentToken == address(0)) revert ZeroAddress();
        agentToken = newAgentToken;
    }

    /// @inheritdoc IAgentTreasury
    function setTrackedToken(address token, bool tracked) external onlyController {
        if (token == address(0)) revert ZeroAddress();

        if (tracked && !_isTracked[token]) {
            if (_trackedTokens.length >= MAX_TRACKED_TOKENS) revert InsufficientBalance(); // Reusing error for gas
            _trackedTokens.push(token);
            _isTracked[token] = true;
            emit TokenTrackingUpdated(token, true);
        } else if (!tracked && _isTracked[token]) {
            _isTracked[token] = false;
            // Remove from array (swap-and-pop)
            uint256 len = _trackedTokens.length;
            for (uint256 i; i < len; ++i) {
                if (_trackedTokens[i] == token) {
                    _trackedTokens[i] = _trackedTokens[len - 1];
                    _trackedTokens.pop();
                    break;
                }
            }
            emit TokenTrackingUpdated(token, false);
        }
    }

    /// @inheritdoc IAgentTreasury
    function emergencyWithdraw() external nonReentrant onlyCreator {
        // Transfer all ETH
        uint256 ethBalance = address(this).balance;
        if (ethBalance > 0) {
            (bool sent,) = creator.call{ value: ethBalance }("");
            if (!sent) revert ETHTransferFailed();
            emit EmergencyWithdrawal(address(0), ethBalance);
        }

        // Transfer all tracked ERC-20 tokens
        uint256 len = _trackedTokens.length;
        for (uint256 i; i < len; ++i) {
            address token = _trackedTokens[i];
            uint256 balance = IERC20(token).balanceOf(address(this));
            if (balance > 0) {
                IERC20(token).safeTransfer(creator, balance);
                emit EmergencyWithdrawal(token, balance);
            }
        }

        // Also transfer WETH if not tracked
        uint256 wethBalance = WETH.balanceOf(address(this));
        if (wethBalance > 0 && !_isTracked[address(WETH)]) {
            IERC20(address(WETH)).safeTransfer(creator, wethBalance);
            emit EmergencyWithdrawal(address(WETH), wethBalance);
        }

        // Also transfer USDC if not tracked (common Base asset)
        // Note: USDC address is not stored here to keep the contract generic.
        // If USDC needs emergency recovery, it should be in the tracked list.
    }

    // ── Receive ────────────────────────────────────────────

    /// @notice Accept ETH transfers (from FeeSplitter claims, DEX refunds, or direct deposits)
    receive() external payable {
        emit ETHDeposited(msg.sender, msg.value);
    }
}
