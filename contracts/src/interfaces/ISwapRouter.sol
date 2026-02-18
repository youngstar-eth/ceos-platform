// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title ISwapRouter
/// @notice Minimal Uniswap V3 SwapRouter interface for single-hop exact-input swaps.
/// @dev Only includes `exactInputSingle` — the one function FeeSplitter needs for
///      ETH -> $RUN buyback-and-burn. Using a minimal interface avoids pulling the
///      full Uniswap dependency tree into the project.
interface ISwapRouter {
    /// @notice Parameters for a single-hop exact-input swap
    /// @param tokenIn The input token address (WETH for ETH swaps)
    /// @param tokenOut The output token address ($RUN)
    /// @param fee The Uniswap V3 pool fee tier (e.g., 3000 = 0.30%, 10000 = 1%)
    /// @param recipient The address receiving the output tokens
    /// @param deadline Unix timestamp after which the swap reverts
    /// @param amountIn The exact amount of input tokens to swap
    /// @param amountOutMinimum The minimum output tokens to receive (slippage protection)
    /// @param sqrtPriceLimitX96 Price limit for the swap (0 = no limit)
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    /// @notice Execute a single-hop exact-input swap
    /// @param params The swap parameters
    /// @return amountOut The amount of output tokens received
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}
