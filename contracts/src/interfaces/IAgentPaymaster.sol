// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IAgentPaymaster
/// @notice Interface for the AgentPaymaster contract — the x402 compute cost treasury.
/// @dev Accepts USDC deposits keyed by agentId, deducts compute costs with a 2%
///      protocol fee routed to the feeRecipient, and allows agent owners to withdraw
///      remaining funds.  All amounts are in micro-USDC (6 decimals).
interface IAgentPaymaster {
    // ── Events ─────────────────────────────────────────────

    /// @notice Emitted when USDC is deposited to fund an agent's compute balance
    /// @param agentId The target agent token ID
    /// @param depositor The address that sent the funds
    /// @param amount The amount of USDC deposited (micro-USDC)
    event FundsDeposited(uint256 indexed agentId, address indexed depositor, uint256 amount);

    /// @notice Emitted when compute costs are deducted from an agent's balance
    /// @param agentId The agent token ID charged
    /// @param grossAmount The total amount deducted from the agent's balance
    /// @param protocolFee The fee routed to feeRecipient (2% of grossAmount)
    /// @param netAmount The net amount after protocol fee
    event ComputePaid(uint256 indexed agentId, uint256 grossAmount, uint256 protocolFee, uint256 netAmount);

    /// @notice Emitted when an agent owner withdraws remaining funds
    /// @param agentId The agent token ID
    /// @param owner The agent NFT owner address receiving the funds
    /// @param amount The amount of USDC withdrawn (micro-USDC)
    event FundsWithdrawn(uint256 indexed agentId, address indexed owner, uint256 amount);

    /// @notice Emitted when the protocol fee rate is updated
    /// @param oldRate The previous rate in basis points
    /// @param newRate The new rate in basis points
    event FeeRateUpdated(uint256 oldRate, uint256 newRate);

    /// @notice Emitted when the fee recipient address is updated
    /// @param oldRecipient The previous fee recipient
    /// @param newRecipient The new fee recipient
    event FeeRecipientUpdated(address oldRecipient, address newRecipient);

    // ── Errors ─────────────────────────────────────────────

    /// @notice Thrown when attempting to deposit for a non-existent agent
    error AgentNotFound(uint256 agentId);

    /// @notice Thrown when the agent balance is insufficient for the requested operation
    error InsufficientAgentBalance(uint256 agentId, uint256 available, uint256 required);

    /// @notice Thrown when an unauthorized address attempts a restricted operation
    error UnauthorizedCaller();

    /// @notice Thrown when a zero-value amount is provided where non-zero is required
    error ZeroAmount();

    /// @notice Thrown when a zero address is provided where one is not allowed
    error ZeroAddress();

    /// @notice Thrown when the USDC transfer fails
    error TransferFailed();

    // ── Functions ──────────────────────────────────────────

    /// @notice Deposit USDC to fund an agent's compute balance
    /// @dev Requires prior ERC-20 approval. Verifies agentId exists in CeosAgentIdentity.
    /// @param agentId The target agent token ID
    /// @param amount The amount of USDC to deposit (micro-USDC, 6 decimals)
    function depositForAgent(uint256 agentId, uint256 amount) external;

    /// @notice Deduct compute costs from an agent's balance and route the protocol fee
    /// @dev Only callable by the authorized operator. Applies 2% fee to feeRecipient.
    ///      Remainder is held in this contract (available for future withdrawal or burn).
    /// @param agentId The agent token ID to charge
    /// @param amount The gross amount to deduct from the agent's balance (micro-USDC)
    function payForCompute(uint256 agentId, uint256 amount) external;

    /// @notice Withdraw remaining funds from an agent's compute balance
    /// @dev Only the owner of the agent NFT can call this.
    /// @param agentId The agent token ID
    /// @param amount The amount to withdraw (micro-USDC)
    function withdrawBalance(uint256 agentId, uint256 amount) external;

    /// @notice Query an agent's current compute balance
    /// @param agentId The agent token ID
    /// @return The agent's balance in micro-USDC
    function getAgentBalance(uint256 agentId) external view returns (uint256);
}
