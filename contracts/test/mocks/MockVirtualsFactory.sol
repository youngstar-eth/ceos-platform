// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IVirtualsFactory } from "../../src/interfaces/IVirtualsFactory.sol";
import { MockERC20 } from "./MockERC20.sol";

/// @title MockVirtualsFactory
/// @notice Simulates the Virtuals Protocol factory for testing.
/// @dev Each call to `deployAgent` creates a fresh MockERC20 token and returns its address,
///      mimicking the real Virtuals Factory which deploys an ERC-20 + Uniswap V3 pool.
///      Tracks deployment history for test assertions.
contract MockVirtualsFactory is IVirtualsFactory {
    /// @notice Number of agents deployed through this mock
    uint256 public deployCount;

    /// @notice Last deployed token address (for quick test assertions)
    address public lastDeployedToken;

    /// @notice History of all deployed tokens
    address[] public deployedTokens;

    /// @notice Whether to simulate a deployment failure (returns address(0))
    bool public shouldFail;

    /// @notice Deploy a mock agent token
    /// @dev Creates a new MockERC20 each time, simulating the Virtuals token + pool creation.
    ///      The token gets 1M initial supply minted to itself (simulating pool seeding).
    /// @param name The token name
    /// @param symbol The token symbol
    /// @return token The address of the newly deployed mock token
    function deployAgent(
        string calldata name,
        string calldata symbol,
        string calldata /* metadataURI */
    ) external returns (address token) {
        if (shouldFail) return address(0);

        MockERC20 newToken = new MockERC20(name, symbol, 18);

        token = address(newToken);
        lastDeployedToken = token;
        deployedTokens.push(token);
        deployCount++;
    }

    /// @notice Configure the mock to simulate deployment failures
    /// @param _shouldFail Whether deployAgent should return address(0)
    function setShouldFail(bool _shouldFail) external {
        shouldFail = _shouldFail;
    }

    /// @notice Get all deployed token addresses
    /// @return Array of deployed token addresses
    function getDeployedTokens() external view returns (address[] memory) {
        return deployedTokens;
    }
}
