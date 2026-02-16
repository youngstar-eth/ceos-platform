// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MockERC20 } from "./MockERC20.sol";

/// @title MockSwapRouter
/// @notice Simulates Uniswap V3 SwapRouter02 exactInputSingle for testing
/// @dev Deployed at the canonical SwapRouter02 address (0x2626664c...) via vm.etch().
///
///      Swap simulation:
///        - Transfers `amountIn` of tokenIn from msg.sender to itself (simulates pool taking input)
///        - Mints `amountIn * exchangeRate` of tokenOut to the recipient (simulates pool giving output)
///        - Uses a configurable exchange rate (default 2x) for predictable test assertions
///
///      This mock only supports MockERC20 tokens as tokenOut since it needs to mint.
///      For tokenIn, it uses standard transferFrom (works with any ERC20).
contract MockSwapRouter {
    /// @notice Exchange rate multiplier (amountOut = amountIn * exchangeRate)
    /// @dev Default 2 means 1 WETH → 2 agentTokens. Adjustable for testing edge cases.
    uint256 public exchangeRate = 2;

    /// @notice Total number of swaps executed (for test assertions)
    uint256 public swapCount;

    /// @notice Last swap parameters (for test assertions)
    address public lastTokenIn;
    address public lastTokenOut;
    uint256 public lastAmountIn;
    address public lastRecipient;

    /// @notice Uniswap V3 ExactInputSingleParams struct (must match SwapRouter02 ABI)
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    /// @notice Simulate a Uniswap V3 single-hop swap
    /// @dev Pulls tokenIn from caller, mints tokenOut to recipient at the configured exchange rate.
    ///      Reverts if amountOut < amountOutMinimum (mimics real slippage protection).
    /// @param params The swap parameters (matching SwapRouter02 interface)
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
        MockERC20(params.tokenOut).mint(params.recipient, amountOut);

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
