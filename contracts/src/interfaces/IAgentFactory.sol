// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IAgentFactory {
    event AgentDeployed(address indexed creator, address indexed agent, uint256 tokenId, string name);
    event DeployFeeUpdated(uint256 oldFee, uint256 newFee);
    event TreasuryUpdated(address oldTreasury, address newTreasury);

    error InsufficientDeployFee();
    error MaxAgentsReached();
    error ZeroAddress();

    function deployAgent(string calldata name, string calldata symbol, string calldata agentURI)
        external
        payable
        returns (address);
    function getAgentsByCreator(address creator) external view returns (address[] memory);
    function getDeployFee() external view returns (uint256);
    function getAgentCount(address creator) external view returns (uint256);
}
