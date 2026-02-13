// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IAgentRegistry } from "./interfaces/IAgentRegistry.sol";

/// @title AgentRegistry
/// @notice Registry contract that tracks all deployed AI agents and their metadata.
/// @dev Maintains a mapping from agent address to AgentInfo and enforces FID uniqueness.
///      Only the factory contract or the owner can register new agents.
contract AgentRegistry is IAgentRegistry, Ownable {
    /// @notice The AgentFactory contract address authorized to register agents
    address public factory;

    /// @notice Mapping of agent address to their registration info
    mapping(address => AgentInfo) private _agents;

    /// @notice Mapping of Farcaster FID to agent address for reverse lookups
    mapping(uint256 => address) private _fidToAgent;

    /// @notice Set of registered agent addresses for existence checks
    mapping(address => bool) private _registered;

    /// @param _factory The authorized factory contract address
    constructor(address _factory) Ownable(msg.sender) {
        factory = _factory;
    }

    /// @notice Modifier to restrict access to factory or owner
    modifier onlyFactoryOrOwner() {
        if (msg.sender != factory && msg.sender != owner()) revert UnauthorizedCaller();
        _;
    }

    /// @notice Modifier to restrict access to agent creator or owner
    /// @param agent The agent address to check creator authorization for
    modifier onlyCreatorOrOwner(address agent) {
        if (msg.sender != _agents[agent].creator && msg.sender != owner()) {
            revert UnauthorizedCaller();
        }
        _;
    }

    /// @notice Register a new agent in the registry
    /// @dev Can only be called by the factory contract or the owner.
    ///      Enforces that the agent is not already registered and the FID is unique.
    /// @param agent The agent's contract address
    /// @param fid The Farcaster ID assigned to the agent
    /// @param agentURI The metadata URI for the agent
    /// @param creator The wallet address of the agent's creator
    function registerAgent(address agent, uint256 fid, string calldata agentURI, address creator)
        external
        onlyFactoryOrOwner
    {
        if (_registered[agent]) revert AgentAlreadyRegistered();
        if (_fidToAgent[fid] != address(0)) revert FidAlreadyRegistered();

        _agents[agent] = AgentInfo({
            creator: creator,
            fid: fid,
            agentURI: agentURI,
            status: AgentStatus.Active,
            registeredAt: block.timestamp
        });

        _fidToAgent[fid] = agent;
        _registered[agent] = true;

        emit AgentRegistered(agent, creator, fid);
    }

    /// @notice Get the full registration info for an agent
    /// @param agent The agent's contract address
    /// @return The AgentInfo struct containing all registration data
    function getAgent(address agent) external view returns (AgentInfo memory) {
        if (!_registered[agent]) revert AgentNotFound();
        return _agents[agent];
    }

    /// @notice Look up an agent address by its Farcaster ID
    /// @param fid The Farcaster ID to look up
    /// @return The agent's contract address
    function getAgentByFid(uint256 fid) external view returns (address) {
        address agent = _fidToAgent[fid];
        if (agent == address(0)) revert AgentNotFound();
        return agent;
    }

    /// @notice Update the operational status of an agent
    /// @dev Only the agent's creator or the contract owner can update status.
    ///      Cannot set the same status as current.
    /// @param agent The agent's contract address
    /// @param newStatus The new status to set (Active, Paused, or Terminated)
    function updateAgentStatus(address agent, AgentStatus newStatus) external onlyCreatorOrOwner(agent) {
        if (!_registered[agent]) revert AgentNotFound();
        AgentStatus oldStatus = _agents[agent].status;
        if (oldStatus == newStatus) revert InvalidStatus();

        _agents[agent].status = newStatus;
        emit AgentStatusUpdated(agent, oldStatus, newStatus);
    }

    /// @notice Update the metadata URI of an agent
    /// @dev Only the agent's creator or the contract owner can update the URI.
    /// @param agent The agent's contract address
    /// @param newURI The new metadata URI
    function updateAgentURI(address agent, string calldata newURI) external onlyCreatorOrOwner(agent) {
        if (!_registered[agent]) revert AgentNotFound();
        _agents[agent].agentURI = newURI;
        emit AgentURIUpdated(agent, newURI);
    }

    /// @notice Check if an agent is registered in the registry
    /// @param agent The agent's contract address
    /// @return True if the agent is registered, false otherwise
    function isRegistered(address agent) external view returns (bool) {
        return _registered[agent];
    }

    /// @notice Update the factory address (owner only)
    /// @param newFactory The new factory contract address
    function setFactory(address newFactory) external onlyOwner {
        factory = newFactory;
    }
}
