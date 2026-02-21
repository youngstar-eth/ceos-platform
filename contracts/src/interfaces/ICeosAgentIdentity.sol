// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title ICeosAgentIdentity
/// @notice Interface for the CeosAgentIdentity ERC-721 contract.
/// @dev Each minted token represents a unique autonomous AI agent deployed on ceos.run.
///      Tracks on-chain reputation metrics (trade history) per token ID.
interface ICeosAgentIdentity {
    // ── Structs ────────────────────────────────────────────

    /// @notice On-chain profile data stored per agent token
    /// @param totalTrades Cumulative number of trade/service events recorded
    /// @param successfulTrades Number of trades marked as successful
    /// @param creator The wallet address that minted this agent identity
    /// @param createdAt Block timestamp at mint time
    struct AgentProfile {
        uint256 totalTrades;
        uint256 successfulTrades;
        address creator;
        uint256 createdAt;
    }

    // ── Events ─────────────────────────────────────────────

    /// @notice Emitted when a new agent identity NFT is minted
    /// @param to The address receiving the NFT (and marked as creator)
    /// @param tokenId The auto-incremented token ID assigned to the agent
    event AgentMinted(address indexed to, uint256 indexed tokenId);

    /// @notice Emitted when a trade is recorded for an agent
    /// @param agentId The token ID of the agent
    /// @param success Whether the trade was successful
    /// @param totalTrades New cumulative trade count after recording
    event TradeRecorded(uint256 indexed agentId, bool success, uint256 totalTrades);

    // ── Errors ─────────────────────────────────────────────

    /// @notice Thrown when querying a token ID that does not exist
    error AgentNotFound(uint256 agentId);

    /// @notice Thrown when an unauthorized address attempts a restricted operation
    error UnauthorizedCaller();

    // ── Functions ──────────────────────────────────────────

    /// @notice Mint a new agent identity NFT
    /// @param to The address to mint the NFT to (becomes the creator)
    /// @return tokenId The token ID of the newly minted NFT
    function mintAgent(address to) external returns (uint256 tokenId);

    /// @notice Record a trade outcome for an agent
    /// @param agentId The token ID of the agent
    /// @param success Whether the trade was successful
    function recordTrade(uint256 agentId, bool success) external;

    /// @notice Get the reputation metrics for an agent
    /// @param agentId The token ID to query
    /// @return totalTrades Cumulative number of trades recorded
    /// @return successfulTrades Number of successful trades
    /// @return successRate Percentage of successful trades (0-100, scaled to 10000 bps)
    function getReputation(uint256 agentId)
        external
        view
        returns (uint256 totalTrades, uint256 successfulTrades, uint256 successRate);

    /// @notice Check whether a token ID has been minted
    /// @param agentId The token ID to query
    /// @return True if the token exists
    function agentExists(uint256 agentId) external view returns (bool);
}
