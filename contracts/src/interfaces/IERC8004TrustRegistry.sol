// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC8004TrustRegistry {
    struct AgentIdentity {
        address agentAddress;
        string agentURI;
        uint256 reputationScore;
        uint256 registeredAt;
    }

    struct Validation {
        string skillId;
        bool passed;
        uint256 validatedAt;
    }

    event IdentityMinted(address indexed agent, uint256 indexed tokenId, string agentURI);
    event ReputationUpdated(uint256 indexed tokenId, uint256 oldScore, uint256 newScore);
    event ValidationAdded(uint256 indexed tokenId, string skillId, bool passed);

    error UnauthorizedMinter();
    error IdentityAlreadyExists();
    error IdentityNotFound();
    error InvalidTokenId();

    function mintIdentity(address agent, string calldata agentURI) external returns (uint256);
    function getIdentity(uint256 tokenId) external view returns (AgentIdentity memory);
    function updateReputation(uint256 tokenId, uint256 score) external;
    function addValidation(uint256 tokenId, string calldata skillId, bool passed) external;
    function getValidations(uint256 tokenId) external view returns (Validation[] memory);
    function getTokenByAgent(address agent) external view returns (uint256);
}
