// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { RunToken } from "../src/RunToken.sol";
import { IRunToken } from "../src/interfaces/IRunToken.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";

/// @title RunTokenTest
/// @notice Unit and fuzz tests for RunToken.sol
contract RunTokenTest is Test {
    RunToken public token;

    address public admin = makeAddr("admin");
    address public minter = makeAddr("minter");
    address public user = makeAddr("user");
    address public burner = makeAddr("burner");

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant DEFAULT_ADMIN_ROLE = 0x00;

    function setUp() public {
        token = new RunToken(admin);

        // Admin grants MINTER_ROLE to minter
        vm.prank(admin);
        token.grantRole(MINTER_ROLE, minter);
    }

    // ── Constructor ──────────────────────────────────────────

    function test_constructor_setsAdmin() public view {
        assertTrue(token.hasRole(DEFAULT_ADMIN_ROLE, admin));
    }

    function test_constructor_noInitialSupply() public view {
        assertEq(token.totalSupply(), 0);
    }

    function test_constructor_nameSymbolDecimals() public view {
        assertEq(token.name(), "RUN");
        assertEq(token.symbol(), "RUN");
        assertEq(token.decimals(), 18);
    }

    function test_constructor_revertZeroAddress() public {
        vm.expectRevert(IRunToken.ZeroAddress.selector);
        new RunToken(address(0));
    }

    // ── Minting ─────────────────────────────────────────────

    function test_mint_success() public {
        uint256 amount = 1_000e18;

        vm.prank(minter);
        token.mint(user, amount);

        assertEq(token.balanceOf(user), amount);
        assertEq(token.totalSupply(), amount);
    }

    function test_mint_revertUnauthorized() public {
        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                user,
                MINTER_ROLE
            )
        );
        token.mint(user, 1_000e18);
    }

    function test_mint_revertMaxSupplyExceeded() public {
        uint256 maxSupply = token.MAX_SUPPLY();

        // Mint to max
        vm.prank(minter);
        token.mint(user, maxSupply);
        assertEq(token.totalSupply(), maxSupply);

        // Try to mint 1 more
        vm.prank(minter);
        vm.expectRevert(IRunToken.MaxSupplyExceeded.selector);
        token.mint(user, 1);
    }

    function test_mint_exactlyMaxSupply() public {
        uint256 maxSupply = token.MAX_SUPPLY();

        vm.prank(minter);
        token.mint(user, maxSupply);

        assertEq(token.totalSupply(), maxSupply);
        assertEq(token.balanceOf(user), maxSupply);
    }

    // ── Burning ─────────────────────────────────────────────

    function test_burn_success() public {
        uint256 mintAmount = 1_000e18;
        uint256 burnAmount = 400e18;

        vm.prank(minter);
        token.mint(user, mintAmount);

        vm.prank(user);
        token.burn(burnAmount);

        assertEq(token.balanceOf(user), mintAmount - burnAmount);
        assertEq(token.totalSupply(), mintAmount - burnAmount);
    }

    function test_burnFrom_success() public {
        uint256 mintAmount = 1_000e18;
        uint256 burnAmount = 400e18;

        vm.prank(minter);
        token.mint(user, mintAmount);

        // User approves burner
        vm.prank(user);
        token.approve(burner, burnAmount);

        // Burner calls burnFrom
        vm.prank(burner);
        token.burnFrom(user, burnAmount);

        assertEq(token.balanceOf(user), mintAmount - burnAmount);
        assertEq(token.totalSupply(), mintAmount - burnAmount);
    }

    // ── Role Management ─────────────────────────────────────

    function test_grantMinterRole() public {
        address newMinter = makeAddr("newMinter");

        vm.prank(admin);
        token.grantRole(MINTER_ROLE, newMinter);

        assertTrue(token.hasRole(MINTER_ROLE, newMinter));

        // New minter can mint
        vm.prank(newMinter);
        token.mint(user, 100e18);
        assertEq(token.balanceOf(user), 100e18);
    }

    function test_revokeMinterRole() public {
        // Verify minter can mint
        vm.prank(minter);
        token.mint(user, 100e18);

        // Revoke
        vm.prank(admin);
        token.revokeRole(MINTER_ROLE, minter);

        assertFalse(token.hasRole(MINTER_ROLE, minter));

        // Minter can no longer mint
        vm.prank(minter);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                minter,
                MINTER_ROLE
            )
        );
        token.mint(user, 100e18);
    }

    function test_multipleMinters() public {
        address minter2 = makeAddr("minter2");

        vm.prank(admin);
        token.grantRole(MINTER_ROLE, minter2);

        // Both minters can mint independently
        vm.prank(minter);
        token.mint(user, 500e18);

        vm.prank(minter2);
        token.mint(user, 300e18);

        assertEq(token.balanceOf(user), 800e18);
    }

    // ── Fuzz Tests ──────────────────────────────────────────

    function testFuzz_mint_belowCap(uint256 amount) public {
        amount = bound(amount, 1, token.MAX_SUPPLY());

        vm.prank(minter);
        token.mint(user, amount);

        assertEq(token.balanceOf(user), amount);
        assertEq(token.totalSupply(), amount);
    }

    function testFuzz_mint_thenBurn(uint256 mintAmount, uint256 burnAmount) public {
        mintAmount = bound(mintAmount, 1, token.MAX_SUPPLY());
        burnAmount = bound(burnAmount, 0, mintAmount);

        vm.prank(minter);
        token.mint(user, mintAmount);

        vm.prank(user);
        token.burn(burnAmount);

        assertEq(token.balanceOf(user), mintAmount - burnAmount);
        assertEq(token.totalSupply(), mintAmount - burnAmount);
    }
}
