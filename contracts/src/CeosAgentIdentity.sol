// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ICeosAgentIdentity } from "./interfaces/ICeosAgentIdentity.sol";

/// @title CeosAgentIdentity
/// @notice ERC-721 identity NFT for ceos.run autonomous AI agents.
/// @dev Implements the ERC-8004 concept: each minted token represents a sovereign
///      AI agent with on-chain reputation tracking. Token ID auto-increments starting
///      at 1.  Only the contract owner (AgentFactory) or explicitly authorized
///      operators can mint new agent identities and record trade outcomes.
///
///      Reputation is a lightweight, on-chain proxy for agent quality:
///        - totalTrades: raw activity volume
///        - successfulTrades: trades marked successful by the operator
///        - successRate: (successfulTrades * 10_000) / totalTrades (basis points)
///
///      Access control:
///        - mintAgent: owner OR authorized operator
///        - recordTrade: owner OR authorized operator
///        - setAuthorizedOperator: owner only
///
///      // TODO: PHASE 2 — wire this contract to ERC8004TrustRegistry.anchorDecisionHash()
///      //                 so that Glass Box decision log hashes are anchored per tokenId.
contract CeosAgentIdentity is ICeosAgentIdentity, ERC721, Ownable {
    // ── State ──────────────────────────────────────────────

    /// @notice Auto-incrementing counter for token IDs (starts at 1)
    uint256 private _nextTokenId;

    /// @notice Per-agent profile data, keyed by token ID
    mapping(uint256 => AgentProfile) public agentProfiles;

    /// @notice Addresses authorized to mint and record trades (e.g., AgentFactory, operator)
    mapping(address => bool) public authorizedOperators;

    // ── Constructor ────────────────────────────────────────

    /// @notice Deploy CeosAgentIdentity, setting the deployer as the initial owner
    constructor() ERC721("ceos.run Agent Identity", "CEOS-AI") Ownable(msg.sender) {
        _nextTokenId = 1;
    }

    // ── Modifiers ──────────────────────────────────────────

    /// @dev Restricts calls to the owner or an authorized operator
    modifier onlyAuthorized() {
        if (msg.sender != owner() && !authorizedOperators[msg.sender]) {
            revert UnauthorizedCaller();
        }
        _;
    }

    // ── Minting ────────────────────────────────────────────

    /// @notice Mint a new agent identity NFT and initialize its on-chain profile.
    /// @dev Only callable by the contract owner or an authorized operator (e.g., AgentFactory).
    ///      The recipient address `to` becomes the NFT owner and its profile creator.
    ///      Token IDs are strictly sequential starting at 1.
    /// @param to The address to receive the newly minted agent identity NFT
    /// @return tokenId The ID of the newly minted agent NFT
    function mintAgent(address to) external onlyAuthorized returns (uint256 tokenId) {
        tokenId = _nextTokenId;
        _nextTokenId++;

        _mint(to, tokenId);

        agentProfiles[tokenId] = AgentProfile({
            totalTrades: 0,
            successfulTrades: 0,
            creator: to,
            createdAt: block.timestamp
        });

        emit AgentMinted(to, tokenId);
    }

    // ── Reputation ─────────────────────────────────────────

    /// @notice Record a trade outcome for an agent, updating its reputation metrics.
    /// @dev Only callable by the contract owner or an authorized operator.
    ///      Reverts if the agentId does not exist.  Uses CEI pattern: checks first,
    ///      then effects (storage writes).
    /// @param agentId The token ID of the agent to update
    /// @param success True if the trade was successful; false if it failed
    function recordTrade(uint256 agentId, bool success) external onlyAuthorized {
        if (!_exists(agentId)) revert AgentNotFound(agentId);

        // Effects
        agentProfiles[agentId].totalTrades++;
        if (success) {
            agentProfiles[agentId].successfulTrades++;
        }

        emit TradeRecorded(agentId, success, agentProfiles[agentId].totalTrades);
    }

    /// @notice Retrieve reputation metrics for an agent.
    /// @dev successRate is expressed in basis points (0-10_000) where 10_000 = 100%.
    ///      Returns 0 for all fields if no trades have been recorded yet.
    ///      Reverts if agentId does not exist.
    /// @param agentId The token ID to query
    /// @return totalTrades Cumulative number of trades recorded
    /// @return successfulTrades Number of trades marked as successful
    /// @return successRate Percentage of successful trades in basis points (0-10_000)
    function getReputation(uint256 agentId)
        external
        view
        returns (uint256 totalTrades, uint256 successfulTrades, uint256 successRate)
    {
        if (!_exists(agentId)) revert AgentNotFound(agentId);

        AgentProfile storage profile = agentProfiles[agentId];
        totalTrades = profile.totalTrades;
        successfulTrades = profile.successfulTrades;

        // Avoid division by zero when no trades have been recorded
        if (totalTrades > 0) {
            successRate = (successfulTrades * 10_000) / totalTrades;
        }
    }

    // ── View Helpers ───────────────────────────────────────

    /// @notice Check whether a given token ID has been minted.
    /// @param agentId The token ID to query
    /// @return True if the token exists, false otherwise
    function agentExists(uint256 agentId) external view returns (bool) {
        return _exists(agentId);
    }

    /// @notice Return the total number of agent identities minted so far.
    /// @return The count of minted tokens (highest tokenId == totalMinted)
    function totalMinted() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    // ── Access Control ─────────────────────────────────────

    /// @notice Grant or revoke operator authorization for minting and trade recording.
    /// @dev Only the contract owner can call this. Intended to authorize the AgentFactory
    ///      or a backend worker that records off-chain trade outcomes on-chain.
    /// @param operator The address to authorize or deauthorize
    /// @param authorized True to grant access; false to revoke
    function setAuthorizedOperator(address operator, bool authorized) external onlyOwner {
        authorizedOperators[operator] = authorized;
    }

    // ── Internal Helpers ───────────────────────────────────

    /// @dev Internal helper that returns true if `tokenId` has been minted.
    ///      OZ ERC-721 v5 removed the public `_exists` — we reconstruct it via
    ///      the owner lookup: a minted token always has a non-zero owner address.
    function _exists(uint256 tokenId) internal view returns (bool) {
        return tokenId > 0 && tokenId < _nextTokenId;
    }
}
