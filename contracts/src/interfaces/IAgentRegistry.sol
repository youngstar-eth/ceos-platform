// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IAgentRegistry {
    enum AgentStatus {
        Active,
        Paused,
        Terminated
    }

    struct AgentInfo {
        address creator;
        uint256 fid;
        string agentURI;
        AgentStatus status;
        uint256 registeredAt;
    }

    event AgentRegistered(address indexed agent, address indexed creator, uint256 fid);
    event AgentStatusUpdated(address indexed agent, AgentStatus oldStatus, AgentStatus newStatus);
    event AgentURIUpdated(address indexed agent, string newURI);

    error AgentAlreadyRegistered();
    error AgentNotFound();
    error FidAlreadyRegistered();
    error UnauthorizedCaller();
    error InvalidStatus();

    function registerAgent(address agent, uint256 fid, string calldata agentURI, address creator) external;
    function getAgent(address agent) external view returns (AgentInfo memory);
    function getAgentByFid(uint256 fid) external view returns (address);
    function updateAgentStatus(address agent, AgentStatus newStatus) external;
    function updateAgentURI(address agent, string calldata newURI) external;
    function isRegistered(address agent) external view returns (bool);
}
