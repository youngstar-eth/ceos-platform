// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ERC20Burnable } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import { IFeeSplitter } from "./interfaces/IFeeSplitter.sol";
import { ISwapRouter } from "./interfaces/ISwapRouter.sol";

/// @title IWETH
/// @notice Minimal WETH interface for deposit (ETH -> WETH wrapping)
interface IWETH {
    function deposit() external payable;
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title FeeSplitter
/// @notice Hybrid revenue distributor: atomic $RUN buyback-and-burn + pull-pattern claims.
/// @dev Implements the v2 Virtuals Protocol fee split (40/40/20):
///
///      When `distribute()` is called:
///        1. 40% → Swap ETH for $RUN via Uniswap V3, then BURN (atomic, on-chain)
///        2. 40% → Credit to the agent's token treasury (pull pattern)
///        3. 20% → Credit to the protocol fee recipient (pull pattern)
///
///      The $RUN buyback-and-burn is atomic because:
///        - It's a protocol-level deflationary mechanic that must be trustless
///        - No reliance on external keepers or bots to execute the burn
///        - The swap + burn happens in a single transaction
///
///      The agent treasury and protocol fee use pull pattern because:
///        - Different agents have different treasury addresses
///        - A failed claim by one agent shouldn't block others
///        - Gas cost is distributed to claimers, not the distributor
///
///      ETH flow: ETH → WETH (wrap) → Uniswap swap → $RUN → burn()
///      The WETH wrapping is necessary because Uniswap V3's exactInputSingle
///      operates on ERC-20 tokens, not native ETH.
contract FeeSplitter is IFeeSplitter, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Constants ──────────────────────────────────────────

    /// @notice $RUN buyback-and-burn allocation in basis points (40%)
    uint256 public constant SPLIT_BUYBACK_BPS = 4_000;

    /// @notice Agent token treasury allocation in basis points (40%)
    uint256 public constant SPLIT_AGENT_BPS = 4_000;

    /// @notice Protocol fee allocation in basis points (20%)
    uint256 public constant SPLIT_PROTOCOL_BPS = 2_000;

    /// @notice Basis points denominator (10_000 = 100%)
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Canonical WETH address on Base L2
    IWETH public constant WETH = IWETH(0x4200000000000000000000000000000000000006);

    // ── Immutable State ────────────────────────────────────

    /// @notice The Uniswap V3 SwapRouter contract on Base
    ISwapRouter public immutable swapRouter;

    /// @notice The $RUN token contract (ERC20Burnable)
    ERC20Burnable public immutable runToken;

    // ── Mutable State ──────────────────────────────────────

    /// @notice The protocol fee recipient address (receives 20%)
    address public protocolFeeRecipient;

    /// @notice The Uniswap V3 pool fee tier for the WETH/$RUN pair
    /// @dev Common values: 500 (0.05%), 3000 (0.30%), 10000 (1.00%)
    uint24 public poolFee;

    /// @notice Set of addresses authorized to call distribute()
    mapping(address => bool) public authorizedDistributors;

    // ── Pull Pattern State ─────────────────────────────────

    /// @notice Accumulated claimable ETH per recipient address
    mapping(address => uint256) private _claimableETH;

    // ── Distribution Tracking ──────────────────────────────

    /// @notice Sequential counter for distribution event IDs
    uint256 private _distributionCount;

    /// @notice Total $RUN burned across all distributions
    uint256 public totalRunBurned;

    // ── Constructor ────────────────────────────────────────

    /// @notice Initialize the FeeSplitter with protocol addresses
    /// @param _swapRouter The Uniswap V3 SwapRouter address on Base
    /// @param _runToken The $RUN token contract address
    /// @param _protocolFeeRecipient The protocol fee recipient (receives 20%)
    /// @param _poolFee The Uniswap V3 pool fee tier for the WETH/$RUN pair
    constructor(
        address _swapRouter,
        address _runToken,
        address _protocolFeeRecipient,
        uint24 _poolFee
    ) Ownable(msg.sender) {
        if (_swapRouter == address(0)) revert ZeroAddress();
        if (_runToken == address(0)) revert ZeroAddress();
        if (_protocolFeeRecipient == address(0)) revert ZeroAddress();
        if (_poolFee == 0) revert InvalidPoolFee();

        swapRouter = ISwapRouter(_swapRouter);
        runToken = ERC20Burnable(_runToken);
        protocolFeeRecipient = _protocolFeeRecipient;
        poolFee = _poolFee;
    }

    // ── Modifiers ──────────────────────────────────────────

    /// @dev Restricts access to authorized distributors or the contract owner
    modifier onlyAuthorized() {
        if (!authorizedDistributors[msg.sender] && msg.sender != owner()) {
            revert UnauthorizedDistributor();
        }
        _;
    }

    // ── Core: Hybrid Distribution ──────────────────────────

