// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IAgentPaymaster } from "./interfaces/IAgentPaymaster.sol";
import { ICeosAgentIdentity } from "./interfaces/ICeosAgentIdentity.sol";

/// @title AgentPaymaster
/// @notice Treasury and escrow for agent compute costs on ceos.run.
/// @dev Agents (or their creators) deposit USDC here to pre-fund compute operations
///      (LLM inference, image generation, data APIs).  When the backend operator
///      triggers `payForCompute`, a hardcoded 2% protocol fee is routed to
///      `feeRecipient` (RevenuePool) and the remaining 98% is held in this contract
///      as a settled balance available for future operational costs.
///
///      The contract references `CeosAgentIdentity` to validate that agentIds exist
///      before accepting deposits, maintaining referential integrity between the
///      identity layer and the payment layer.
///
///      Security model:
///        - depositForAgent: permissionless (anyone can fund an agent)
///        - payForCompute:   only authorized operators (backend worker wallets)
///        - withdrawBalance: only the NFT owner of the agentId
///        - admin functions: only the contract owner
///
///      All external state-changing functions are protected with ReentrancyGuard.
///      Follows CEI (Checks-Effects-Interactions) pattern throughout.
///
///      All USDC amounts use 6-decimal micro-USDC representation.
///
///      // TODO: PHASE 2 — route the net compute payment to the $RUN Buyback & Burn
///      //                 pool via RevenuePool.depositUSDC() instead of holding it here.
///      // TODO: PHASE 2 — integrate with X402PaymentGate for agent-to-agent service purchases.
contract AgentPaymaster is IAgentPaymaster, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Constants ──────────────────────────────────────────

    /// @notice Basis points denominator (100%)
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Maximum protocol fee in basis points (10%)
    uint256 public constant MAX_FEE_RATE_BPS = 1_000;

    // ── State ──────────────────────────────────────────────

    /// @notice The USDC token contract (6 decimals on Base)
    IERC20 public immutable paymentToken;

    /// @notice The CeosAgentIdentity contract used to validate agentIds and look up owners
    ICeosAgentIdentity public immutable agentIdentity;

    /// @notice Per-agent USDC balances available for compute operations (micro-USDC)
    mapping(uint256 => uint256) public agentBalances;

    /// @notice Protocol fee rate in basis points (default: 200 = 2%)
    uint256 public protocolFeeRate;

    /// @notice Address receiving the 2% protocol fee (should be RevenuePool)
    address public feeRecipient;

    /// @notice Set of wallet addresses authorized to call payForCompute
    mapping(address => bool) public authorizedOperators;

    // ── Constructor ────────────────────────────────────────

    /// @notice Deploy AgentPaymaster with references to the USDC token,
    ///         the CeosAgentIdentity registry, and the initial fee recipient.
    /// @param _paymentToken The USDC token contract address (6 decimals)
    /// @param _agentIdentity The CeosAgentIdentity ERC-721 contract address
    /// @param _feeRecipient The initial fee recipient address (e.g., RevenuePool)
    constructor(address _paymentToken, address _agentIdentity, address _feeRecipient) Ownable(msg.sender) {
        if (_paymentToken == address(0)) revert ZeroAddress();
        if (_agentIdentity == address(0)) revert ZeroAddress();
        if (_feeRecipient == address(0)) revert ZeroAddress();

        paymentToken = IERC20(_paymentToken);
        agentIdentity = ICeosAgentIdentity(_agentIdentity);
        feeRecipient = _feeRecipient;
        protocolFeeRate = 200; // 2% default
    }

    // ── Modifiers ──────────────────────────────────────────

    /// @dev Restricts access to authorized operators or the contract owner
    modifier onlyOperator() {
        if (msg.sender != owner() && !authorizedOperators[msg.sender]) {
            revert UnauthorizedCaller();
        }
        _;
    }

    // ── Deposits ───────────────────────────────────────────

    /// @notice Deposit USDC to pre-fund an agent's compute balance.
    /// @dev Permissionless — anyone may top up an agent's balance (e.g., the creator
    ///      or the platform).  Requires the caller to have approved this contract for
    ///      `amount` of `paymentToken` prior to calling.
    ///      Validates that the agentId exists in CeosAgentIdentity before crediting.
    ///      Follows CEI: checks first, then state update, then external call.
    /// @param agentId The target agent's token ID in CeosAgentIdentity
    /// @param amount The USDC amount to deposit (micro-USDC, 6 decimals)
    function depositForAgent(uint256 agentId, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        // Check — agent must exist in the identity registry
        if (!agentIdentity.agentExists(agentId)) revert AgentNotFound(agentId);

        // Effects — credit the agent's balance before the external call
        agentBalances[agentId] += amount;

        // Interactions — pull USDC from the caller
        paymentToken.safeTransferFrom(msg.sender, address(this), amount);

        emit FundsDeposited(agentId, msg.sender, amount);
    }

    // ── Compute Payments ───────────────────────────────────

    /// @notice Deduct compute costs from an agent's balance and route the protocol fee.
    /// @dev Only callable by an authorized operator (backend worker or owner).
    ///      Applies `protocolFeeRate` basis points as the protocol fee, routing it to
    ///      `feeRecipient` (RevenuePool).  The remaining amount stays in this contract.
    ///      Follows CEI: validate and deduct state before transferring USDC out.
    ///
    ///      Example with protocolFeeRate = 200 (2%) and amount = 1_000_000 (1 USDC):
    ///        protocolFee = 1_000_000 * 200 / 10_000 = 20_000 (0.02 USDC to RevenuePool)
    ///        netAmount   = 1_000_000 - 20_000 = 980_000 (0.98 USDC held in contract)
    ///
    /// @param agentId The agent token ID to charge
    /// @param amount The gross amount to deduct from the agent's balance (micro-USDC)
    function payForCompute(uint256 agentId, uint256 amount) external nonReentrant onlyOperator {
        if (amount == 0) revert ZeroAmount();

        uint256 available = agentBalances[agentId];
        if (available < amount) {
            revert InsufficientAgentBalance(agentId, available, amount);
        }

        // Calculate fee split
        uint256 protocolFee = (amount * protocolFeeRate) / BPS_DENOMINATOR;
        uint256 netAmount = amount - protocolFee;

        // Effects — deduct from agent balance before interactions
        agentBalances[agentId] = available - amount;

        // Interactions — route protocol fee to feeRecipient
        if (protocolFee > 0) {
            paymentToken.safeTransfer(feeRecipient, protocolFee);
        }

        // Note: netAmount is intentionally retained in this contract as settled balance.
        // TODO: PHASE 2 — route netAmount to RevenuePool for $RUN Buyback & Burn.

        emit ComputePaid(agentId, amount, protocolFee, netAmount);
    }

    // ── Withdrawals ────────────────────────────────────────

    /// @notice Withdraw a portion of an agent's remaining compute balance.
    /// @dev Only the ERC-721 owner of the agentId NFT (in CeosAgentIdentity) may
    ///      call this function.  Allows creators to reclaim unspent funds.
    ///      Follows CEI: deduct state before transferring USDC out.
    /// @param agentId The agent token ID
    /// @param amount The USDC amount to withdraw (micro-USDC)
    function withdrawBalance(uint256 agentId, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        // Verify caller is the NFT owner
        // Use ERC-721 ownerOf — reverts if token does not exist
        // We cast to the minimal ERC-721 interface for the ownerOf call
        address nftOwner = _ownerOf(agentId);
        if (msg.sender != nftOwner) revert UnauthorizedCaller();

        uint256 available = agentBalances[agentId];
        if (available < amount) {
            revert InsufficientAgentBalance(agentId, available, amount);
        }

        // Effects — reduce balance before transferring
        agentBalances[agentId] = available - amount;

        // Interactions — send USDC to the NFT owner
        paymentToken.safeTransfer(msg.sender, amount);

        emit FundsWithdrawn(agentId, msg.sender, amount);
    }

    // ── Views ──────────────────────────────────────────────

    /// @notice Query an agent's current compute balance.
    /// @param agentId The agent token ID
    /// @return The agent's balance in micro-USDC (6 decimals)
    function getAgentBalance(uint256 agentId) external view returns (uint256) {
        return agentBalances[agentId];
    }

    // ── Admin ──────────────────────────────────────────────

    /// @notice Grant or revoke operator authorization (owner only).
    /// @dev Operators are backend worker wallets that call payForCompute.
    ///      The deployer should authorize the runtime worker address after deployment.
    /// @param operator The address to authorize or deauthorize
    /// @param authorized True to grant; false to revoke
    function setAuthorizedOperator(address operator, bool authorized) external onlyOwner {
        authorizedOperators[operator] = authorized;
    }

    /// @notice Update the protocol fee rate (owner only).
    /// @dev Capped at MAX_FEE_RATE_BPS (10%) to prevent abusive configurations.
    ///      Changing this does not retroactively affect pending balances.
    /// @param newRate The new fee rate in basis points (e.g., 200 = 2%)
    function setProtocolFeeRate(uint256 newRate) external onlyOwner {
        if (newRate > MAX_FEE_RATE_BPS) revert UnauthorizedCaller(); // reuse for guard
        uint256 oldRate = protocolFeeRate;
        protocolFeeRate = newRate;
        emit FeeRateUpdated(oldRate, newRate);
    }

    /// @notice Update the fee recipient address (owner only).
    /// @dev Should point to the RevenuePool contract so fees flow into the buyback flywheel.
    /// @param newRecipient The new fee recipient address
    function setFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert ZeroAddress();
        address oldRecipient = feeRecipient;
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(oldRecipient, newRecipient);
    }

    // ── Internal Helpers ───────────────────────────────────

    /// @dev Look up the ERC-721 owner of `agentId` via the CeosAgentIdentity contract.
    ///      Downcasts ICeosAgentIdentity to IERC721 for the ownerOf call.
    ///      Reverts with ERC721NonexistentToken if the token does not exist.
    function _ownerOf(uint256 agentId) internal view returns (address) {
        // CeosAgentIdentity inherits ERC721, so it exposes ownerOf
        // We call it via a minimal inline interface to avoid importing IERC721
        return IERC721Minimal(address(agentIdentity)).ownerOf(agentId);
    }
}

/// @dev Minimal interface to call ERC-721 ownerOf without a full IERC721 import
interface IERC721Minimal {
    function ownerOf(uint256 tokenId) external view returns (address owner);
}
