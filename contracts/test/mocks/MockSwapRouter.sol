// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ISwapRouter } from "../../src/interfaces/ISwapRouter.sol";

/// @title IMintable
/// @notice Minimal interface for tokens that expose a mint function.
/// @dev Works with both MockERC20 (unrestricted mint) and RunToken (MINTER_ROLE gated).
///      The caller must have appropriate permissions on the target token.
interface IMintable {
    function mint(address to, uint256 amount) external;
}

/// @title MockSwapRouter
/// @notice Simulates Uniswap V3 SwapRouter02 exactInputSingle for testing.
/// @dev Deployed at the canonical SwapRouter02 address (0x2626664c...) via vm.etch().
///
///      Swap simulation:
///        - Transfers `amountIn` of tokenIn from msg.sender (simulates pool taking input)
///        - Mints `amountIn * exchangeRate` of tokenOut to the recipient (simulates pool output)
///        - Uses a configurable exchange rate (default 2x) for predictable assertions
///
///      For RunToken as tokenOut: grant MINTER_ROLE to this mock in test setUp().
///      For MockERC20 as tokenOut: mint is unrestricted, no setup needed.
contract MockSwapRouter is ISwapRouter {
    /// @notice Exchange rate multiplier (amountOut = amountIn * exchangeRate)
    /// @dev Default 2 means 1 WETH -> 2 output tokens. Adjustable for edge cases.
    uint256 public exchangeRate = 2;

    /// @notice Total number of swaps executed (for test assertions)
    uint256 public swapCount;

    /// @notice Last swap parameters (for test assertions)
    address public lastTokenIn;
    address public lastTokenOut;
    uint256 public lastAmountIn;
    address public lastRecipient;

    /// @notice Simulate a Uniswap V3 single-hop swap
    /// @dev Pulls tokenIn from caller, mints tokenOut to recipient at configured rate.
    ///      Reverts if amountOut < amountOutMinimum (mimics real slippage protection).
    /// @param params The swap parameters (matching ISwapRouter interface)
    /// @return amountOut The amount of tokenOut minted to the recipient
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut) {
        // Record swap for test assertions
        lastTokenIn = params.tokenIn;
        lastTokenOut = params.tokenOut;
        lastAmountIn = params.amountIn;
        lastRecipient = params.recipient;
        swapCount += 1;

        // Pull input tokens from caller (simulates pool taking input)
        IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);

        // Calculate output using exchange rate
        amountOut = params.amountIn * exchangeRate;

        // Enforce slippage protection (same as real SwapRouter)
        require(amountOut >= params.amountOutMinimum, "Too little received");

        // Mint output tokens to recipient (simulates pool giving output)
        // Works with both MockERC20 and RunToken (if MINTER_ROLE granted)
        IMintable(params.tokenOut).mint(params.recipient, amountOut);

        return amountOut;
    }

    /// @notice Set exchange rate for testing different swap outcomes
    /// @param newRate The new exchange rate multiplier
    function setExchangeRate(uint256 newRate) external {
        exchangeRate = newRate;
    }

    /// @notice Accept ETH (for payable exactInputSingle calls)
    receive() external payable {}
}
