// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";

import {ArcPayrollDistributor} from "../src/ArcPayrollDistributor.sol";

/// @notice Deploys the ArcPayrollDistributor contract on Arc Network
contract DeployDistributorScript is Script {
    // Arc Network USDC address (Circle native USDC)
    address constant ARC_USDC = 0x79A02482A880bCE3F13e09Da970dC34db4CD24d1;
    
    function run() public {
        // Get deployer private key from environment
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        // Configuration
        address owner = deployer;
        address usdc = vm.envOr("ARC_USDC_ADDRESS", ARC_USDC);
        
        console.log("Deploying ArcPayrollDistributor on Arc Network...");
        console.log("Owner:", owner);
        console.log("USDC Address:", usdc);

        vm.startBroadcast(deployerPrivateKey);
        
        ArcPayrollDistributor distributor = new ArcPayrollDistributor(usdc, owner);
        
        vm.stopBroadcast();
        
        console.log("ArcPayrollDistributor deployed at:", address(distributor));
    }
}
