// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IScoutFund } from "./interfaces/IScoutFund.sol";

// ── Minimal External Interfaces ────────────────────────────────────────────────
// Defined inline to avoid adding full submodule dependencies.
// Identical to AgentTreasury.sol — kept separate to allow independent compilation.

/// @notice Minimal interface for Uniswap V3 SwapRouter02 exactInputSingle
interface ISwapRouter02 {
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
interface IWETH {
    function deposit() external payable;
    function withdraw(uint256 wad) external;
    function balanceOf(address owner) external view returns (uint256);
}

/// @notice Minimal interface for FeeSplitter claim functions (pull pattern)
interface IFeeSplitterPull {
    function claimETH() external;
    function claimUSDC() external;
}

/// @title ScoutFund
/// @notice Protocol-Owned Venture Capital fund — invests the 20% scout allocation
///         into promising low-cap agent tokens, creating buy pressure for the flywheel.
/// @dev Singleton contract (not a clone) deployed once per protocol. Receives 20% of
///      all protocol fees via the FeeSplitter pull pattern. Invests into whitelisted
///      agent tokens via Uniswap V3 on Base.
///
///      Key design principles:
///        - **Whitelist-gated:** Only tokens approved by the owner can receive investment,
///          preventing rug-pull attacks
///        - **Concentration limits:** Per-token investment cap prevents over-exposure
///        - **Long-term HODLer:** No automatic selling — positions are held as POL
///          (Protocol Owned Liquidity) to signal confidence
///        - **Emergency divestment:** Owner can unwind positions in governance-approved scenarios
///        - **Full portfolio tracking:** On-chain position history for dashboard display
///
///      Canonical Base addresses:
///        - SwapRouter02: 0x2626664c2603336E57B271c5C0b26F421741e481
///        - WETH9:        0x4200000000000000000000000000000000000006
///        - USDC:         0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
contract ScoutFund is IScoutFund, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Constants ──────────────────────────────────────────

    /// @notice Uniswap V3 SwapRouter02 on Base
    ISwapRouter02 public constant SWAP_ROUTER = ISwapRouter02(0x2626664c2603336E57B271c5C0b26F421741e481);

    /// @notice WETH9 on Base (OP Stack pre-deploy)
    IWETH public constant WETH = IWETH(0x4200000000000000000000000000000000000006);

    /// @notice Maximum number of unique positions the fund can hold (gas safety)
    uint256 public constant MAX_POSITIONS = 50;

    /// @notice Default maximum investment per token (1 ETH, adjustable by owner)
    uint256 public constant DEFAULT_MAX_INVESTMENT = 1 ether;

    // ── Immutable State ────────────────────────────────────

    /// @notice The USDC token contract on Base
    IERC20 public immutable usdc;

    /// @notice The FeeSplitter contract to pull 20% scout allocation from
    IFeeSplitterPull public immutable feeSplitter;

    // ── Mutable State ──────────────────────────────────────

    /// @notice Maximum cumulative investment per agent token (in input token units)
    uint256 public maxInvestmentPerToken;

    // ── Access Control ─────────────────────────────────────

    /// @notice Set of addresses authorized to execute investments
    mapping(address => bool) public authorizedScoutWorkers;

    // ── Whitelist ──────────────────────────────────────────

    /// @notice Whitelist of agent tokens approved for investment
    mapping(address => bool) private _scoutableTokens;

    // ── Portfolio ──────────────────────────────────────────

    /// @notice Investment positions keyed by agent token address
    mapping(address => Position) private _positions;

    /// @notice Ordered list of agent tokens with active positions
    address[] private _positionTokens;

    /// @notice Quick lookup: whether a token already has a position entry
    mapping(address => bool) private _hasPosition;

    // ── Constructor ────────────────────────────────────────

    /// @notice Initialize the ScoutFund with core dependencies
    /// @dev Validates all addresses, pre-approves WETH to SwapRouter, and sets default limits.
    /// @param _feeSplitter The FeeSplitter contract address
    /// @param _usdc The USDC token contract address on Base
    constructor(
        address _feeSplitter,
        address _usdc
    ) Ownable(msg.sender) {
        if (_feeSplitter == address(0)) revert ZeroAddress();
        if (_usdc == address(0)) revert ZeroAddress();

        feeSplitter = IFeeSplitterPull(_feeSplitter);
        usdc = IERC20(_usdc);
        maxInvestmentPerToken = DEFAULT_MAX_INVESTMENT;

        // Pre-approve WETH to SwapRouter for gas-efficient swaps
        IERC20(address(WETH)).safeIncreaseAllowance(address(SWAP_ROUTER), type(uint256).max);
    }

