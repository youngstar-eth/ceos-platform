// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IAgentFactory } from "./interfaces/IAgentFactory.sol";
import { IAgentRegistry } from "./interfaces/IAgentRegistry.sol";
import { IERC8004TrustRegistry } from "./interfaces/IERC8004TrustRegistry.sol";
import { IVirtualsFactory } from "./interfaces/IVirtualsFactory.sol";

/// @title AgentFactory
/// @notice Orchestrator contract that deploys AI agents via Virtuals Protocol on Base L2.
/// @dev Replaces the previous EIP-1167 clone approach. Now delegates token creation to the
///      Virtuals Factory (which creates an ERC-20 + Uniswap V3 pool), then mints an ERC-8004
///      identity NFT and registers the agent. Deploy fee is forwarded to the FeeSplitter.
///
///      Flow: User pays 0.005 ETH -> Virtuals creates token+pool -> ERC-8004 NFT minted
///            -> Agent registered with token address -> Fee forwarded to FeeSplitter
contract AgentFactory is IAgentFactory, Ownable, ReentrancyGuard {
    /// @notice Default deploy fee in wei (0.005 ETH)
    uint256 public constant DEFAULT_DEPLOY_FEE = 0.005 ether;

    /// @notice Maximum number of agents a single creator can deploy
    uint256 public constant MAX_AGENTS_PER_CREATOR = 10;

    /// @notice The Virtuals Protocol factory contract on Base
    IVirtualsFactory public virtualsFactory;

    /// @notice The AgentRegistry contract reference
    IAgentRegistry public agentRegistry;

    /// @notice The ERC-8004 TrustRegistry contract reference
    IERC8004TrustRegistry public trustRegistry;

    /// @notice The FeeSplitter contract receiving deploy fees
    address public feeSplitter;

    /// @notice Current deploy fee (can be updated by owner)
    uint256 private _deployFee;

    /// @notice Running counter for generating unique FIDs
    uint256 private _fidCounter;

    /// @notice Mapping of creator address to their deployed agent addresses
    mapping(address => address[]) private _creatorAgents;

    /// @notice Mapping of agent address to its Virtuals ERC-20 token address
    mapping(address => address) private _agentToVirtualsToken;

    /// @param _virtualsFactory The Virtuals Protocol factory address on Base
    /// @param _agentRegistry The AgentRegistry contract address
    /// @param _trustRegistry The ERC-8004 TrustRegistry contract address
    /// @param _feeSplitter The FeeSplitter contract address
    constructor(
        address _virtualsFactory,
        address _agentRegistry,
        address _trustRegistry,
        address _feeSplitter
    ) Ownable(msg.sender) {
        if (_virtualsFactory == address(0)) revert ZeroAddress();
        if (_agentRegistry == address(0)) revert ZeroAddress();
        if (_trustRegistry == address(0)) revert ZeroAddress();
        if (_feeSplitter == address(0)) revert ZeroAddress();

        virtualsFactory = IVirtualsFactory(_virtualsFactory);
        agentRegistry = IAgentRegistry(_agentRegistry);
        trustRegistry = IERC8004TrustRegistry(_trustRegistry);
        feeSplitter = _feeSplitter;
        _deployFee = DEFAULT_DEPLOY_FEE;
    }

    /// @notice Deploy a new AI agent via Virtuals Protocol
    /// @dev Calls Virtuals Factory to create the token + liquidity pool, mints an ERC-8004
    ///      identity NFT, registers the agent in the registry, and forwards the deploy fee
    ///      to the FeeSplitter contract.
    /// @param name The human-readable name of the agent (used for token name)
    /// @param symbol The token ticker symbol (e.g., "ALPHA")
    /// @param agentURI Metadata URI containing Farcaster FID, x402 endpoint, A2A endpoint
    /// @return agent The address of the newly created Virtuals token (acts as agent identity)
    function deployAgent(
        string calldata name,
        string calldata symbol,
        string calldata agentURI
    ) external payable nonReentrant returns (address agent) {
        if (msg.value < _deployFee) revert InsufficientDeployFee();
        if (_creatorAgents[msg.sender].length >= MAX_AGENTS_PER_CREATOR) revert MaxAgentsReached();

        // Step 1: Deploy token + pool via Virtuals Protocol
        agent = virtualsFactory.deployAgent(name, symbol, agentURI);
        if (agent == address(0)) revert VirtualsDeployFailed();

        // Step 2: Mint ERC-8004 identity NFT
        uint256 tokenId = trustRegistry.mintIdentity(agent, agentURI);

        // Step 3: Register agent with Virtuals token address
        _fidCounter++;
        agentRegistry.registerAgent(agent, _fidCounter, agentURI, msg.sender);

        // Step 4: Track creator's agents and token mapping
        _creatorAgents[msg.sender].push(agent);
        _agentToVirtualsToken[agent] = agent;

        // Step 5: Forward entire deploy fee to FeeSplitter
        _forwardFee(msg.value);

        emit AgentDeployed(msg.sender, agent, tokenId, name, agent);
    }

    /// @notice Forward deploy fee to the FeeSplitter contract
    /// @param amount The fee amount to forward
    function _forwardFee(uint256 amount) private {
        (bool sent,) = feeSplitter.call{ value: amount }("");
        if (!sent) revert FeeForwardFailed();
    }

    // ── Views ──────────────────────────────────────────────

    /// @notice Get the Virtuals token address for an agent
    /// @param agent The agent address
    /// @return The Virtuals ERC-20 token address
    function getVirtualsToken(address agent) external view returns (address) {
        return _agentToVirtualsToken[agent];
    }

    /// @notice Get all agents deployed by a specific creator
    /// @param creator The creator's wallet address
    /// @return An array of agent addresses deployed by the creator
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

    // ── Admin ──────────────────────────────────────────────

    /// @notice Update the deploy fee (owner only)
    /// @param newFee The new deploy fee in wei
    function setDeployFee(uint256 newFee) external onlyOwner {
        uint256 oldFee = _deployFee;
        _deployFee = newFee;
        emit DeployFeeUpdated(oldFee, newFee);
    }

    /// @notice Update the FeeSplitter address (owner only)
    /// @param newFeeSplitter The new FeeSplitter contract address
    function setFeeSplitter(address newFeeSplitter) external onlyOwner {
        if (newFeeSplitter == address(0)) revert ZeroAddress();
        address oldSplitter = feeSplitter;
        feeSplitter = newFeeSplitter;
        emit FeeSplitterUpdated(oldSplitter, newFeeSplitter);
    }

    /// @notice Update the Virtuals Factory address (owner only)
    /// @param newFactory The new Virtuals Factory address
    function setVirtualsFactory(address newFactory) external onlyOwner {
        if (newFactory == address(0)) revert ZeroAddress();
        address oldFactory = address(virtualsFactory);
        virtualsFactory = IVirtualsFactory(newFactory);
        emit VirtualsFactoryUpdated(oldFactory, newFactory);
    }
}
