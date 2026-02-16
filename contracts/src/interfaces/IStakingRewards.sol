// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IStakingRewards
/// @notice Interface for the multi-pool yield farm with Patron Multiplier
/// @dev MasterChef-style contract where users stake LP tokens to earn $RUN rewards.
///
///      Key features:
///        - Multiple pools, each identified by a `pid` (pool ID)
///        - Each pool maps an LP token to an optional $AGENT token for boost eligibility
///        - **Patron Multiplier**: Stakers holding >= `agentTokenThreshold` of the pool's
///          $AGENT token receive a 3x boost to their effective stake weight
///        - Synthetix-style reward accumulator (`accRunPerShare`) with virtual balances
///
///      Virtual Balance approach:
///        - `effectiveAmount = amount * (boosted ? 3 : 1)`
///        - `totalEffectiveSupply` = sum of all stakers' effective amounts per pool
///        - The accumulator distributes rewards proportional to effective stake,
///          so boosted users naturally earn 3x more (same as Convex/Curve gauge boosting)
///
///      Reward flow:
///        1. Owner sets `runPerSecond` emission rate and pool `allocPoint` weights
///        2. Users `stake()` LP tokens — boost checked on entry via agent token balance
///        3. Rewards accrue per-second proportional to effective stake weight
///        4. Users `claim()` to mint pending $RUN, or `withdraw()` to unstake
///        5. Users `refreshBoost()` to update boost status if agent token balance changed
interface IStakingRewards {
    // ── Structs ─────────────────────────────────────────────

    /// @notice Configuration and accounting state for a single staking pool
    /// @param stakingToken The LP token users deposit to earn rewards
    /// @param agentToken The $AGENT token checked for Patron Multiplier eligibility
    ///        (address(0) means no boost available for this pool)
    /// @param agentTokenThreshold Minimum $AGENT balance required for 3x boost
    /// @param allocPoint This pool's share of global $RUN emission (weight relative to totalAllocPoint)
    /// @param lastRewardTime Last timestamp at which the accumulator was updated
    /// @param accRunPerShare Accumulated $RUN per unit of effective stake, scaled by ACC_PRECISION
    /// @param totalEffectiveSupply Sum of all stakers' effective amounts (boosted count 3x)
    struct PoolInfo {
        IERC20 stakingToken;
        IERC20 agentToken;
        uint256 agentTokenThreshold;
        uint256 allocPoint;
        uint256 lastRewardTime;
        uint256 accRunPerShare;
        uint256 totalEffectiveSupply;
    }

    /// @notice Per-user staking state within a specific pool
    /// @param amount Actual LP tokens deposited by the user
    /// @param effectiveAmount Virtual stake weight (amount * boost multiplier)
    /// @param rewardDebt Reward debt for Synthetix accounting (prevents double-counting)
    /// @param boosted Whether the user currently has the 3x Patron Multiplier
    struct UserInfo {
        uint256 amount;
        uint256 effectiveAmount;
        uint256 rewardDebt;
        bool boosted;
    }

    // ── Errors ──────────────────────────────────────────────

    /// @notice Address parameter is the zero address
    error ZeroAddress();

    /// @notice Amount parameter is zero
    error ZeroAmount();

    /// @notice Attempting to add a pool with a staking token that already has a pool
    error PoolAlreadyExists();

    /// @notice Pool ID does not exist
    error PoolNotFound();

    /// @notice Withdrawing more LP tokens than the user has staked
    error InsufficientStake();

    /// @notice No pending rewards to claim
    error NothingToClaim();

    /// @notice Emission rate exceeds safety cap
    error ExceedsMaxEmissionRate();

    // ── Events ──────────────────────────────────────────────

    /// @notice Emitted when a new staking pool is added
    /// @param pid The pool ID (index in the pools array)
    /// @param stakingToken The LP token address
    /// @param agentToken The $AGENT token address (address(0) if no boost)
    /// @param allocPoint The reward allocation weight
    /// @param agentTokenThreshold Minimum $AGENT balance for 3x boost
    event PoolAdded(
        uint256 indexed pid,
        address indexed stakingToken,
        address indexed agentToken,
        uint256 allocPoint,
        uint256 agentTokenThreshold
    );

    /// @notice Emitted when a pool's parameters are updated
    /// @param pid The pool ID
    /// @param allocPoint The new allocation weight
    /// @param agentTokenThreshold The new boost threshold
    event PoolUpdated(uint256 indexed pid, uint256 allocPoint, uint256 agentTokenThreshold);

    /// @notice Emitted when a user stakes LP tokens
    /// @param pid The pool ID
    /// @param user The staker's address
    /// @param amount The LP tokens staked
    /// @param boosted Whether the user received the 3x Patron Multiplier
    event Staked(uint256 indexed pid, address indexed user, uint256 amount, bool boosted);

