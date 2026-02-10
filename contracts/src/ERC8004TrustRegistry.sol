// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC8004TrustRegistry } from "./interfaces/IERC8004TrustRegistry.sol";

/// @title ERC8004TrustRegistry
/// @notice ERC-8004 compliant identity and reputation registry for autonomous AI agents.
/// @dev Extends ERC721 to mint soulbound-style identity NFTs for each agent. Tracks
///      reputation scores and skill validation records per token. Only authorized minters
///      (e.g., AgentFactory) can mint new identities.
contract ERC8004TrustRegistry is IERC8004TrustRegistry, ERC721, Ownable {
    /// @notice Auto-incrementing token ID counter
    uint256 private _nextTokenId;

    /// @notice Mapping of token ID to agent identity data
    mapping(uint256 => AgentIdentity) private _identities;

    /// @notice Mapping of token ID to array of validation records
    mapping(uint256 => Validation[]) private _validations;

    /// @notice Mapping of agent address to their token ID
    mapping(address => uint256) private _agentToToken;

    /// @notice Mapping of agent address to whether they have an identity
    mapping(address => bool) private _hasIdentity;

    /// @notice Set of addresses authorized to mint new identities
    mapping(address => bool) public authorizedMinters;

    constructor() ERC721("OpenClaw Agent Identity", "OCAI") Ownable(msg.sender) {
        // Token IDs start at 1
        _nextTokenId = 1;
    }

    /// @notice Modifier to restrict minting to authorized addresses
    modifier onlyMinter() {
        if (!authorizedMinters[msg.sender] && msg.sender != owner()) revert UnauthorizedMinter();
        _;
    }

    /// @notice Mint an ERC-8004 identity NFT for a new agent
    /// @dev Only callable by authorized minters (e.g., AgentFactory). Each agent can
    ///      only have one identity. The NFT is minted to the agent's address.
    /// @param agent The agent's contract address to mint the identity for
    /// @param agentURI The metadata URI containing agent info (FID, endpoints, etc.)
    /// @return tokenId The ID of the minted NFT
    function mintIdentity(address agent, string calldata agentURI) external onlyMinter returns (uint256 tokenId) {
        if (_hasIdentity[agent]) revert IdentityAlreadyExists();

        tokenId = _nextTokenId;
        _nextTokenId++;

        _mint(agent, tokenId);

        _identities[tokenId] = AgentIdentity({
            agentAddress: agent,
            agentURI: agentURI,
            reputationScore: 0,
            registeredAt: block.timestamp
        });

        _agentToToken[agent] = tokenId;
        _hasIdentity[agent] = true;

        emit IdentityMinted(agent, tokenId, agentURI);
    }

    /// @notice Get the full identity data for a token
    /// @param tokenId The token ID to query
    /// @return The AgentIdentity struct with address, URI, reputation, and registration time
    function getIdentity(uint256 tokenId) external view returns (AgentIdentity memory) {
        if (tokenId == 0 || tokenId >= _nextTokenId) revert InvalidTokenId();
        return _identities[tokenId];
    }

    /// @notice Update the reputation score for an agent identity
    /// @dev Only callable by authorized minters or the owner. Used at epoch boundaries
    ///      to update reputation based on creator score calculations.
    /// @param tokenId The token ID to update
    /// @param score The new reputation score
    function updateReputation(uint256 tokenId, uint256 score) external onlyMinter {
        if (tokenId == 0 || tokenId >= _nextTokenId) revert InvalidTokenId();
        uint256 oldScore = _identities[tokenId].reputationScore;
        _identities[tokenId].reputationScore = score;
        emit ReputationUpdated(tokenId, oldScore, score);
    }

    /// @notice Add a skill validation record for an agent
    /// @dev Records whether an agent passed or failed a specific skill validation.
    ///      Used by the Validation Registry for premium skill output quality attestation.
    /// @param tokenId The token ID to add the validation to
    /// @param skillId The identifier of the skill being validated
    /// @param passed Whether the agent passed the validation
    function addValidation(uint256 tokenId, string calldata skillId, bool passed) external onlyMinter {
        if (tokenId == 0 || tokenId >= _nextTokenId) revert InvalidTokenId();

        _validations[tokenId].push(
            Validation({ skillId: skillId, passed: passed, validatedAt: block.timestamp })
        );

        emit ValidationAdded(tokenId, skillId, passed);
    }

    /// @notice Get all validation records for a token
    /// @param tokenId The token ID to query
    /// @return An array of Validation structs
    function getValidations(uint256 tokenId) external view returns (Validation[] memory) {
        if (tokenId == 0 || tokenId >= _nextTokenId) revert InvalidTokenId();
        return _validations[tokenId];
    }

    /// @notice Look up a token ID by agent address
    /// @param agent The agent's contract address
    /// @return The token ID associated with the agent
    function getTokenByAgent(address agent) external view returns (uint256) {
        if (!_hasIdentity[agent]) revert IdentityNotFound();
        return _agentToToken[agent];
    }

    /// @notice Authorize a new minter address (owner only)
    /// @param minter The address to authorize
    function setAuthorizedMinter(address minter, bool authorized) external onlyOwner {
        authorizedMinters[minter] = authorized;
    }
}
