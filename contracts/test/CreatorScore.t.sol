// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { CreatorScore } from "../src/CreatorScore.sol";
import { ICreatorScore } from "../src/interfaces/ICreatorScore.sol";

/// @title CreatorScoreTest
/// @notice Comprehensive tests for CreatorScore contract
contract CreatorScoreTest is Test {
    CreatorScore public creatorScore;

    address public owner;
    address public oracle;
    address public creator1;
    address public creator2;
    address public unauthorized;

    function setUp() public {
        owner = address(this);
        oracle = makeAddr("oracle");
        creator1 = makeAddr("creator1");
        creator2 = makeAddr("creator2");
        unauthorized = makeAddr("unauthorized");

        creatorScore = new CreatorScore(oracle);
    }

    /// @notice Test successful score submission by oracle
    function test_submitScores_success() public {
        address[] memory creators = new address[](2);
        creators[0] = creator1;
        creators[1] = creator2;

        uint256[] memory engagement = new uint256[](2);
        engagement[0] = 8000;
        engagement[1] = 6000;

        uint256[] memory growth = new uint256[](2);
        growth[0] = 7000;
        growth[1] = 5000;

        uint256[] memory quality = new uint256[](2);
        quality[0] = 9000;
        quality[1] = 7000;

        uint256[] memory uptime = new uint256[](2);
        uptime[0] = 9500;
        uptime[1] = 8000;

        vm.prank(oracle);
        creatorScore.submitScores(0, creators, engagement, growth, quality, uptime);

        ICreatorScore.ScoreBreakdown memory score1 = creatorScore.getScore(creator1, 0);
        assertEq(score1.engagement, 8000);
        assertEq(score1.growth, 7000);
        assertEq(score1.quality, 9000);
        assertEq(score1.uptime, 9500);
        assertTrue(score1.totalScore > 0, "Total score should be positive");
    }

    /// @notice Test weighted score calculation correctness
    function test_submitScores_weightedCalculation() public {
        address[] memory creators = new address[](1);
        creators[0] = creator1;

        uint256[] memory engagement = new uint256[](1);
        engagement[0] = 10_000; // max

        uint256[] memory growth = new uint256[](1);
        growth[0] = 10_000; // max

        uint256[] memory quality = new uint256[](1);
        quality[0] = 10_000; // max

        uint256[] memory uptime = new uint256[](1);
        uptime[0] = 10_000; // max

        vm.prank(oracle);
        creatorScore.submitScores(0, creators, engagement, growth, quality, uptime);

        ICreatorScore.ScoreBreakdown memory score = creatorScore.getScore(creator1, 0);
        // (10000*4000 + 10000*2000 + 10000*2500 + 10000*1500) / 10000 = 10000
        assertEq(score.totalScore, 10_000, "Max score should be 10000");
    }

    /// @notice Test partial weights calculation
    function test_submitScores_partialWeights() public {
        address[] memory creators = new address[](1);
        creators[0] = creator1;

        uint256[] memory engagement = new uint256[](1);
        engagement[0] = 5000; // 50%

        uint256[] memory growth = new uint256[](1);
        growth[0] = 0; // 0%

        uint256[] memory quality = new uint256[](1);
        quality[0] = 10_000; // 100%

        uint256[] memory uptime = new uint256[](1);
        uptime[0] = 10_000; // 100%

        vm.prank(oracle);
        creatorScore.submitScores(0, creators, engagement, growth, quality, uptime);

        ICreatorScore.ScoreBreakdown memory score = creatorScore.getScore(creator1, 0);
        // (5000*4000 + 0*2000 + 10000*2500 + 10000*1500) / 10000
        // = (20000000 + 0 + 25000000 + 15000000) / 10000 = 6000
        assertEq(score.totalScore, 6000, "Partial weighted score should be 6000");
    }

    /// @notice Test epoch tracking with total scores
    function test_submitScores_epochTracking() public {
        address[] memory creators = new address[](2);
        creators[0] = creator1;
        creators[1] = creator2;

        uint256[] memory engagement = new uint256[](2);
        engagement[0] = 8000;
        engagement[1] = 6000;

        uint256[] memory growth = new uint256[](2);
        growth[0] = 7000;
        growth[1] = 5000;

        uint256[] memory quality = new uint256[](2);
        quality[0] = 9000;
        quality[1] = 7000;

        uint256[] memory uptime = new uint256[](2);
        uptime[0] = 9500;
        uptime[1] = 8000;

        vm.prank(oracle);
        creatorScore.submitScores(0, creators, engagement, growth, quality, uptime);

        uint256 totalScore = creatorScore.getTotalScore(0);
        assertTrue(totalScore > 0, "Total score should be positive");

        ICreatorScore.ScoreBreakdown memory s1 = creatorScore.getScore(creator1, 0);
        ICreatorScore.ScoreBreakdown memory s2 = creatorScore.getScore(creator2, 0);
        assertEq(s1.totalScore + s2.totalScore, totalScore, "Individual scores should sum to total");
    }

    /// @notice Test unauthorized oracle reverts
    function test_submitScores_unauthorizedOracle() public {
        address[] memory creators = new address[](1);
        creators[0] = creator1;

        uint256[] memory scores = new uint256[](1);
        scores[0] = 5000;

        vm.prank(unauthorized);
        vm.expectRevert(ICreatorScore.UnauthorizedOracle.selector);
        creatorScore.submitScores(0, creators, scores, scores, scores, scores);
    }

    /// @notice Test double submission for same epoch reverts
    function test_submitScores_alreadySubmitted() public {
        address[] memory creators = new address[](1);
        creators[0] = creator1;

        uint256[] memory scores = new uint256[](1);
        scores[0] = 5000;

        vm.prank(oracle);
        creatorScore.submitScores(0, creators, scores, scores, scores, scores);

        vm.prank(oracle);
        vm.expectRevert(ICreatorScore.ScoresAlreadySubmitted.selector);
        creatorScore.submitScores(0, creators, scores, scores, scores, scores);
    }

    /// @notice Test invalid score value (exceeds 10000) reverts
    function test_submitScores_invalidScoreValue() public {
        address[] memory creators = new address[](1);
        creators[0] = creator1;

        uint256[] memory validScores = new uint256[](1);
        validScores[0] = 5000;

        uint256[] memory invalidScores = new uint256[](1);
        invalidScores[0] = 10_001; // exceeds max

        vm.prank(oracle);
        vm.expectRevert(ICreatorScore.InvalidScoreValue.selector);
        creatorScore.submitScores(0, creators, invalidScores, validScores, validScores, validScores);
    }

    /// @notice Test array length mismatch reverts
    function test_submitScores_arrayMismatch() public {
        address[] memory creators = new address[](2);
        creators[0] = creator1;
        creators[1] = creator2;

        uint256[] memory scores = new uint256[](1);
        scores[0] = 5000;

        vm.prank(oracle);
        vm.expectRevert(ICreatorScore.ArrayLengthMismatch.selector);
        creatorScore.submitScores(0, creators, scores, scores, scores, scores);
    }

    /// @notice Test setOracle updates oracle address
    function test_setOracle() public {
        address newOracle = makeAddr("newOracle");
        creatorScore.setOracle(newOracle);
        assertEq(creatorScore.oracle(), newOracle, "Oracle should be updated");
    }
}
