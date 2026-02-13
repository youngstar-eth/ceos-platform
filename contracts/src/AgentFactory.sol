// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { IAgentFactory } from "./interfaces/IAgentFactory.sol";
import { IAgentRegistry } from "./interfaces/IAgentRegistry.sol";
import { IERC8004TrustRegistry } from "./interfaces/IERC8004TrustRegistry.sol";

/// @title AgentFactory
/// @notice Factory contract for deploying autonomous AI agents on Base blockchain.
/// @dev Uses EIP-1167 Clones for gas-efficient agent deployment. Charges 0.005 ETH deploy fee,
///      split 50/50 between RevenuePool and treasury. Auto-registers agents in AgentRegistry
///      and mints ERC-8004 identity NFTs.
contract AgentFactory is IAgentFactory, Ownable, ReentrancyGuard {
    using Clones for address;

    /// @notice Default deploy fee in wei (0.005 ETH)
    uint256 public constant DEFAULT_DEPLOY_FEE = 0.005 ether;

    /// @notice Maximum number of agents a single creator can deploy
    uint256 public constant MAX_AGENTS_PER_CREATOR = 10;

    /// @notice The implementation contract address used for EIP-1167 clones
    address public immutable implementation;

    /// @notice The AgentRegistry contract reference
    IAgentRegistry public agentRegistry;

    /// @notice The ERC-8004 TrustRegistry contract reference
    IERC8004TrustRegistry public trustRegistry;

    /// @notice The address of the revenue pool receiving 50% of deploy fees
    address public revenuePool;

    /// @notice The address of the treasury receiving 50% of deploy fees
    address public treasury;

    /// @notice Current deploy fee (can be updated by owner)
    uint256 private _deployFee;

    /// @notice Running counter for generating unique FIDs
    uint256 private _fidCounter;

    /// @notice Mapping of creator address to their deployed agent addresses
    mapping(address => address[]) private _creatorAgents;

    /// @param _implementation The implementation address for EIP-1167 clones
    /// @param _agentRegistry The AgentRegistry contract address
    /// @param _trustRegistry The ERC-8004 TrustRegistry contract address
    /// @param _revenuePool The RevenuePool contract address
    /// @param _treasury The treasury wallet address
    constructor(
        address _implementation,
        address _agentRegistry,
        address _trustRegistry,
        address _revenuePool,
        address _treasury
    ) Ownable(msg.sender) {
        if (_implementation == address(0)) revert ZeroAddress();
        if (_agentRegistry == address(0)) revert ZeroAddress();
        if (_trustRegistry == address(0)) revert ZeroAddress();
        if (_revenuePool == address(0)) revert ZeroAddress();
        if (_treasury == address(0)) revert ZeroAddress();

        implementation = _implementation;
        agentRegistry = IAgentRegistry(_agentRegistry);
        trustRegistry = IERC8004TrustRegistry(_trustRegistry);
        revenuePool = _revenuePool;
        treasury = _treasury;
        _deployFee = DEFAULT_DEPLOY_FEE;
    }

    /// @notice Deploy a new autonomous AI agent
    /// @dev Creates an EIP-1167 clone, mints ERC-8004 identity, registers in AgentRegistry,
    ///      and splits the deploy fee 50/50 between RevenuePool and treasury.
    /// @param name The human-readable name of the agent
    /// @param symbol The token symbol for the agent (unused in clone but stored for metadata)
    /// @param agentURI The URI containing agent metadata (Farcaster FID, x402 endpoint, A2A endpoint)
    /// @return agent The address of the newly deployed agent clone
    function deployAgent(string calldata name, string calldata symbol, string calldata agentURI)
        external
        payable
        nonReentrant
        returns (address agent)
    {
        if (msg.value < _deployFee) revert InsufficientDeployFee();
        if (_creatorAgents[msg.sender].length >= MAX_AGENTS_PER_CREATOR) revert MaxAgentsReached();

        // Create deterministic clone using sender + agent count as salt
        agent = implementation.cloneDeterministic(
            keccak256(abi.encodePacked(msg.sender, _creatorAgents[msg.sender].length))
        );

        // Increment FID counter and assign
        _fidCounter++;

        // Mint ERC-8004 identity NFT and register agent
        uint256 tokenId = trustRegistry.mintIdentity(agent, agentURI);
        agentRegistry.registerAgent(agent, _fidCounter, agentURI, msg.sender);

        // Track creator's agents
        _creatorAgents[msg.sender].push(agent);

        // Split fee 50/50 between revenue pool and treasury
        _splitFee(msg.value);

        emit AgentDeployed(msg.sender, agent, tokenId, name);

        // Suppress unused variable warning
        symbol;
    }

    /// @notice Internal function to split deploy fee 50/50 between revenue pool and treasury
    /// @param amount The total fee amount to split
    function _splitFee(uint256 amount) private {
        uint256 halfFee = amount / 2;
        (bool sentToPool,) = revenuePool.call{ value: halfFee }("");
        if (!sentToPool) revert ZeroAddress();

        (bool sentToTreasury,) = treasury.call{ value: amount - halfFee }("");
        if (!sentToTreasury) revert ZeroAddress();
    }

    /// @notice Get all agents deployed by a specific creator
    /// @param creator The creator's wallet address
    /// @return An array of agent contract addresses deployed by the creator
    function getAgentsByCreator(address creator) external view returns (address[] memory) {
        return _creatorAgents[creator];
    }

    /// @notice Get the current deploy fee
    /// @return The deploy fee in wei
    function getDeployFee() external view returns (uint256) {
        return _deployFee;
    }

    /// @notice Get the number of agents deployed by a specific creator
    /// @param creator The creator's wallet address
    /// @return The count of agents deployed by the creator
    function getAgentCount(address creator) external view returns (uint256) {
        return _creatorAgents[creator].length;
    }

    /// @notice Update the deploy fee (owner only)
    /// @param newFee The new deploy fee in wei
    function setDeployFee(uint256 newFee) external onlyOwner {
        uint256 oldFee = _deployFee;
        _deployFee = newFee;
        emit DeployFeeUpdated(oldFee, newFee);
    }

    /// @notice Update the treasury address (owner only)
    /// @param newTreasury The new treasury wallet address
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        address oldTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }
}
