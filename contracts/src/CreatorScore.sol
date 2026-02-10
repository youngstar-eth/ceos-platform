// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ICreatorScore } from "./interfaces/ICreatorScore.sol";

/// @title CreatorScore
/// @notice On-chain creator scoring system with weighted metrics for revenue distribution.
/// @dev Uses an oracle pattern where only the authorized oracle can submit scores.
///      Scoring weights: engagement (40%), growth (20%), quality (25%), uptime (15%).
///      All score values are in basis points (0-10000).
contract CreatorScore is ICreatorScore, Ownable {
    /// @notice Maximum score value in basis points
    uint256 public constant MAX_SCORE = 10_000;

    /// @notice Weight for engagement score (40% = 4000 bps)
    uint256 public constant ENGAGEMENT_WEIGHT = 4_000;

    /// @notice Weight for growth score (20% = 2000 bps)
    uint256 public constant GROWTH_WEIGHT = 2_000;

    /// @notice Weight for quality score (25% = 2500 bps)
    uint256 public constant QUALITY_WEIGHT = 2_500;

    /// @notice Weight for uptime score (15% = 1500 bps)
    uint256 public constant UPTIME_WEIGHT = 1_500;

    /// @notice Basis points denominator for weight calculations
    uint256 public constant WEIGHT_DENOMINATOR = 10_000;

    /// @notice The authorized oracle address for submitting scores
    address public oracle;

    /// @notice Mapping of creator address => epoch => ScoreBreakdown
    mapping(address => mapping(uint256 => ScoreBreakdown)) private _scores;

    /// @notice Total weighted score sum per epoch across all creators
    mapping(uint256 => uint256) private _totalScores;

    /// @notice Tracks whether scores have been submitted for an epoch
    mapping(uint256 => bool) private _epochSubmitted;

    /// @param _oracle The authorized oracle address for score submissions
    constructor(address _oracle) Ownable(msg.sender) {
        oracle = _oracle;
    }

    /// @notice Submit weighted creator scores for a given epoch
    /// @dev Only callable by the authorized oracle. Each score component must be <= MAX_SCORE (10000 bps).
    ///      The total weighted score is calculated as:
    ///      (engagement * 40% + growth * 20% + quality * 25% + uptime * 15%) / 10000
    /// @param epoch The epoch number to submit scores for
    /// @param creators Array of creator addresses
    /// @param engagement Array of engagement scores (0-10000 bps)
    /// @param growth Array of growth scores (0-10000 bps)
    /// @param quality Array of quality scores (0-10000 bps)
    /// @param uptime Array of uptime scores (0-10000 bps)
    function submitScores(
        uint256 epoch,
        address[] calldata creators,
        uint256[] calldata engagement,
        uint256[] calldata growth,
        uint256[] calldata quality,
        uint256[] calldata uptime
    ) external {
        if (msg.sender != oracle && msg.sender != owner()) revert UnauthorizedOracle();
        if (_epochSubmitted[epoch]) revert ScoresAlreadySubmitted();
        if (
            creators.length != engagement.length || creators.length != growth.length
                || creators.length != quality.length || creators.length != uptime.length
        ) {
            revert ArrayLengthMismatch();
        }

        uint256 totalScore = _processScores(epoch, creators, engagement, growth, quality, uptime);

        _totalScores[epoch] = totalScore;
        _epochSubmitted[epoch] = true;

        emit ScoresSubmitted(epoch, creators.length);
    }

    /// @notice Internal function to process and store individual creator scores
    /// @dev Separated from submitScores to avoid stack-too-deep errors
    function _processScores(
        uint256 epoch,
        address[] calldata creators,
        uint256[] calldata engagement,
        uint256[] calldata growth,
        uint256[] calldata quality,
        uint256[] calldata uptime
    ) private returns (uint256 totalScore) {
        for (uint256 i; i < creators.length; ++i) {
            totalScore += _computeAndStore(epoch, creators[i], engagement[i], growth[i], quality[i], uptime[i]);
        }
    }

    /// @notice Internal function to compute weighted score and store breakdown for a single creator
    function _computeAndStore(
        uint256 epoch,
        address creator,
        uint256 eng,
        uint256 grw,
        uint256 qlty,
        uint256 upt
    ) private returns (uint256 weighted) {
        if (eng > MAX_SCORE || grw > MAX_SCORE || qlty > MAX_SCORE || upt > MAX_SCORE) {
            revert InvalidScoreValue();
        }

        weighted = (eng * ENGAGEMENT_WEIGHT + grw * GROWTH_WEIGHT + qlty * QUALITY_WEIGHT + upt * UPTIME_WEIGHT)
            / WEIGHT_DENOMINATOR;

        _scores[creator][epoch] =
            ScoreBreakdown({ engagement: eng, growth: grw, quality: qlty, uptime: upt, totalScore: weighted });
    }

    /// @notice Get the score breakdown for a creator in a specific epoch
    /// @param creator The creator's wallet address
    /// @param epoch The epoch number to query
    /// @return The ScoreBreakdown struct with individual and total weighted scores
    function getScore(address creator, uint256 epoch) external view returns (ScoreBreakdown memory) {
        return _scores[creator][epoch];
    }

    /// @notice Get the total weighted score sum for an epoch across all creators
    /// @param epoch The epoch number to query
    /// @return The sum of all creators' weighted scores for the epoch
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
}
