// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { CEOSScore } from "../src/CEOSScore.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @title CEOSScoreTest
/// @notice Comprehensive Foundry test suite for the CEOSScore (5-dimension, v2) contract.
/// @dev Covers happy paths, reverts, weighted calculations, tier assignments, events,
///      gas benchmarks, multi-epoch scoring, and access control.
contract CEOSScoreTest is Test {
    CEOSScore public ceosScore;

    address public owner;
    address public oracle;
    address public agent1;
    address public agent2;
    address public agent3;
    address public unauthorized;

    // ---------------------------------------------------------------------------
    // Setup
    // ---------------------------------------------------------------------------

    function setUp() public {
        owner = address(this);
        oracle = makeAddr("oracle");
        agent1 = makeAddr("agent1");
        agent2 = makeAddr("agent2");
        agent3 = makeAddr("agent3");
        unauthorized = makeAddr("unauthorized");

        ceosScore = new CEOSScore(oracle);
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    /// @notice Build dynamic address arrays for batch submissions
    function _makeAddresses(uint256 count) internal pure returns (address[] memory agents) {
        agents = new address[](count);
        for (uint256 i; i < count; ++i) {
            agents[i] = address(uint160(0x1000 + i));
        }
    }

    /// @notice Build dynamic uint256 arrays with a uniform value
    function _makeUniformScores(uint256 count, uint256 value) internal pure returns (uint256[] memory scores) {
        scores = new uint256[](count);
        for (uint256 i; i < count; ++i) {
            scores[i] = value;
        }
    }

    /// @notice Compute expected weighted total for a single agent (mirrors contract logic)
    function _expectedWeighted(
        uint256 trd,
        uint256 eng,
        uint256 rev,
        uint256 qlty,
        uint256 rel
    ) internal pure returns (uint256) {
        return (trd * 3_000 + eng * 2_500 + rev * 2_000 + qlty * 1_500 + rel * 1_000) / 10_000;
    }

    // ---------------------------------------------------------------------------
    // Happy Path
    // ---------------------------------------------------------------------------

    /// @notice Oracle submits scores for 3 agents; verify per-dimension and total storage
    function testSubmitScores() public {
        address[] memory agents = new address[](3);
        agents[0] = agent1;
        agents[1] = agent2;
        agents[2] = agent3;

        uint256[] memory trading = new uint256[](3);
        trading[0] = 8_000;
        trading[1] = 6_000;
        trading[2] = 4_000;

        uint256[] memory engagement = new uint256[](3);
        engagement[0] = 7_000;
        engagement[1] = 5_000;
        engagement[2] = 3_000;

        uint256[] memory revenue = new uint256[](3);
        revenue[0] = 9_000;
        revenue[1] = 7_000;
        revenue[2] = 5_000;

        uint256[] memory quality = new uint256[](3);
        quality[0] = 6_000;
        quality[1] = 8_000;
        quality[2] = 2_000;

        uint256[] memory reliability = new uint256[](3);
        reliability[0] = 9_500;
        reliability[1] = 7_500;
        reliability[2] = 1_000;

        vm.prank(oracle);
        ceosScore.submitScores(1, agents, trading, engagement, revenue, quality, reliability);

        // Verify agent1 breakdown
        CEOSScore.ScoreBreakdown memory s1 = ceosScore.getScore(agent1, 1);
        assertEq(s1.trading, 8_000, "agent1 trading");
        assertEq(s1.engagement, 7_000, "agent1 engagement");
        assertEq(s1.revenue, 9_000, "agent1 revenue");
        assertEq(s1.quality, 6_000, "agent1 quality");
        assertEq(s1.reliability, 9_500, "agent1 reliability");
        assertEq(s1.totalScore, _expectedWeighted(8_000, 7_000, 9_000, 6_000, 9_500), "agent1 weighted");

        // Verify agent2 breakdown
        CEOSScore.ScoreBreakdown memory s2 = ceosScore.getScore(agent2, 1);
        assertEq(s2.trading, 6_000, "agent2 trading");
        assertEq(s2.engagement, 5_000, "agent2 engagement");
        assertEq(s2.revenue, 7_000, "agent2 revenue");
        assertEq(s2.quality, 8_000, "agent2 quality");
        assertEq(s2.reliability, 7_500, "agent2 reliability");
        assertEq(s2.totalScore, _expectedWeighted(6_000, 5_000, 7_000, 8_000, 7_500), "agent2 weighted");

        // Verify agent3 breakdown
        CEOSScore.ScoreBreakdown memory s3 = ceosScore.getScore(agent3, 1);
        assertEq(s3.trading, 4_000, "agent3 trading");
        assertEq(s3.engagement, 3_000, "agent3 engagement");
        assertEq(s3.revenue, 5_000, "agent3 revenue");
        assertEq(s3.quality, 2_000, "agent3 quality");
        assertEq(s3.reliability, 1_000, "agent3 reliability");
        assertEq(s3.totalScore, _expectedWeighted(4_000, 3_000, 5_000, 2_000, 1_000), "agent3 weighted");
    }

    // ---------------------------------------------------------------------------
    // Revert Cases
    // ---------------------------------------------------------------------------

    /// @notice Non-oracle, non-owner caller reverts with UnauthorizedOracle
    function testSubmitScoresRevertUnauthorized() public {
        address[] memory agents = new address[](1);
        agents[0] = agent1;
        uint256[] memory scores = _makeUniformScores(1, 5_000);

        vm.prank(unauthorized);
        vm.expectRevert(CEOSScore.UnauthorizedOracle.selector);
        ceosScore.submitScores(1, agents, scores, scores, scores, scores, scores);
    }

    /// @notice Submitting scores for the same epoch twice reverts with ScoresAlreadySubmitted
    function testSubmitScoresRevertDuplicate() public {
        address[] memory agents = new address[](1);
        agents[0] = agent1;
        uint256[] memory scores = _makeUniformScores(1, 5_000);

        vm.prank(oracle);
        ceosScore.submitScores(1, agents, scores, scores, scores, scores, scores);

        vm.prank(oracle);
        vm.expectRevert(CEOSScore.ScoresAlreadySubmitted.selector);
        ceosScore.submitScores(1, agents, scores, scores, scores, scores, scores);
    }

    /// @notice Mismatched array lengths revert with ArrayLengthMismatch
    function testSubmitScoresRevertArrayMismatch() public {
        address[] memory agents = new address[](2);
        agents[0] = agent1;
        agents[1] = agent2;

        uint256[] memory twoScores = _makeUniformScores(2, 5_000);
        uint256[] memory oneScore = _makeUniformScores(1, 5_000);

        // Mismatch on engagement array
        vm.prank(oracle);
        vm.expectRevert(CEOSScore.ArrayLengthMismatch.selector);
        ceosScore.submitScores(1, agents, twoScores, oneScore, twoScores, twoScores, twoScores);
    }

    /// @notice Score exceeding MAX_SCORE (10000) reverts with InvalidScoreValue
    function testSubmitScoresRevertInvalidValue() public {
        address[] memory agents = new address[](1);
        agents[0] = agent1;

        uint256[] memory validScores = _makeUniformScores(1, 5_000);
        uint256[] memory invalidScores = new uint256[](1);
        invalidScores[0] = 10_001; // exceeds MAX_SCORE

        // Invalid trading score
        vm.prank(oracle);
        vm.expectRevert(CEOSScore.InvalidScoreValue.selector);
        ceosScore.submitScores(1, agents, invalidScores, validScores, validScores, validScores, validScores);
    }

    // ---------------------------------------------------------------------------
    // Weighted Score Calculation
    // ---------------------------------------------------------------------------

    /// @notice Verify weighted formula: (T*3000 + E*2500 + R*2000 + Q*1500 + L*1000) / 10000
    function testWeightedScoreCalculation() public {
        address[] memory agents = new address[](1);
        agents[0] = agent1;

        uint256[] memory trading = new uint256[](1);
        trading[0] = 8_000;
        uint256[] memory engagement = new uint256[](1);
        engagement[0] = 6_000;
        uint256[] memory revenue = new uint256[](1);
        revenue[0] = 4_000;
        uint256[] memory quality = new uint256[](1);
        quality[0] = 2_000;
        uint256[] memory reliability = new uint256[](1);
        reliability[0] = 10_000;

        // Expected: (8000*3000 + 6000*2500 + 4000*2000 + 2000*1500 + 10000*1000) / 10000
        //         = (24000000 + 15000000 + 8000000 + 3000000 + 10000000) / 10000
        //         = 60000000 / 10000 = 6000
        uint256 expected = 6_000;

        vm.prank(oracle);
        ceosScore.submitScores(1, agents, trading, engagement, revenue, quality, reliability);

        CEOSScore.ScoreBreakdown memory score = ceosScore.getScore(agent1, 1);
        assertEq(score.totalScore, expected, "Weighted score should be 6000");

        // Also verify with all-max scores => 10000
        address[] memory agents2 = new address[](1);
        agents2[0] = agent2;
        uint256[] memory maxScores = _makeUniformScores(1, 10_000);

        vm.prank(oracle);
        ceosScore.submitScores(2, agents2, maxScores, maxScores, maxScores, maxScores, maxScores);

        CEOSScore.ScoreBreakdown memory maxScore = ceosScore.getScore(agent2, 2);
        assertEq(maxScore.totalScore, 10_000, "All max scores should yield 10000 weighted");

        // Verify with all-zero scores => 0
        address[] memory agents3 = new address[](1);
        agents3[0] = agent3;
        uint256[] memory zeroScores = _makeUniformScores(1, 0);

        vm.prank(oracle);
        ceosScore.submitScores(3, agents3, zeroScores, zeroScores, zeroScores, zeroScores, zeroScores);

        CEOSScore.ScoreBreakdown memory zeroScore = ceosScore.getScore(agent3, 3);
        assertEq(zeroScore.totalScore, 0, "All zero scores should yield 0 weighted");
    }

    // ---------------------------------------------------------------------------
    // Tier Assignment
    // ---------------------------------------------------------------------------

    /// @notice Verify tier boundaries: Diamond(9000+), Platinum(7500-8999), Gold(5000-7499), Silver(2500-4999), Bronze(0-2499)
    function testTierAssignment() public {
        // Diamond: all 10000 => weighted 10000 (>= 9000)
        _submitSingleAgent(agent1, 1, 10_000, 10_000, 10_000, 10_000, 10_000);
        CEOSScore.ScoreBreakdown memory diamond = ceosScore.getScore(agent1, 1);
        assertEq(diamond.tier, 4, "Score 10000 should be Diamond (tier 4)");

        // Platinum: uniform 8000 => weighted 8000 (>= 7500, < 9000)
        _submitSingleAgent(agent1, 2, 8_000, 8_000, 8_000, 8_000, 8_000);
        CEOSScore.ScoreBreakdown memory platinum = ceosScore.getScore(agent1, 2);
        assertEq(platinum.tier, 3, "Score 8000 should be Platinum (tier 3)");

        // Gold: uniform 5000 => weighted 5000 (>= 5000, < 7500)
        _submitSingleAgent(agent1, 3, 5_000, 5_000, 5_000, 5_000, 5_000);
        CEOSScore.ScoreBreakdown memory gold = ceosScore.getScore(agent1, 3);
        assertEq(gold.tier, 2, "Score 5000 should be Gold (tier 2)");

        // Silver: uniform 2500 => weighted 2500 (>= 2500, < 5000)
        _submitSingleAgent(agent1, 4, 2_500, 2_500, 2_500, 2_500, 2_500);
        CEOSScore.ScoreBreakdown memory silver = ceosScore.getScore(agent1, 4);
        assertEq(silver.tier, 1, "Score 2500 should be Silver (tier 1)");

        // Bronze: uniform 2499 => weighted 2499 (< 2500)
        _submitSingleAgent(agent1, 5, 2_499, 2_499, 2_499, 2_499, 2_499);
        CEOSScore.ScoreBreakdown memory bronze = ceosScore.getScore(agent1, 5);
        assertEq(bronze.tier, 0, "Score 2499 should be Bronze (tier 0)");

        // Edge case: exactly at Diamond threshold (9000)
        _submitSingleAgent(agent1, 6, 9_000, 9_000, 9_000, 9_000, 9_000);
        CEOSScore.ScoreBreakdown memory diamondEdge = ceosScore.getScore(agent1, 6);
        assertEq(diamondEdge.tier, 4, "Score 9000 should be Diamond (tier 4)");

        // Edge case: exactly at Platinum threshold (7500)
        _submitSingleAgent(agent1, 7, 7_500, 7_500, 7_500, 7_500, 7_500);
        CEOSScore.ScoreBreakdown memory platinumEdge = ceosScore.getScore(agent1, 7);
        assertEq(platinumEdge.tier, 3, "Score 7500 should be Platinum (tier 3)");

        // Edge case: zero scores => Bronze
        _submitSingleAgent(agent1, 8, 0, 0, 0, 0, 0);
        CEOSScore.ScoreBreakdown memory zeroBronze = ceosScore.getScore(agent1, 8);
        assertEq(zeroBronze.tier, 0, "Score 0 should be Bronze (tier 0)");
    }

    /// @notice Helper to submit scores for a single agent in a given epoch
    function _submitSingleAgent(
        address agent,
        uint256 epoch,
        uint256 trd,
        uint256 eng,
        uint256 rev,
        uint256 qlty,
        uint256 rel
    ) internal {
        address[] memory agents = new address[](1);
        agents[0] = agent;

        uint256[] memory trading = new uint256[](1);
        trading[0] = trd;
        uint256[] memory engagement = new uint256[](1);
        engagement[0] = eng;
        uint256[] memory revenue = new uint256[](1);
        revenue[0] = rev;
        uint256[] memory quality = new uint256[](1);
        quality[0] = qlty;
        uint256[] memory reliability = new uint256[](1);
        reliability[0] = rel;

        vm.prank(oracle);
        ceosScore.submitScores(epoch, agents, trading, engagement, revenue, quality, reliability);
    }

    // ---------------------------------------------------------------------------
    // Event Emission
    // ---------------------------------------------------------------------------

    /// @notice TierAchieved event emitted for Silver+ agents, not for Bronze
    function testTierAchievementEvent() public {
        address[] memory agents = new address[](3);
        agents[0] = agent1; // Diamond
        agents[1] = agent2; // Silver
        agents[2] = agent3; // Bronze

        uint256[] memory trading = new uint256[](3);
        trading[0] = 10_000;
        trading[1] = 2_500;
        trading[2] = 1_000;

        uint256[] memory engagement = new uint256[](3);
        engagement[0] = 10_000;
        engagement[1] = 2_500;
        engagement[2] = 1_000;

        uint256[] memory revenue = new uint256[](3);
        revenue[0] = 10_000;
        revenue[1] = 2_500;
        revenue[2] = 1_000;

        uint256[] memory quality = new uint256[](3);
        quality[0] = 10_000;
        quality[1] = 2_500;
        quality[2] = 1_000;

        uint256[] memory reliability = new uint256[](3);
        reliability[0] = 10_000;
        reliability[1] = 2_500;
        reliability[2] = 1_000;

        // Expect TierAchieved for agent1 (Diamond, tier=4)
        vm.expectEmit(true, true, false, true);
        emit CEOSScore.TierAchieved(agent1, 1, 4);

        // Expect TierAchieved for agent2 (Silver, tier=1)
        vm.expectEmit(true, true, false, true);
        emit CEOSScore.TierAchieved(agent2, 1, 1);

        // Expect ScoresSubmitted event
        vm.expectEmit(true, false, false, true);
        emit CEOSScore.ScoresSubmitted(1, 3);

        // No TierAchieved event for agent3 (Bronze, tier=0)
        vm.prank(oracle);
        ceosScore.submitScores(1, agents, trading, engagement, revenue, quality, reliability);
    }

    // ---------------------------------------------------------------------------
    // Gas Benchmarks
    // ---------------------------------------------------------------------------

    /// @notice Gas benchmark: submit scores for 10, 50, and 100 agents
    function testBatchSubmitGas() public {
        // --- 10 agents ---
        {
            address[] memory agents10 = _makeAddresses(10);
            uint256[] memory scores10 = _makeUniformScores(10, 7_000);

            vm.prank(oracle);
            uint256 gasBefore = gasleft();
            ceosScore.submitScores(10, agents10, scores10, scores10, scores10, scores10, scores10);
            uint256 gasUsed10 = gasBefore - gasleft();
            emit log_named_uint("Gas used for 10 agents", gasUsed10);
        }

        // --- 50 agents ---
        {
            address[] memory agents50 = _makeAddresses(50);
            uint256[] memory scores50 = _makeUniformScores(50, 7_000);

            vm.prank(oracle);
            uint256 gasBefore = gasleft();
            ceosScore.submitScores(50, agents50, scores50, scores50, scores50, scores50, scores50);
            uint256 gasUsed50 = gasBefore - gasleft();
            emit log_named_uint("Gas used for 50 agents", gasUsed50);
        }

        // --- 100 agents ---
        {
            address[] memory agents100 = _makeAddresses(100);
            uint256[] memory scores100 = _makeUniformScores(100, 7_000);

            vm.prank(oracle);
            uint256 gasBefore = gasleft();
            ceosScore.submitScores(100, agents100, scores100, scores100, scores100, scores100, scores100);
            uint256 gasUsed100 = gasBefore - gasleft();
            emit log_named_uint("Gas used for 100 agents", gasUsed100);
        }
    }

    // ---------------------------------------------------------------------------
    // Oracle Management
    // ---------------------------------------------------------------------------

    /// @notice Owner can change oracle and OracleUpdated event is emitted
    function testSetOracle() public {
        address newOracle = makeAddr("newOracle");

        vm.expectEmit(true, true, false, true);
        emit CEOSScore.OracleUpdated(oracle, newOracle);

        ceosScore.setOracle(newOracle);
        assertEq(ceosScore.oracle(), newOracle, "Oracle should be updated to newOracle");

        // Verify old oracle can no longer submit
        address[] memory agents = new address[](1);
        agents[0] = agent1;
        uint256[] memory scores = _makeUniformScores(1, 5_000);

        vm.prank(oracle);
        vm.expectRevert(CEOSScore.UnauthorizedOracle.selector);
        ceosScore.submitScores(1, agents, scores, scores, scores, scores, scores);

        // Verify new oracle can submit
        vm.prank(newOracle);
        ceosScore.submitScores(1, agents, scores, scores, scores, scores, scores);

        CEOSScore.ScoreBreakdown memory score = ceosScore.getScore(agent1, 1);
        assertEq(score.totalScore, 5_000, "New oracle submission should succeed");
    }

    /// @notice Non-owner cannot change oracle (Ownable revert)
    function testSetOracleRevertNonOwner() public {
        address newOracle = makeAddr("newOracle");

        vm.prank(unauthorized);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, unauthorized));
        ceosScore.setOracle(newOracle);
    }

    // ---------------------------------------------------------------------------
    // Non-Existent Score
    // ---------------------------------------------------------------------------

    /// @notice Querying an unscored agent returns zero-value ScoreBreakdown
    function testGetScoreNonExistent() public view {
        CEOSScore.ScoreBreakdown memory score = ceosScore.getScore(agent1, 999);
        assertEq(score.trading, 0, "Unscored trading should be 0");
        assertEq(score.engagement, 0, "Unscored engagement should be 0");
        assertEq(score.revenue, 0, "Unscored revenue should be 0");
        assertEq(score.quality, 0, "Unscored quality should be 0");
        assertEq(score.reliability, 0, "Unscored reliability should be 0");
        assertEq(score.totalScore, 0, "Unscored totalScore should be 0");
        assertEq(score.tier, 0, "Unscored tier should be 0 (Bronze)");
    }

    // ---------------------------------------------------------------------------
    // Multi-Epoch Scoring
    // ---------------------------------------------------------------------------

    /// @notice Same agent scored in epochs 1, 2, 3 -- each stored separately
    function testMultiEpochScoring() public {
        // Epoch 1: low scores
        _submitSingleAgent(agent1, 1, 2_000, 2_000, 2_000, 2_000, 2_000);

        // Epoch 2: medium scores
        _submitSingleAgent(agent1, 2, 5_000, 5_000, 5_000, 5_000, 5_000);

        // Epoch 3: high scores
        _submitSingleAgent(agent1, 3, 9_500, 9_500, 9_500, 9_500, 9_500);

        CEOSScore.ScoreBreakdown memory s1 = ceosScore.getScore(agent1, 1);
        CEOSScore.ScoreBreakdown memory s2 = ceosScore.getScore(agent1, 2);
        CEOSScore.ScoreBreakdown memory s3 = ceosScore.getScore(agent1, 3);

        // Verify each epoch stored independently
        assertEq(s1.totalScore, 2_000, "Epoch 1 should be 2000");
        assertEq(s1.tier, 0, "Epoch 1 should be Bronze");

        assertEq(s2.totalScore, 5_000, "Epoch 2 should be 5000");
        assertEq(s2.tier, 2, "Epoch 2 should be Gold");

        assertEq(s3.totalScore, 9_500, "Epoch 3 should be 9500");
        assertEq(s3.tier, 4, "Epoch 3 should be Diamond");

        // Confirm epoch 1 was not overwritten by later epochs
        assertEq(s1.trading, 2_000, "Epoch 1 trading should remain 2000");
        assertEq(s3.trading, 9_500, "Epoch 3 trading should be 9500");
    }

    // ---------------------------------------------------------------------------
    // Owner Can Submit Scores
    // ---------------------------------------------------------------------------

    /// @notice Owner (deployer, not oracle) can also submit scores
    function testOwnerCanSubmitScores() public {
        address[] memory agents = new address[](1);
        agents[0] = agent1;
        uint256[] memory scores = _makeUniformScores(1, 7_500);

        // Owner (address(this)) submits directly -- not via oracle
        ceosScore.submitScores(1, agents, scores, scores, scores, scores, scores);

        CEOSScore.ScoreBreakdown memory score = ceosScore.getScore(agent1, 1);
        assertEq(score.totalScore, 7_500, "Owner-submitted score should be 7500");
        assertEq(score.tier, 3, "Score 7500 should be Platinum");
    }

    // ---------------------------------------------------------------------------
    // Total Score Across Agents
    // ---------------------------------------------------------------------------

    /// @notice getTotalScore returns the sum of all agents' weighted scores for an epoch
    function testTotalScoreAcrossAgents() public {
        address[] memory agents = new address[](3);
        agents[0] = agent1;
        agents[1] = agent2;
        agents[2] = agent3;

        uint256[] memory trading = new uint256[](3);
        trading[0] = 10_000;
        trading[1] = 5_000;
        trading[2] = 0;

        uint256[] memory engagement = new uint256[](3);
        engagement[0] = 10_000;
        engagement[1] = 5_000;
        engagement[2] = 0;

        uint256[] memory revenue = new uint256[](3);
        revenue[0] = 10_000;
        revenue[1] = 5_000;
        revenue[2] = 0;

        uint256[] memory quality = new uint256[](3);
        quality[0] = 10_000;
        quality[1] = 5_000;
        quality[2] = 0;

        uint256[] memory reliability = new uint256[](3);
        reliability[0] = 10_000;
        reliability[1] = 5_000;
        reliability[2] = 0;

        vm.prank(oracle);
        ceosScore.submitScores(1, agents, trading, engagement, revenue, quality, reliability);

        // agent1: weighted = 10000, agent2: weighted = 5000, agent3: weighted = 0
        uint256 expectedTotal = 10_000 + 5_000 + 0;

        uint256 totalScore = ceosScore.getTotalScore(1);
        assertEq(totalScore, expectedTotal, "Total score should be sum of all weighted scores");

        // Verify individual scores sum to total
        CEOSScore.ScoreBreakdown memory s1 = ceosScore.getScore(agent1, 1);
        CEOSScore.ScoreBreakdown memory s2 = ceosScore.getScore(agent2, 1);
        CEOSScore.ScoreBreakdown memory s3 = ceosScore.getScore(agent3, 1);
        assertEq(
            s1.totalScore + s2.totalScore + s3.totalScore,
            totalScore,
            "Individual weighted scores should sum to getTotalScore"
        );
    }

    // ---------------------------------------------------------------------------
    // Additional Edge Cases
    // ---------------------------------------------------------------------------

    /// @notice Array length mismatch on each dimension is caught
    function testSubmitScoresRevertArrayMismatchAllDimensions() public {
        address[] memory agents = new address[](2);
        agents[0] = agent1;
        agents[1] = agent2;

        uint256[] memory two = _makeUniformScores(2, 5_000);
        uint256[] memory one = _makeUniformScores(1, 5_000);

        // Mismatch on revenue
        vm.prank(oracle);
        vm.expectRevert(CEOSScore.ArrayLengthMismatch.selector);
        ceosScore.submitScores(1, agents, two, two, one, two, two);

        // Mismatch on quality
        vm.prank(oracle);
        vm.expectRevert(CEOSScore.ArrayLengthMismatch.selector);
        ceosScore.submitScores(2, agents, two, two, two, one, two);

        // Mismatch on reliability
        vm.prank(oracle);
        vm.expectRevert(CEOSScore.ArrayLengthMismatch.selector);
        ceosScore.submitScores(3, agents, two, two, two, two, one);
    }

    /// @notice InvalidScoreValue reverts for each dimension independently
    function testSubmitScoresRevertInvalidValueAllDimensions() public {
        address[] memory agents = new address[](1);
        agents[0] = agent1;

        uint256[] memory valid = _makeUniformScores(1, 5_000);
        uint256[] memory invalid = new uint256[](1);
        invalid[0] = 10_001;

        // Invalid engagement
        vm.prank(oracle);
        vm.expectRevert(CEOSScore.InvalidScoreValue.selector);
        ceosScore.submitScores(10, agents, valid, invalid, valid, valid, valid);

        // Invalid revenue
        vm.prank(oracle);
        vm.expectRevert(CEOSScore.InvalidScoreValue.selector);
        ceosScore.submitScores(11, agents, valid, valid, invalid, valid, valid);

        // Invalid quality
        vm.prank(oracle);
        vm.expectRevert(CEOSScore.InvalidScoreValue.selector);
        ceosScore.submitScores(12, agents, valid, valid, valid, invalid, valid);

        // Invalid reliability
        vm.prank(oracle);
        vm.expectRevert(CEOSScore.InvalidScoreValue.selector);
        ceosScore.submitScores(13, agents, valid, valid, valid, valid, invalid);
    }

    /// @notice Unsubmitted epoch returns zero total score
    function testGetTotalScoreUnsubmittedEpoch() public view {
        uint256 total = ceosScore.getTotalScore(999);
        assertEq(total, 0, "Unsubmitted epoch total should be 0");
    }
}