    /// @notice Emitted when a user withdraws LP tokens
    /// @param pid The pool ID
    /// @param user The withdrawer's address
    /// @param amount The LP tokens withdrawn
    event Withdrawn(uint256 indexed pid, address indexed user, uint256 amount);

    /// @notice Emitted when a user claims $RUN rewards
    /// @param pid The pool ID
    /// @param user The claimer's address
    /// @param reward The $RUN tokens minted to the user
    event RewardClaimed(uint256 indexed pid, address indexed user, uint256 reward);

    /// @notice Emitted when a user's boost status changes via refreshBoost()
    /// @param pid The pool ID
    /// @param user The user whose boost changed
    /// @param boosted The new boost status
    event BoostUpdated(uint256 indexed pid, address indexed user, bool boosted);

    /// @notice Emitted when the global $RUN emission rate is changed
    /// @param oldRate The previous emission rate (tokens per second)
    /// @param newRate The new emission rate (tokens per second)
    event RunPerSecondUpdated(uint256 oldRate, uint256 newRate);

    /// @notice Emitted when a user emergency-withdraws (forfeiting rewards)
    /// @param pid The pool ID
    /// @param user The user's address
    /// @param amount The LP tokens returned
    event EmergencyWithdrawn(uint256 indexed pid, address indexed user, uint256 amount);

    // ── User Functions ──────────────────────────────────────

    /// @notice Stake LP tokens into a pool to earn $RUN rewards
    /// @dev Claims any pending rewards before adding the new stake. Checks agent token
    ///      balance to determine boost eligibility on entry.
    /// @param pid The pool ID to stake in
    /// @param amount The number of LP tokens to stake
    function stake(uint256 pid, uint256 amount) external;

    /// @notice Withdraw LP tokens from a pool
    /// @dev Claims any pending rewards before removing the stake. Rechecks boost status
    ///      on the remaining balance.
    /// @param pid The pool ID to withdraw from
    /// @param amount The number of LP tokens to withdraw
    function withdraw(uint256 pid, uint256 amount) external;

    /// @notice Claim pending $RUN rewards from a pool
    /// @dev Mints pending rewards to the caller via RunToken.mint()
    /// @param pid The pool ID to claim from
    function claim(uint256 pid) external;

    /// @notice Update boost status based on current agent token balance
    /// @dev Call this if your $AGENT token balance changed since your last stake/claim.
    ///      Harvests pending rewards, then recalculates effective stake weight.
    /// @param pid The pool ID to refresh boost for
    function refreshBoost(uint256 pid) external;

    /// @notice Emergency withdraw LP tokens without caring about rewards
    /// @dev Forfeits all pending rewards. Use only if normal withdraw is stuck.
    /// @param pid The pool ID to emergency-withdraw from
    function emergencyWithdraw(uint256 pid) external;

    // ── View Functions ──────────────────────────────────────

    /// @notice Calculate pending $RUN rewards for a user in a pool
    /// @param pid The pool ID
    /// @param account The user's address
    /// @return pending The unclaimed $RUN reward amount
    function pendingReward(uint256 pid, address account) external view returns (uint256 pending);

    /// @notice Get a user's staking info in a pool
    /// @param pid The pool ID
    /// @param account The user's address
    /// @return info The user's staking state
    function getUserInfo(uint256 pid, address account) external view returns (UserInfo memory info);

    /// @notice Get a pool's configuration and state
    /// @param pid The pool ID
    /// @return info The pool's state
    function getPoolInfo(uint256 pid) external view returns (PoolInfo memory info);

    /// @notice Get the total number of staking pools
    /// @return count The number of pools
    function getPoolCount() external view returns (uint256 count);

    /// @notice Get the sum of all pool allocation points
    /// @return points The total allocation points
    function getTotalAllocPoint() external view returns (uint256 points);

    // ── Admin Functions ─────────────────────────────────────

    /// @notice Add a new staking pool
    /// @dev Only callable by owner. Triggers mass pool update to keep accounting consistent.
    /// @param stakingToken The LP token to stake
    /// @param agentToken The $AGENT token for boost eligibility (address(0) for no boost)
    /// @param agentTokenThreshold Minimum $AGENT balance for 3x boost
    /// @param allocPoint Reward allocation weight for this pool
    function addPool(
        address stakingToken,
        address agentToken,
        uint256 agentTokenThreshold,
        uint256 allocPoint
    ) external;

    /// @notice Update a pool's allocation weight and boost threshold
    /// @dev Only callable by owner. Triggers mass pool update.
    /// @param pid The pool ID to update
    /// @param allocPoint The new allocation weight
    /// @param agentTokenThreshold The new minimum $AGENT balance for boost
    function setPool(uint256 pid, uint256 allocPoint, uint256 agentTokenThreshold) external;

    /// @notice Update the global $RUN emission rate
    /// @dev Only callable by owner. Triggers mass pool update. Capped by MAX_RUN_PER_SECOND.
    /// @param newRate The new emission rate in $RUN per second (18 decimals)
    function setRunPerSecond(uint256 newRate) external;
}
