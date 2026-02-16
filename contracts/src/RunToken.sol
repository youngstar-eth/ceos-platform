// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Burnable } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { IRunToken } from "./interfaces/IRunToken.sol";

/// @title RunToken
/// @notice The $RUN protocol reward token — ERC20 with role-based minting and a 1B hard cap.
/// @dev Uses AccessControl (not Ownable) because multiple independent contracts need mint
///      permission: StakingRewards for yield farming rewards, and potentially future incentive
///      contracts. The DEFAULT_ADMIN_ROLE holder manages who can mint.
///
///      Token economics:
///        - No initial mint at deployment (all tokens minted on-demand as rewards)
///        - Hard cap of 1,000,000,000 tokens (1 Billion) enforced per-mint
///        - Burnable by any holder (enables buyback-and-burn deflationary mechanism)
///        - 18 decimals (standard ERC20)
///
///      This is the only contract in the ceos.run codebase using AccessControl instead of
///      Ownable. This departure is justified by the multi-party minting requirement.
contract RunToken is IRunToken, ERC20, ERC20Burnable, AccessControl {
    // ── Constants ────────────────────────────────────────────

    /// @inheritdoc IRunToken
    uint256 public constant MAX_SUPPLY = 1_000_000_000e18;

    /// @inheritdoc IRunToken
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // ── Constructor ──────────────────────────────────────────

    /// @notice Deploy the $RUN token with an initial admin
    /// @dev Grants DEFAULT_ADMIN_ROLE to the deployer. No tokens are minted at construction.
    ///      The admin should grant MINTER_ROLE to the StakingRewards contract after deployment.
    /// @param initialAdmin The address receiving DEFAULT_ADMIN_ROLE (manages minter permissions)
    constructor(address initialAdmin) ERC20("RUN", "RUN") {
        if (initialAdmin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
    }

    // ── Minting ─────────────────────────────────────────────

    /// @inheritdoc IRunToken
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        if (totalSupply() + amount > MAX_SUPPLY) revert MaxSupplyExceeded();
        _mint(to, amount);
    }

    // ── Required Overrides ───────────────────────────────────

    /// @notice Check if this contract supports a given interface
    /// @dev Required override because both ERC20 and AccessControl define supportsInterface
    /// @param interfaceId The interface identifier to check
    /// @return True if the interface is supported
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
