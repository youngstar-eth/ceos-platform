// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice Test-only ERC-20 token that mimics USDC with 6-decimal precision.
/// @dev Public mint function is unrestricted — only for use in test environments.
///      Name: "Mock USDC", Symbol: "mUSDC", Decimals: 6 (matching real USDC on Base).
///
///      Do NOT deploy to mainnet or Sepolia as a live token — for forge tests only.
contract MockUSDC is ERC20 {
    /// @notice Deploy MockUSDC with fixed name, symbol, and 6-decimal precision
    constructor() ERC20("Mock USDC", "mUSDC") { }

    /// @notice Mint an arbitrary amount of mUSDC to any address (unrestricted for testing)
    /// @param to The address to receive the minted tokens
    /// @param amount The amount to mint (in micro-USDC, 6 decimals)
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Override decimals to return 6, matching real USDC on Base
    /// @return 6
    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