    /// @inheritdoc IFeeSplitter
    function distribute(
        address agentTreasury,
        uint256 minRunOut
    ) external payable nonReentrant onlyAuthorized {
        if (msg.value == 0) revert NoFeesToDistribute();
        if (agentTreasury == address(0)) revert ZeroAddress();

        // Calculate the three-way split
        uint256 amountBuyback = (msg.value * SPLIT_BUYBACK_BPS) / BPS_DENOMINATOR;
        uint256 amountProtocol = (msg.value * SPLIT_PROTOCOL_BPS) / BPS_DENOMINATOR;
        uint256 amountAgent = msg.value - amountBuyback - amountProtocol;

        // ── Phase 1: Atomic $RUN buyback-and-burn (40%) ────────
        uint256 runBurned = _buybackAndBurn(amountBuyback, minRunOut);

        // ── Phase 2: Credit pull-pattern balances ──────────────
        _claimableETH[agentTreasury] += amountAgent;
        _claimableETH[protocolFeeRecipient] += amountProtocol;

        // ── Tracking ───────────────────────────────────────────
        uint256 distributionId = _distributionCount;
        _distributionCount = distributionId + 1;

        emit FeesDistributed(distributionId, agentTreasury, amountAgent, amountBuyback, amountProtocol);
        emit BuybackExecuted(distributionId, amountBuyback, runBurned);
    }

    /// @notice Internal: wrap ETH → WETH, swap on Uniswap V3, burn $RUN
    /// @dev The full ETH→WETH→swap→burn pipeline in one atomic call.
    ///      Uses WETH.deposit() for wrapping because Uniswap V3 SwapRouter's
    ///      exactInputSingle only accepts ERC-20 tokens, not native ETH.
    /// @param ethAmount The ETH amount to use for buyback
    /// @param minRunOut Minimum $RUN tokens to receive (slippage protection)
    /// @return runAmount The amount of $RUN tokens bought and burned
    function _buybackAndBurn(uint256 ethAmount, uint256 minRunOut) private returns (uint256 runAmount) {
        if (ethAmount == 0) return 0;

        // Step 1: Wrap ETH -> WETH
        WETH.deposit{ value: ethAmount }();

        // Step 2: Approve SwapRouter to spend our WETH
        WETH.approve(address(swapRouter), ethAmount);

        // Step 3: Swap WETH -> $RUN via Uniswap V3
        // The $RUN is sent to THIS contract so we can burn it
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: address(WETH),
            tokenOut: address(runToken),
            fee: poolFee,
            recipient: address(this),
            deadline: block.timestamp,
            amountIn: ethAmount,
            amountOutMinimum: minRunOut,
            sqrtPriceLimitX96: 0
        });

        runAmount = swapRouter.exactInputSingle(params);

        // Step 4: Burn all $RUN we received
        runToken.burn(runAmount);
        totalRunBurned += runAmount;

        emit RunBurned(runAmount);
    }

    // ── Phase 2: Claims ────────────────────────────────────

    /// @inheritdoc IFeeSplitter
    function claimETH() external nonReentrant {
        uint256 amount = _claimableETH[msg.sender];
        if (amount == 0) revert NothingToClaim();

        // Zero balance BEFORE transfer (checks-effects-interactions)
        _claimableETH[msg.sender] = 0;

        (bool sent,) = msg.sender.call{ value: amount }("");
        if (!sent) revert ETHTransferFailed();

        emit ETHClaimed(msg.sender, amount);
    }

    // ── Views ──────────────────────────────────────────────

    /// @inheritdoc IFeeSplitter
    function getClaimable(address recipient) external view returns (uint256 ethAmount) {
        ethAmount = _claimableETH[recipient];
    }

    /// @inheritdoc IFeeSplitter
    function getDistributionCount() external view returns (uint256) {
        return _distributionCount;
    }

    // ── Admin ──────────────────────────────────────────────

    /// @inheritdoc IFeeSplitter
    function setProtocolFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert ZeroAddress();
        address oldRecipient = protocolFeeRecipient;
        protocolFeeRecipient = newRecipient;
        emit ProtocolFeeRecipientUpdated(oldRecipient, newRecipient);
    }

    /// @inheritdoc IFeeSplitter
    function setPoolFee(uint24 newFee) external onlyOwner {
        if (newFee == 0) revert InvalidPoolFee();
        uint24 oldFee = poolFee;
        poolFee = newFee;
        emit PoolFeeUpdated(oldFee, newFee);
    }

    /// @inheritdoc IFeeSplitter
    function setAuthorizedDistributor(address distributor, bool authorized) external onlyOwner {
        authorizedDistributors[distributor] = authorized;
        emit DistributorUpdated(distributor, authorized);
    }

    // ── Receive ────────────────────────────────────────────

    /// @notice Accept direct ETH transfers (e.g., from AgentFactory deploy fees)
    /// @dev ETH received via receive() is NOT automatically distributed. It sits in the
    ///      contract balance until an authorized distributor calls distribute().
    receive() external payable {}
}
