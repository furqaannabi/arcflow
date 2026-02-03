// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";

import {ArcPayrollDistributor} from "../src/ArcPayrollDistributor.sol";

/// @notice Deploys the ArcPayrollDistributor contract on Arc Network
contract DeployDistributorScript is Script {
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address agentAddress = vm.envOr("AGENT_ADDRESS", deployer);

        console.log("Deploying ArcPayrollDistributor on Arc Network...");
        console.log("Deployer:", deployer);
        console.log("Agent:", agentAddress);

        vm.startBroadcast(deployerPrivateKey);

        ArcPayrollDistributor distributor = new ArcPayrollDistributor();

        // Authorize the agent
        distributor.setAgentAuthorization(agentAddress, true);

        vm.stopBroadcast();

        console.log("ArcPayrollDistributor deployed at:", address(distributor));
        console.log("Agent authorized:", agentAddress);
    }
}
