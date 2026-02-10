// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface ICreatorScore {
    struct ScoreBreakdown {
        uint256 engagement; // 40% weight
        uint256 growth; // 20% weight
        uint256 quality; // 25% weight
        uint256 uptime; // 15% weight
        uint256 totalScore;
    }

    event ScoresSubmitted(uint256 indexed epoch, uint256 creatorCount);
    event OracleUpdated(address oldOracle, address newOracle);

    error UnauthorizedOracle();
    error ScoresAlreadySubmitted();
    error InvalidScoreValue();
    error ArrayLengthMismatch();

    function submitScores(
        uint256 epoch,
        address[] calldata creators,
        uint256[] calldata engagement,
        uint256[] calldata growth,
        uint256[] calldata quality,
        uint256[] calldata uptime
    ) external;
    function getScore(address creator, uint256 epoch) external view returns (ScoreBreakdown memory);
    function getTotalScore(uint256 epoch) external view returns (uint256);
}
