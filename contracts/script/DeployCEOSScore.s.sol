// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { CEOSScore } from "../src/CEOSScore.sol";

/// @title DeployCEOSScore
/// @notice Foundry deploy script for the CEOSScore (5-dimension, v2) contract.
/// @dev Deploys CEOSScore with the deployer as the initial oracle.
///      Usage: forge script script/DeployCEOSScore.s.sol --rpc-url base-sepolia --broadcast --verify
contract DeployCEOSScore is Script {
    /// @notice Entry point for the deploy script
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deployer:", deployer);
        console.log("Deployer is initial oracle");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy CEOSScore with deployer as initial oracle
        CEOSScore ceosScore = new CEOSScore(deployer);

        vm.stopBroadcast();

        console.log("=== CEOSScore Deployment Complete ===");
        console.log("CEOSScore deployed at:", address(ceosScore));
        console.log("Oracle:", ceosScore.oracle());
        console.log("Owner:", ceosScore.owner());
    }
}
