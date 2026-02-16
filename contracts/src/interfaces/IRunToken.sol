// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IRunToken
/// @notice Interface for the $RUN protocol reward token
/// @dev ERC20 with a hard cap of 1 Billion tokens and role-based minting.
///
///      Minting is restricted to addresses holding the MINTER_ROLE, which is
///      granted by the DEFAULT_ADMIN_ROLE holder. The primary minter is the
///      StakingRewards contract, which mints $RUN on-demand as yield farming rewards.
///
///      Burning is unrestricted (any holder can burn their own tokens) via
///      ERC20Burnable. This enables the buyback-and-burn deflationary mechanism
///      where the protocol treasury buys $RUN on DEX and burns it.
///
///      Uses OpenZeppelin AccessControl (not Ownable) because multiple independent
///      contracts may need mint permission simultaneously.
interface IRunToken {
    // ── Errors ──────────────────────────────────────────────

    /// @notice Minting would exceed the 1 Billion hard cap
    error MaxSupplyExceeded();

    /// @notice Address parameter is the zero address
    error ZeroAddress();

    // ── Events ──────────────────────────────────────────────

    // Note: AccessControl emits RoleGranted / RoleRevoked for minter changes.
    // ERC20 emits Transfer for mint/burn. No custom events needed.

    // ── Constants ────────────────────────────────────────────

    /// @notice The maximum total supply (1 Billion tokens with 18 decimals)
    /// @return The hard cap in wei units
    function MAX_SUPPLY() external view returns (uint256);

    /// @notice The role identifier for addresses authorized to mint
    /// @return The bytes32 role hash
    function MINTER_ROLE() external view returns (bytes32);

    // ── Minting ─────────────────────────────────────────────

    /// @notice Mint new $RUN tokens to a recipient
    /// @dev Restricted to MINTER_ROLE holders. Reverts if totalSupply + amount > MAX_SUPPLY.
    /// @param to The address receiving the minted tokens
    /// @param amount The number of tokens to mint (in wei, 18 decimals)
    function mint(address to, uint256 amount) external;

    // ── Burning ─────────────────────────────────────────────
    // burn(uint256) and burnFrom(address, uint256) are inherited from ERC20Burnable.
    // They are part of the public API but defined in the OZ base contract, not here.
}
