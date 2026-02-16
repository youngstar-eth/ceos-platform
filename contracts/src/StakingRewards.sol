// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IStakingRewards } from "./interfaces/IStakingRewards.sol";

/// @notice Minimal interface for RunToken minting (avoids importing full AccessControl tree)
interface IRunToken {
    function mint(address to, uint256 amount) external;
}

/// @title StakingRewards
/// @notice Multi-pool yield farm with a 3x Patron Multiplier for $AGENT token holders.
/// @dev Implements MasterChef-style pool management with Synthetix reward accumulator math.
///
///      Architecture:
///        - Multiple pools, each identified by a sequential `pid`
///        - Each pool has an LP staking token and an optional $AGENT token for boost
///        - Global emission rate (`runPerSecond`) distributed across pools by `allocPoint`
///        - Within each pool, rewards distributed by effective stake weight
///
///      Patron Multiplier (Virtual Balance):
///        - If staker holds >= `agentTokenThreshold` of the pool's $AGENT token → 3x boost
///        - `effectiveAmount = amount * (boosted ? 3 : 1)`
///        - `totalEffectiveSupply` = sum of all effective amounts in the pool
///        - The accumulator (`accRunPerShare`) distributes proportional to effective weight
///        - Same approach as Convex Finance and Curve gauge boosting
///
///      Security:
///        - All external state-changing functions are nonReentrant
///        - All token transfers use SafeERC20
///        - Emission rate capped by MAX_RUN_PER_SECOND
///        - Flash loan boost mitigation: rewards accrue over time, not instantly
contract StakingRewards is IStakingRewards, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Constants ────────────────────────────────────────────

    /// @notice Patron Multiplier applied to stakers holding sufficient $AGENT tokens
    uint256 public constant BOOST_MULTIPLIER = 3;

    /// @notice Precision scalar for `accRunPerShare` to prevent truncation
    uint256 public constant ACC_PRECISION = 1e18;

    /// @notice Safety cap for emission rate (10 RUN per second)
    uint256 public constant MAX_RUN_PER_SECOND = 10e18;

    // ── Immutable State ──────────────────────────────────────

    /// @notice The $RUN token contract (mints rewards on-demand)
    IRunToken public immutable runToken;

    // ── Mutable State ────────────────────────────────────────

    /// @notice Global $RUN emission rate (tokens per second, 18 decimals)
    uint256 public runPerSecond;

    /// @notice Sum of all pool allocation points
    uint256 public totalAllocPoint;

    /// @notice Array of all staking pools
    PoolInfo[] private _pools;

    /// @notice Staking state per user per pool: pid => user => UserInfo
    mapping(uint256 => mapping(address => UserInfo)) private _userInfo;

    /// @notice Prevents duplicate pools for the same staking token
    mapping(address => bool) private _poolExists;

    // ── Constructor ──────────────────────────────────────────

    /// @notice Deploy the StakingRewards contract
    /// @dev The deployer becomes the owner. After deployment, the owner should:
    ///      1. Ensure StakingRewards has MINTER_ROLE on RunToken
    ///      2. Add pools via addPool()
    /// @param _runToken The $RUN token contract address (must have mint permission)
    /// @param _runPerSecond Initial emission rate (tokens per second, 18 decimals)
    constructor(
        address _runToken,
        uint256 _runPerSecond
    ) Ownable(msg.sender) {
        if (_runToken == address(0)) revert ZeroAddress();
        if (_runPerSecond > MAX_RUN_PER_SECOND) revert ExceedsMaxEmissionRate();

        runToken = IRunToken(_runToken);
        runPerSecond = _runPerSecond;
    }

    // ── User Functions ──────────────────────────────────────

    /// @inheritdoc IStakingRewards
    function stake(uint256 pid, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (pid >= _pools.length) revert PoolNotFound();

        PoolInfo storage pool = _pools[pid];
        UserInfo storage user = _userInfo[pid][msg.sender];

        // Update pool accumulator
        _updatePool(pid);

        // Harvest pending rewards before modifying stake
        _harvestRewards(pid, msg.sender);

        // Pull LP tokens from staker
        pool.stakingToken.safeTransferFrom(msg.sender, address(this), amount);

        // Determine boost status
        bool hasBoosted = _checkBoost(pid, msg.sender);
        uint256 multiplier = hasBoosted ? BOOST_MULTIPLIER : 1;
        uint256 effectiveAdd = amount * multiplier;

        // Update user state
        user.amount += amount;
        user.effectiveAmount += effectiveAdd;
        user.boosted = hasBoosted;

        // Update pool totals
        pool.totalEffectiveSupply += effectiveAdd;

        // Set reward debt to current accumulator position
        user.rewardDebt = (user.effectiveAmount * pool.accRunPerShare) / ACC_PRECISION;

        emit Staked(pid, msg.sender, amount, hasBoosted);
    }

    /// @inheritdoc IStakingRewards
    function withdraw(uint256 pid, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (pid >= _pools.length) revert PoolNotFound();

        UserInfo storage user = _userInfo[pid][msg.sender];
        if (user.amount < amount) revert InsufficientStake();

        PoolInfo storage pool = _pools[pid];

        // Update pool accumulator
        _updatePool(pid);

        // Harvest pending rewards before modifying stake
        _harvestRewards(pid, msg.sender);

        // Remove old effective amount from pool
        pool.totalEffectiveSupply -= user.effectiveAmount;

        // Update user actual balance
        user.amount -= amount;

        // Recalculate effective amount with current boost status
        bool hasBoosted = _checkBoost(pid, msg.sender);
        uint256 multiplier = hasBoosted ? BOOST_MULTIPLIER : 1;
        user.effectiveAmount = user.amount * multiplier;
        user.boosted = hasBoosted;

        // Add new effective amount back to pool
        pool.totalEffectiveSupply += user.effectiveAmount;

        // Reset reward debt
        user.rewardDebt = (user.effectiveAmount * pool.accRunPerShare) / ACC_PRECISION;

        // Return LP tokens
        pool.stakingToken.safeTransfer(msg.sender, amount);

        emit Withdrawn(pid, msg.sender, amount);
    }

    /// @inheritdoc IStakingRewards
    function claim(uint256 pid) external nonReentrant {
        if (pid >= _pools.length) revert PoolNotFound();

        // Update pool accumulator
        _updatePool(pid);

        // Harvest and reset debt
        uint256 pending = _harvestRewards(pid, msg.sender);
        if (pending == 0) revert NothingToClaim();

        UserInfo storage user = _userInfo[pid][msg.sender];
        user.rewardDebt = (user.effectiveAmount * _pools[pid].accRunPerShare) / ACC_PRECISION;
    }

    /// @inheritdoc IStakingRewards
    function refreshBoost(uint256 pid) external nonReentrant {
        if (pid >= _pools.length) revert PoolNotFound();

        UserInfo storage user = _userInfo[pid][msg.sender];
        if (user.amount == 0) revert ZeroAmount();

        // Update pool accumulator
        _updatePool(pid);

        // Harvest pending rewards at current effective weight
        _harvestRewards(pid, msg.sender);

        // Check new boost status
        bool newBoosted = _checkBoost(pid, msg.sender);
        if (newBoosted == user.boosted) return; // No change — skip

        PoolInfo storage pool = _pools[pid];

        // Remove old effective amount
        pool.totalEffectiveSupply -= user.effectiveAmount;

        // Recalculate with new boost
        uint256 newMultiplier = newBoosted ? BOOST_MULTIPLIER : 1;
        user.effectiveAmount = user.amount * newMultiplier;
        user.boosted = newBoosted;

        // Add new effective amount
        pool.totalEffectiveSupply += user.effectiveAmount;

        // Reset reward debt to new position
        user.rewardDebt = (user.effectiveAmount * pool.accRunPerShare) / ACC_PRECISION;

        emit BoostUpdated(pid, msg.sender, newBoosted);
    }

    /// @inheritdoc IStakingRewards
    function emergencyWithdraw(uint256 pid) external nonReentrant {
        if (pid >= _pools.length) revert PoolNotFound();

        UserInfo storage user = _userInfo[pid][msg.sender];
        uint256 amount = user.amount;
        if (amount == 0) revert ZeroAmount();

        PoolInfo storage pool = _pools[pid];

        // Reduce pool totals
        pool.totalEffectiveSupply -= user.effectiveAmount;

        // Zero out user (forfeits all pending rewards)
        user.amount = 0;
        user.effectiveAmount = 0;
        user.rewardDebt = 0;
        user.boosted = false;

        // Return LP tokens
        pool.stakingToken.safeTransfer(msg.sender, amount);

        emit EmergencyWithdrawn(pid, msg.sender, amount);
    }

    // ── View Functions ──────────────────────────────────────

    /// @inheritdoc IStakingRewards
    function pendingReward(uint256 pid, address account) external view returns (uint256 pending) {
        if (pid >= _pools.length) return 0;

        PoolInfo storage pool = _pools[pid];
        UserInfo storage user = _userInfo[pid][account];

        uint256 accRunPerShare = pool.accRunPerShare;

        if (block.timestamp > pool.lastRewardTime && pool.totalEffectiveSupply > 0 && totalAllocPoint > 0) {
            uint256 elapsed = block.timestamp - pool.lastRewardTime;
            uint256 poolReward = (elapsed * runPerSecond * pool.allocPoint) / totalAllocPoint;
            accRunPerShare += (poolReward * ACC_PRECISION) / pool.totalEffectiveSupply;
        }

        pending = (user.effectiveAmount * accRunPerShare) / ACC_PRECISION - user.rewardDebt;
    }

    /// @inheritdoc IStakingRewards
    function getUserInfo(uint256 pid, address account) external view returns (UserInfo memory info) {
        info = _userInfo[pid][account];
    }

    /// @inheritdoc IStakingRewards
    function getPoolInfo(uint256 pid) external view returns (PoolInfo memory info) {
        if (pid >= _pools.length) revert PoolNotFound();
        info = _pools[pid];
    }

    /// @inheritdoc IStakingRewards
    function getPoolCount() external view returns (uint256 count) {
        count = _pools.length;
    }

    /// @inheritdoc IStakingRewards
    function getTotalAllocPoint() external view returns (uint256 points) {
        points = totalAllocPoint;
    }

    // ── Admin Functions ─────────────────────────────────────

    /// @inheritdoc IStakingRewards
    function addPool(
        address stakingToken,
        address agentToken,
        uint256 agentTokenThreshold,
        uint256 allocPoint
    ) external onlyOwner {
        if (stakingToken == address(0)) revert ZeroAddress();
        if (_poolExists[stakingToken]) revert PoolAlreadyExists();

        // Mass update before changing allocation weights
        _massUpdatePools();

        totalAllocPoint += allocPoint;
        _poolExists[stakingToken] = true;

        _pools.push(PoolInfo({
            stakingToken: IERC20(stakingToken),
            agentToken: IERC20(agentToken),
            agentTokenThreshold: agentTokenThreshold,
            allocPoint: allocPoint,
            lastRewardTime: block.timestamp,
            accRunPerShare: 0,
            totalEffectiveSupply: 0
        }));

        emit PoolAdded(_pools.length - 1, stakingToken, agentToken, allocPoint, agentTokenThreshold);
    }

    /// @inheritdoc IStakingRewards
    function setPool(uint256 pid, uint256 allocPoint, uint256 agentTokenThreshold) external onlyOwner {
        if (pid >= _pools.length) revert PoolNotFound();

        // Mass update before changing allocation weights
        _massUpdatePools();

        totalAllocPoint = totalAllocPoint - _pools[pid].allocPoint + allocPoint;
        _pools[pid].allocPoint = allocPoint;
        _pools[pid].agentTokenThreshold = agentTokenThreshold;

        emit PoolUpdated(pid, allocPoint, agentTokenThreshold);
    }

    /// @inheritdoc IStakingRewards
    function setRunPerSecond(uint256 newRate) external onlyOwner {
        if (newRate > MAX_RUN_PER_SECOND) revert ExceedsMaxEmissionRate();

        // Mass update before changing emission rate
        _massUpdatePools();

        uint256 oldRate = runPerSecond;
        runPerSecond = newRate;

        emit RunPerSecondUpdated(oldRate, newRate);
    }

    // ── Internal Functions ───────────────────────────────────

    /// @notice Update the reward accumulator for a single pool
    /// @dev Calculates newly accrued rewards since `lastRewardTime` and adds them to
    ///      `accRunPerShare`. Skips if no time has elapsed or no effective supply.
    /// @param pid The pool ID to update
    function _updatePool(uint256 pid) private {
        PoolInfo storage pool = _pools[pid];

        if (block.timestamp <= pool.lastRewardTime) return;

        if (pool.totalEffectiveSupply == 0 || totalAllocPoint == 0) {
            pool.lastRewardTime = block.timestamp;
            return;
        }

        uint256 elapsed = block.timestamp - pool.lastRewardTime;
        uint256 poolReward = (elapsed * runPerSecond * pool.allocPoint) / totalAllocPoint;
        pool.accRunPerShare += (poolReward * ACC_PRECISION) / pool.totalEffectiveSupply;
        pool.lastRewardTime = block.timestamp;
    }

    /// @notice Update all pools (called before changing allocation weights or emission rate)
    function _massUpdatePools() private {
        uint256 length = _pools.length;
        for (uint256 i; i < length; ++i) {
            _updatePool(i);
        }
    }

    /// @notice Calculate and mint pending rewards to a user
    /// @dev Internal helper used by stake/withdraw/claim/refreshBoost before modifying state.
    /// @param pid The pool ID
    /// @param account The user to harvest for
    /// @return pending The amount of $RUN minted (0 if no pending rewards)
    function _harvestRewards(uint256 pid, address account) private returns (uint256 pending) {
        UserInfo storage user = _userInfo[pid][account];
        if (user.effectiveAmount == 0) return 0;

        pending = (user.effectiveAmount * _pools[pid].accRunPerShare) / ACC_PRECISION - user.rewardDebt;
        if (pending > 0) {
            runToken.mint(account, pending);
            emit RewardClaimed(pid, account, pending);
        }
    }

    /// @notice Check if a user qualifies for the Patron Multiplier in a pool
    /// @dev Reads the user's $AGENT token balance. Returns false if the pool has no
    ///      agent token configured (address(0)) or threshold is 0.
    /// @param pid The pool ID
    /// @param account The user to check
    /// @return True if the user holds >= agentTokenThreshold of the pool's agent token
    function _checkBoost(uint256 pid, address account) private view returns (bool) {
        PoolInfo storage pool = _pools[pid];
        if (address(pool.agentToken) == address(0)) return false;
        if (pool.agentTokenThreshold == 0) return false;
        return pool.agentToken.balanceOf(account) >= pool.agentTokenThreshold;
    }
}
