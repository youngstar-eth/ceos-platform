// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @title CEOSScore
/// @notice On-chain 5-dimension agent scoring for CEOS Score v2.
/// @dev Trading (30%), Engagement (25%), Revenue (20%), Quality (15%), Reliability (10%).
///      All score values are in basis points (0–10000). Oracle submits batch scores per epoch.
contract CEOSScore is Ownable {
    // ---------------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------------

    /// @notice Maximum score value in basis points
    uint256 public constant MAX_SCORE = 10_000;

    /// @notice Weight for trading performance (30% = 3000 bps)
    uint256 public constant TRADING_WEIGHT = 3_000;

    /// @notice Weight for engagement score (25% = 2500 bps)
    uint256 public constant ENGAGEMENT_WEIGHT = 2_500;

    /// @notice Weight for revenue generation (20% = 2000 bps)
    uint256 public constant REVENUE_WEIGHT = 2_000;

    /// @notice Weight for content quality (15% = 1500 bps)
    uint256 public constant QUALITY_WEIGHT = 1_500;

    /// @notice Weight for reliability (10% = 1000 bps)
    uint256 public constant RELIABILITY_WEIGHT = 1_000;

    /// @notice Basis points denominator for weight calculations
    uint256 public constant WEIGHT_DENOMINATOR = 10_000;

    /// @notice Tier thresholds in basis points
    uint256 public constant DIAMOND_THRESHOLD = 9_000;
    uint256 public constant PLATINUM_THRESHOLD = 7_500;
    uint256 public constant GOLD_THRESHOLD = 5_000;
    uint256 public constant SILVER_THRESHOLD = 2_500;

    // ---------------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------------

    /// @notice Score breakdown for a single agent in an epoch
    struct ScoreBreakdown {
        uint256 trading;
        uint256 engagement;
        uint256 revenue;
        uint256 quality;
        uint256 reliability;
        uint256 totalScore;
        uint8 tier; // 0=Bronze, 1=Silver, 2=Gold, 3=Platinum, 4=Diamond
    }

    // ---------------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------------

    /// @notice Emitted when scores are submitted for an epoch
    event ScoresSubmitted(uint256 indexed epoch, uint256 count);

    /// @notice Emitted when an agent achieves a tier (Silver+)
    event TierAchieved(address indexed agent, uint256 indexed epoch, uint8 tier);

    /// @notice Emitted when the oracle address is updated
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);

    // ---------------------------------------------------------------------------
    // Custom Errors
    // ---------------------------------------------------------------------------

    /// @notice Caller is not the authorized oracle or owner
    error UnauthorizedOracle();

    /// @notice Scores have already been submitted for this epoch
    error ScoresAlreadySubmitted();

    /// @notice Input array lengths do not match
    error ArrayLengthMismatch();

    /// @notice A score value exceeds MAX_SCORE (10000)
    error InvalidScoreValue();

    // ---------------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------------

    /// @notice The authorized oracle address for submitting scores
    address public oracle;

    /// @notice Mapping of agent address => epoch => ScoreBreakdown
    mapping(address => mapping(uint256 => ScoreBreakdown)) private _scores;

    /// @notice Total weighted score sum per epoch across all agents
    mapping(uint256 => uint256) private _totalScores;

    /// @notice Tracks whether scores have been submitted for an epoch
    mapping(uint256 => bool) private _epochSubmitted;

    // ---------------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------------

    /// @notice Initialize with oracle address. Deployer becomes owner.
    /// @param _oracle The authorized oracle address for score submissions
    constructor(address _oracle) Ownable(msg.sender) {
        oracle = _oracle;
    }

    // ---------------------------------------------------------------------------
    // External Functions
    // ---------------------------------------------------------------------------

    /// @notice Submit 5-dimension agent scores for a given epoch
    /// @dev Only callable by the authorized oracle or owner. Scores are capped at MAX_SCORE.
    /// @param epoch The epoch number to submit scores for
    /// @param agents Array of agent addresses
    /// @param trading Array of trading performance scores (0–10000 bps)
    /// @param engagement Array of engagement scores (0–10000 bps)
    /// @param revenue Array of revenue generation scores (0–10000 bps)
    /// @param quality Array of content quality scores (0–10000 bps)
    /// @param reliability Array of reliability scores (0–10000 bps)
    function submitScores(
        uint256 epoch,
        address[] calldata agents,
        uint256[] calldata trading,
        uint256[] calldata engagement,
        uint256[] calldata revenue,
        uint256[] calldata quality,
        uint256[] calldata reliability
    ) external {
        if (msg.sender != oracle && msg.sender != owner()) revert UnauthorizedOracle();
        if (_epochSubmitted[epoch]) revert ScoresAlreadySubmitted();
        if (
            agents.length != trading.length || agents.length != engagement.length
                || agents.length != revenue.length || agents.length != quality.length
                || agents.length != reliability.length
        ) {
            revert ArrayLengthMismatch();
        }

        uint256 totalScore =
            _processScores(epoch, agents, trading, engagement, revenue, quality, reliability);

        _totalScores[epoch] = totalScore;
        _epochSubmitted[epoch] = true;

        emit ScoresSubmitted(epoch, agents.length);
    }

    /// @notice Get the score breakdown for an agent in a specific epoch
    /// @param agent The agent's address
    /// @param epoch The epoch number to query
    /// @return The ScoreBreakdown struct with per-dimension and total weighted scores
    function getScore(address agent, uint256 epoch) external view returns (ScoreBreakdown memory) {
        return _scores[agent][epoch];
    }

    /// @notice Get the total weighted score sum for an epoch across all agents
    /// @param epoch The epoch number to query
    /// @return The sum of all agents' weighted scores for the epoch
    function getTotalScore(uint256 epoch) external view returns (uint256) {
        return _totalScores[epoch];
    }

    /// @notice Update the oracle address (owner only)
    /// @param newOracle The new oracle address
    function setOracle(address newOracle) external onlyOwner {
        address oldOracle = oracle;
        oracle = newOracle;
        emit OracleUpdated(oldOracle, newOracle);
    }

    // ---------------------------------------------------------------------------
    // Internal Functions
    // ---------------------------------------------------------------------------

    /// @notice Internal function to process and store individual agent scores
    /// @dev Separated from submitScores to avoid stack-too-deep errors
    function _processScores(
        uint256 epoch,
        address[] calldata agents,
        uint256[] calldata trading,
        uint256[] calldata engagement,
        uint256[] calldata revenue,
        uint256[] calldata quality,
        uint256[] calldata reliability
    ) private returns (uint256 totalScore) {
        for (uint256 i; i < agents.length; ++i) {
            totalScore += _computeAndStore(
                epoch, agents[i], trading[i], engagement[i], revenue[i], quality[i], reliability[i]
            );
        }
    }

    /// @notice Compute weighted score, assign tier, and store breakdown for a single agent
    function _computeAndStore(
        uint256 epoch,
        address agent,
        uint256 trd,
        uint256 eng,
        uint256 rev,
        uint256 qlty,
        uint256 rel
    ) private returns (uint256 weighted) {
        if (
            trd > MAX_SCORE || eng > MAX_SCORE || rev > MAX_SCORE || qlty > MAX_SCORE
                || rel > MAX_SCORE
        ) {
            revert InvalidScoreValue();
        }

        weighted = (
            trd * TRADING_WEIGHT + eng * ENGAGEMENT_WEIGHT + rev * REVENUE_WEIGHT
                + qlty * QUALITY_WEIGHT + rel * RELIABILITY_WEIGHT
        ) / WEIGHT_DENOMINATOR;

        uint8 tier = _calculateTier(weighted);

        _scores[agent][epoch] = ScoreBreakdown({
            trading: trd,
            engagement: eng,
            revenue: rev,
            quality: qlty,
            reliability: rel,
            totalScore: weighted,
            tier: tier
        });

        if (tier > 0) {
            emit TierAchieved(agent, epoch, tier);
        }
    }

    /// @notice Determine tier from weighted total score
    /// @param score The weighted total score (0–10000)
    /// @return tier 0=Bronze, 1=Silver, 2=Gold, 3=Platinum, 4=Diamond
    function _calculateTier(uint256 score) private pure returns (uint8) {
        if (score >= DIAMOND_THRESHOLD) return 4;
        if (score >= PLATINUM_THRESHOLD) return 3;
        if (score >= GOLD_THRESHOLD) return 2;
        if (score >= SILVER_THRESHOLD) return 1;
        return 0;
    }
}
