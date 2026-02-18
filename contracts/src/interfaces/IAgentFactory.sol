// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IAgentFactory
/// @notice Interface for the Virtuals Protocol-integrated agent factory.
/// @dev Deploys agents via Virtuals Factory, mints ERC-8004 identity NFTs,
///      and forwards deploy fees to the FeeSplitter.
interface IAgentFactory {
    // ── Events ─────────────────────────────────────────────

    /// @notice Emitted when a new agent is deployed via Virtuals Protocol
    /// @param creator The wallet address that deployed the agent
    /// @param agent The agent address (Virtuals token address)
    /// @param tokenId The ERC-8004 identity NFT token ID
    /// @param name The human-readable agent name
    /// @param virtualsToken The Virtuals ERC-20 token address (indexed for frontend tracking)
    event AgentDeployed(
        address indexed creator,
        address indexed agent,
        uint256 tokenId,
        string name,
        address indexed virtualsToken
    );

    /// @notice Emitted when the deploy fee is updated
    /// @param oldFee The previous deploy fee
    /// @param newFee The new deploy fee
    event DeployFeeUpdated(uint256 oldFee, uint256 newFee);

    /// @notice Emitted when the FeeSplitter address is updated
    /// @param oldSplitter The previous FeeSplitter address
    /// @param newSplitter The new FeeSplitter address
    event FeeSplitterUpdated(address oldSplitter, address newSplitter);

    /// @notice Emitted when the Virtuals Factory address is updated
    /// @param oldFactory The previous factory address
    /// @param newFactory The new factory address
    event VirtualsFactoryUpdated(address oldFactory, address newFactory);

    // ── Errors ─────────────────────────────────────────────

    /// @notice Thrown when msg.value is less than the required deploy fee
    error InsufficientDeployFee();

    /// @notice Thrown when a creator has reached the maximum agent limit
    error MaxAgentsReached();

    /// @notice Thrown when a zero address is provided where not allowed
    error ZeroAddress();

    /// @notice Thrown when the Virtuals Factory returns address(0)
    error VirtualsDeployFailed();

    /// @notice Thrown when forwarding the deploy fee to FeeSplitter fails
    error FeeForwardFailed();

    // ── Functions ──────────────────────────────────────────

    /// @notice Deploy a new AI agent via Virtuals Protocol
    /// @param name The agent name (used as token name)
    /// @param symbol The token ticker symbol
    /// @param agentURI Metadata URI for the agent
    /// @return agent The Virtuals token address acting as agent identity
    function deployAgent(
        string calldata name,
        string calldata symbol,
        string calldata agentURI
    ) external payable returns (address agent);

    /// @notice Get the Virtuals token address for an agent
    /// @param agent The agent address
    /// @return The Virtuals ERC-20 token address
    function getVirtualsToken(address agent) external view returns (address);

    /// @notice Get all agents deployed by a specific creator
    /// @param creator The creator's wallet address
    /// @return An array of agent addresses
    function getAgentsByCreator(address creator) external view returns (address[] memory);

    /// @notice Get the current deploy fee
    /// @return The deploy fee in wei
    function getDeployFee() external view returns (uint256);

    /// @notice Get the number of agents deployed by a creator
    /// @param creator The creator's wallet address
    /// @return The agent count
    function getAgentCount(address creator) external view returns (uint256);
}
