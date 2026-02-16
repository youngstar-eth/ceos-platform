// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockWETH
/// @notice Mock WETH9 contract for testing ETH ↔ WETH wrapping
/// @dev Mimics the WETH9 interface: deposit() wraps ETH, withdraw() unwraps WETH.
///      Deployed at the canonical WETH9 address (0x4200...0006) via vm.etch() in tests.
contract MockWETH is ERC20 {
    constructor() ERC20("Wrapped Ether", "WETH") {}

    /// @notice Wrap ETH → WETH (1:1 mint)
    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }

    /// @notice Mint WETH directly (for MockSwapRouter compatibility in tests)
    /// @dev MockSwapRouter calls mint() on tokenOut — needed when WETH is the output token
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Unwrap WETH → ETH (1:1 burn + transfer)
    function withdraw(uint256 wad) external {
        _burn(msg.sender, wad);
        (bool sent,) = msg.sender.call{ value: wad }("");
        require(sent, "ETH transfer failed");
    }

    /// @notice Accept raw ETH (fallback deposit)
    receive() external payable {
        _mint(msg.sender, msg.value);
    }
}