    // ── Modifiers ──────────────────────────────────────────

    /// @dev Restricts access to authorized scout workers
    modifier onlyScoutWorker() {
        if (!authorizedScoutWorkers[msg.sender] && msg.sender != owner()) {
            revert UnauthorizedScoutWorker();
        }
        _;
    }

    // ── Capital Ingress ────────────────────────────────────

    /// @inheritdoc IScoutFund
    function claimFundingETH() external nonReentrant {
        feeSplitter.claimETH();
    }

    /// @inheritdoc IScoutFund
    function claimFundingUSDC() external nonReentrant {
        feeSplitter.claimUSDC();
    }

    // ── Investment (The VC Engine) ─────────────────────────

    /// @inheritdoc IScoutFund
    function invest(
        address agentToken,
        address inputToken,
        uint256 amountIn,
        uint24 fee,
        uint256 amountOutMinimum
    ) external nonReentrant onlyScoutWorker returns (uint256 amountOut) {
        if (agentToken == address(0) || inputToken == address(0)) revert ZeroAddress();
        if (amountIn == 0) revert ZeroAmount();
        if (!_scoutableTokens[agentToken]) revert TokenNotScoutable();

        // Enforce per-token concentration limit
        uint256 currentInvestment = _positions[agentToken].totalInvested;
        if (currentInvestment + amountIn > maxInvestmentPerToken) revert MaxInvestmentExceeded();

        // Wrap ETH → WETH if needed (inputToken is WETH but we hold raw ETH)
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
            // Approve non-WETH tokens to SwapRouter (WETH pre-approved in constructor)
            IERC20(inputToken).safeIncreaseAllowance(address(SWAP_ROUTER), amountIn);
        }

