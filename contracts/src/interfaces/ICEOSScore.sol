// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title ICEOSScore
/// @notice Interface for the 5-dimension CEOS Score v2 contract.
/// @dev Dimensions: Trading (30%), Engagement (25%), Revenue (20%), Quality (15%), Reliability (10%).
interface ICEOSScore {
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

    /// @notice Emitted when scores are submitted for an epoch
    event ScoresSubmitted(uint256 indexed epoch, uint256 count);

    /// @notice Emitted when an agent achieves a tier (Silver+)
    event TierAchieved(address indexed agent, uint256 indexed epoch, uint8 tier);

    /// @notice Emitted when the oracle address is updated
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);

    /// @notice Caller is not the authorized oracle or owner
    error UnauthorizedOracle();

    /// @notice Scores have already been submitted for this epoch
    error ScoresAlreadySubmitted();

    /// @notice Input array lengths do not match
    error ArrayLengthMismatch();

    /// @notice A score value exceeds MAX_SCORE (10000)
    error InvalidScoreValue();

    /// @notice Submit 5-dimension agent scores for a given epoch
    /// @param epoch The epoch number to submit scores for
    /// @param agents Array of agent addresses
    /// @param trading Array of trading performance scores (0-10000 bps)
    /// @param engagement Array of engagement scores (0-10000 bps)
    /// @param revenue Array of revenue generation scores (0-10000 bps)
    /// @param quality Array of content quality scores (0-10000 bps)
    /// @param reliability Array of reliability scores (0-10000 bps)
    function submitScores(
        uint256 epoch,
        address[] calldata agents,
        uint256[] calldata trading,
        uint256[] calldata engagement,
        uint256[] calldata revenue,
        uint256[] calldata quality,
        uint256[] calldata reliability
    ) external;

    /// @notice Get the score breakdown for an agent in a specific epoch
    /// @param agent The agent's address
    /// @param epoch The epoch number to query
    /// @return The ScoreBreakdown struct with per-dimension and total weighted scores
    function getScore(address agent, uint256 epoch) external view returns (ScoreBreakdown memory);

    /// @notice Get the total weighted score sum for an epoch across all agents
    /// @param epoch The epoch number to query
    /// @return The sum of all agents' weighted scores for the epoch
    function getTotalScore(uint256 epoch) external view returns (uint256);

    /// @notice Update the oracle address (owner only)
    /// @param newOracle The new oracle address
    function setOracle(address newOracle) external;
}
