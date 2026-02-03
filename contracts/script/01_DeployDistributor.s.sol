// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";

import {ArcPayrollDistributor} from "../src/ArcPayrollDistributor.sol";

/// @notice Deploys the ArcPayrollDistributor contract on Arc Network
contract DeployDistributorScript is Script {
    // Circle Gateway Minter on Arc Testnet
    address constant GATEWAY_MINTER =
        0x0022222ABE238Cc2C7Bb1f21003F0a260052475B;

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address agentAddress = vm.envOr("AGENT_ADDRESS", deployer);

        console.log("Deploying ArcPayrollDistributor on Arc Network...");
        console.log("Deployer:", deployer);
        console.log("Agent:", agentAddress);
        console.log("GatewayMinter:", GATEWAY_MINTER);

        vm.startBroadcast(deployerPrivateKey);

        ArcPayrollDistributor distributor = new ArcPayrollDistributor(
            GATEWAY_MINTER
        );

        // Authorize the agent
        distributor.setAgentAuthorization(agentAddress, true);

        vm.stopBroadcast();

        console.log("ArcPayrollDistributor deployed at:", address(distributor));
        console.log("Agent authorized:", agentAddress);
    }
}