        // Execute Uniswap V3 single-hop swap: inputToken → agentToken
        amountOut = SWAP_ROUTER.exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: inputToken,
                tokenOut: agentToken,
                fee: fee,
                recipient: address(this), // Fund holds the purchased tokens (POL)
                amountIn: amountIn,
                amountOutMinimum: amountOutMinimum,
                sqrtPriceLimitX96: 0 // Rely on amountOutMinimum for slippage
            })
        );

        // Update position tracking
        _updatePositionOnInvest(agentToken, amountIn, amountOut);

        emit Invested(agentToken, inputToken, amountIn, amountOut);
    }

    /// @inheritdoc IScoutFund
    function divest(
        address agentToken,
        address outputToken,
        uint256 amountIn,
        uint24 fee,
        uint256 amountOutMinimum
    ) external nonReentrant onlyOwner returns (uint256 amountOut) {
        if (agentToken == address(0) || outputToken == address(0)) revert ZeroAddress();
        if (amountIn == 0) revert ZeroAmount();

        uint256 tokenBalance = IERC20(agentToken).balanceOf(address(this));
        if (tokenBalance < amountIn) revert InsufficientPosition();

        // Approve agentToken to SwapRouter
        IERC20(agentToken).safeIncreaseAllowance(address(SWAP_ROUTER), amountIn);

        // Execute Uniswap V3 single-hop swap: agentToken → outputToken
        amountOut = SWAP_ROUTER.exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: agentToken,
                tokenOut: outputToken,
                fee: fee,
                recipient: address(this),
                amountIn: amountIn,
                amountOutMinimum: amountOutMinimum,
                sqrtPriceLimitX96: 0
            })
        );

        // Update position tracking
        _positions[agentToken].totalDivested += amountIn;

        emit Divested(agentToken, outputToken, amountIn, amountOut);
    }

    // ── Views (Scout Dashboard) ────────────────────────────

    /// @inheritdoc IScoutFund
    function getETHBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @inheritdoc IScoutFund
    function getFundHoldings() external view returns (HoldingSummary[] memory holdings) {
        uint256 count = _positionTokens.length;
        holdings = new HoldingSummary[](count);

        for (uint256 i; i < count; ++i) {
            address token = _positionTokens[i];
            Position storage pos = _positions[token];
            holdings[i] = HoldingSummary({
                token: token,
                currentBalance: IERC20(token).balanceOf(address(this)),
                totalInvested: pos.totalInvested,
                totalTokensAcquired: pos.totalTokensAcquired
            });
        }
    }

    /// @inheritdoc IScoutFund
    function getPosition(address agentToken) external view returns (Position memory position) {
        position = _positions[agentToken];
    }

    /// @inheritdoc IScoutFund
    function getPositionCount() external view returns (uint256) {
        return _positionTokens.length;
    }

    /// @inheritdoc IScoutFund
    function isScoutable(address token) external view returns (bool) {
        return _scoutableTokens[token];
    }

    // ── Admin (Owner Only) ─────────────────────────────────

    /// @inheritdoc IScoutFund
    function setScoutableToken(address token, bool scoutable) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        if (_scoutableTokens[token] == scoutable) revert TokenAlreadyInState();

        _scoutableTokens[token] = scoutable;

        emit ScoutableTokenUpdated(token, scoutable);
    }

    /// @inheritdoc IScoutFund
    function setScoutWorker(address worker, bool authorized) external onlyOwner {
        authorizedScoutWorkers[worker] = authorized;

        emit ScoutWorkerUpdated(worker, authorized);
    }

    /// @inheritdoc IScoutFund
    function setMaxInvestmentPerToken(uint256 newLimit) external onlyOwner {
        uint256 oldLimit = maxInvestmentPerToken;
        maxInvestmentPerToken = newLimit;

        emit MaxInvestmentPerTokenUpdated(oldLimit, newLimit);
    }

    /// @inheritdoc IScoutFund
    function emergencyWithdraw() external nonReentrant onlyOwner {
        address recipient = owner();

        // Transfer all ETH
        uint256 ethBalance = address(this).balance;
        if (ethBalance > 0) {
            (bool sent,) = recipient.call{ value: ethBalance }("");
            if (!sent) revert ETHTransferFailed();
            emit EmergencyWithdrawal(address(0), ethBalance, recipient);
        }

        // Transfer WETH if any
        uint256 wethBalance = WETH.balanceOf(address(this));
        if (wethBalance > 0) {
            IERC20(address(WETH)).safeTransfer(recipient, wethBalance);
            emit EmergencyWithdrawal(address(WETH), wethBalance, recipient);
        }

        // Transfer USDC if any
        uint256 usdcBalance = usdc.balanceOf(address(this));
        if (usdcBalance > 0) {
            usdc.safeTransfer(recipient, usdcBalance);
            emit EmergencyWithdrawal(address(usdc), usdcBalance, recipient);
        }

        // Transfer all position tokens
        uint256 posCount = _positionTokens.length;
        for (uint256 i; i < posCount; ++i) {
            address token = _positionTokens[i];
            uint256 balance = IERC20(token).balanceOf(address(this));
            if (balance > 0) {
                IERC20(token).safeTransfer(recipient, balance);
                emit EmergencyWithdrawal(token, balance, recipient);
            }
        }
    }

    // ── Internal ───────────────────────────────────────────

    /// @dev Updates position tracking after a successful investment
    /// @param agentToken The token that was purchased
    /// @param amountIn The input amount spent
    /// @param amountOut The tokens acquired
    function _updatePositionOnInvest(address agentToken, uint256 amountIn, uint256 amountOut) private {
        Position storage pos = _positions[agentToken];

        // Register new position if first investment in this token
        if (!_hasPosition[agentToken]) {
            if (_positionTokens.length >= MAX_POSITIONS) revert MaxInvestmentExceeded();
            _positionTokens.push(agentToken);
            _hasPosition[agentToken] = true;
            pos.token = agentToken;
            pos.firstInvestedAt = block.timestamp;
        }

        pos.totalInvested += amountIn;
        pos.totalTokensAcquired += amountOut;
        pos.investmentCount += 1;
        pos.lastInvestedAt = block.timestamp;
    }

    // ── Receive ────────────────────────────────────────────

    /// @notice Accept ETH transfers (from FeeSplitter claims or direct deposits)
    receive() external payable {
        emit ETHDeposited(msg.sender, msg.value);
    }
}
