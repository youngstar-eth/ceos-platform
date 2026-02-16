// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IFeeSplitter } from "./interfaces/IFeeSplitter.sol";

/// @title FeeSplitter
/// @notice Routes protocol revenue using the v2 40/40/20 split across three destinations.
/// @dev Implements a two-phase pull pattern for failure isolation:
///
///      Phase 1 — Allocation: `distributeFees()` / `distributeUSDCFees()` accept incoming
///      revenue, calculate the 40/40/20 split, and credit each recipient's claimable balance.
///      No external transfers occur during allocation.
///
///      Phase 2 — Claim: Each recipient independently calls `claimETH()` / `claimUSDC()`
///      to withdraw their accumulated balance. A failure in one recipient's claim does not
///      affect the others, providing full failure isolation.
///
///      Split ratios (in basis points, 10_000 = 100%):
///        - 40% → Agent Treasury (growth reinvestment)
///        - 40% → Protocol Treasury ($RUN buyback & burn)
///        - 20% → Scout Fund (autonomous low-cap investment)
///
///      Growth share receives the remainder after scout + buyback to prevent rounding loss.
///      Mirrors the pull pattern used by RevenuePool.claimRevenue() for consistency.
contract FeeSplitter is IFeeSplitter, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Constants ──────────────────────────────────────────

    /// @notice Agent Growth allocation in basis points (40%)
    uint256 public constant SPLIT_GROWTH_BPS = 4_000;

    /// @notice Protocol Buyback allocation in basis points (40%)
    uint256 public constant SPLIT_BUYBACK_BPS = 4_000;

    /// @notice Scout Fund allocation in basis points (20%)
    uint256 public constant SPLIT_SCOUT_BPS = 2_000;

    /// @notice Basis points denominator (10_000 = 100%)
    uint256 public constant BPS_DENOMINATOR = 10_000;

    // ── Immutable State ────────────────────────────────────

    /// @notice The USDC token contract on Base
    IERC20 public immutable usdc;

    // ── Mutable State ──────────────────────────────────────

    /// @notice The protocol treasury address (receives 40% for $RUN buyback & burn)
    address public protocolTreasury;

    /// @notice The scout fund address (receives 20% for autonomous investment)
    address public scoutFund;

    /// @notice Set of addresses authorized to call distribution functions
    mapping(address => bool) public authorizedDistributors;

    // ── Pull Pattern State ─────────────────────────────────

    /// @notice Accumulated claimable ETH per recipient address
    mapping(address => uint256) private _claimableETH;

    /// @notice Accumulated claimable USDC per recipient address
    mapping(address => uint256) private _claimableUSDC;

    // ── Distribution Tracking ──────────────────────────────

    /// @notice Sequential counter for distribution event IDs
    uint256 private _distributionCount;

    /// @notice Historical record of all distribution events
    mapping(uint256 => DistributionRecord) private _distributions;

    // ── Constructor ────────────────────────────────────────

    /// @notice Initialize the FeeSplitter with destination addresses
    /// @dev All addresses are validated against zero address. USDC is immutable
    ///      as the payment token should not change post-deployment.
    /// @param _protocolTreasury The protocol treasury for $RUN buyback & burn
    /// @param _scoutFund The scout fund for autonomous low-cap investment
    /// @param _usdc The USDC token contract address on Base
    constructor(
        address _protocolTreasury,
        address _scoutFund,
        address _usdc
    ) Ownable(msg.sender) {
        if (_protocolTreasury == address(0)) revert ZeroAddress();
        if (_scoutFund == address(0)) revert ZeroAddress();
        if (_usdc == address(0)) revert ZeroAddress();

        protocolTreasury = _protocolTreasury;
        scoutFund = _scoutFund;
        usdc = IERC20(_usdc);
    }

    // ── Modifiers ──────────────────────────────────────────

    /// @dev Restricts access to authorized distributors or the contract owner
    modifier onlyAuthorized() {
        if (!authorizedDistributors[msg.sender] && msg.sender != owner()) {
            revert UnauthorizedDistributor();
        }
        _;
    }

    // ── Phase 1: ETH Allocation ────────────────────────────

    /// @inheritdoc IFeeSplitter
    function distributeFees(address agentTreasury) external payable nonReentrant onlyAuthorized {
        if (msg.value == 0) revert NoFeesToDistribute();
        if (agentTreasury == address(0)) revert ZeroAddress();

        // Calculate shares — growth gets remainder to absorb rounding dust
        uint256 amountScout = (msg.value * SPLIT_SCOUT_BPS) / BPS_DENOMINATOR;
        uint256 amountBuyback = (msg.value * SPLIT_BUYBACK_BPS) / BPS_DENOMINATOR;
        uint256 amountGrowth = msg.value - amountScout - amountBuyback;

        // Credit claimable balances (no external calls — pure state updates)
        _claimableETH[agentTreasury] += amountGrowth;
        _claimableETH[protocolTreasury] += amountBuyback;
        _claimableETH[scoutFund] += amountScout;

        // Record distribution for auditability
        uint256 distributionId = _distributionCount;
        _distributions[distributionId] = DistributionRecord({
            distributor: msg.sender,
            agentTreasury: agentTreasury,
            totalETH: msg.value,
            totalUSDC: 0,
            timestamp: block.timestamp
        });
        _distributionCount = distributionId + 1;

        emit FeesAllocated(distributionId, agentTreasury, amountGrowth, amountBuyback, amountScout, false);
    }

    // ── Phase 1: USDC Allocation ───────────────────────────

    /// @inheritdoc IFeeSplitter
    function distributeUSDCFees(address agentTreasury, uint256 amount) external nonReentrant onlyAuthorized {
        if (amount == 0) revert NoFeesToDistribute();
        if (agentTreasury == address(0)) revert ZeroAddress();

        // Pull USDC from caller (requires prior approval)
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        // Calculate shares — growth gets remainder to absorb rounding dust
        uint256 amountScout = (amount * SPLIT_SCOUT_BPS) / BPS_DENOMINATOR;
        uint256 amountBuyback = (amount * SPLIT_BUYBACK_BPS) / BPS_DENOMINATOR;
        uint256 amountGrowth = amount - amountScout - amountBuyback;

        // Credit claimable balances (no external calls after safeTransferFrom)
        _claimableUSDC[agentTreasury] += amountGrowth;
        _claimableUSDC[protocolTreasury] += amountBuyback;
        _claimableUSDC[scoutFund] += amountScout;

        // Record distribution for auditability
        uint256 distributionId = _distributionCount;
        _distributions[distributionId] = DistributionRecord({
            distributor: msg.sender,
            agentTreasury: agentTreasury,
            totalETH: 0,
            totalUSDC: amount,
            timestamp: block.timestamp
        });
        _distributionCount = distributionId + 1;

        emit FeesAllocated(distributionId, agentTreasury, amountGrowth, amountBuyback, amountScout, true);
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

    /// @inheritdoc IFeeSplitter
    function claimUSDC() external nonReentrant {
        uint256 amount = _claimableUSDC[msg.sender];
        if (amount == 0) revert NothingToClaim();

        // Zero balance BEFORE transfer (checks-effects-interactions)
        _claimableUSDC[msg.sender] = 0;

        usdc.safeTransfer(msg.sender, amount);

        emit USDCClaimed(msg.sender, amount);
    }

    // ── Views ──────────────────────────────────────────────

    /// @inheritdoc IFeeSplitter
    function getClaimable(address recipient) external view returns (uint256 ethAmount, uint256 usdcAmount) {
        ethAmount = _claimableETH[recipient];
        usdcAmount = _claimableUSDC[recipient];
    }

    /// @inheritdoc IFeeSplitter
    function getDistribution(uint256 distributionId) external view returns (DistributionRecord memory record) {
        record = _distributions[distributionId];
    }

    /// @inheritdoc IFeeSplitter
    function getDistributionCount() external view returns (uint256) {
        return _distributionCount;
    }

    // ── Admin ──────────────────────────────────────────────

    /// @inheritdoc IFeeSplitter
    function setProtocolTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        address oldTreasury = protocolTreasury;
        protocolTreasury = newTreasury;
        emit ProtocolTreasuryUpdated(oldTreasury, newTreasury);
    }

    /// @inheritdoc IFeeSplitter
    function setScoutFund(address newScoutFund) external onlyOwner {
        if (newScoutFund == address(0)) revert ZeroAddress();
        address oldFund = scoutFund;
        scoutFund = newScoutFund;
        emit ScoutFundUpdated(oldFund, newScoutFund);
    }

    /// @inheritdoc IFeeSplitter
    function setAuthorizedDistributor(address distributor, bool authorized) external onlyOwner {
        authorizedDistributors[distributor] = authorized;
        emit DistributorUpdated(distributor, authorized);
    }

    // ── Receive ────────────────────────────────────────────

    /// @notice Accept direct ETH transfers (e.g., from agent profit-taking or legacy integrations)
    /// @dev ETH received via receive() is NOT automatically allocated. It sits in the contract
    ///      balance until an authorized distributor calls distributeFees(). This prevents
    ///      unattributed revenue from being silently split without an agent treasury target.
    receive() external payable {}
}
