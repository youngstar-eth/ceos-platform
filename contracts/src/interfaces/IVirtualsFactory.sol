// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IVirtualsFactory
/// @notice Interface for the Virtuals Protocol factory on Base L2.
/// @dev External protocol contract — ceos.run calls this to deploy agent tokens
///      with auto-created Uniswap V3 liquidity pools. We do not own or deploy
///      this contract; we only interact with it.
interface IVirtualsFactory {
    /// @notice Deploy a new Virtuals agent token with an auto-seeded liquidity pool
    /// @param name The human-readable name of the agent token (e.g., "Alpha Agent")
    /// @param symbol The token ticker symbol (e.g., "ALPHA")
    /// @param metadataURI IPFS or HTTPS URI pointing to agent metadata JSON
    /// @return token The address of the newly deployed ERC-20 agent token
    function deployAgent(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI
    ) external returns (address token);
}
