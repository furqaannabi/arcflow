// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDT} from "../src/mocks/MockUSDT.sol";

/// @notice Deploy MockUSDT and mint initial supply to deployer.
///
/// Usage:
///   forge script script/05_DeployMockUSDT.s.sol:DeployMockUSDTScript \
///     --rpc-url <RPC_URL> --broadcast -vvvv
contract DeployMockUSDTScript is Script {
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        uint256 mintAmount = vm.envOr("MINT_AMOUNT", uint256(1_000_000e6)); // 1M USDT

        console.log("Deployer:", deployer);
        console.log("Mint amount:", mintAmount);

        vm.startBroadcast(deployerPrivateKey);

        MockUSDT usdt = new MockUSDT();
        console.log("MockUSDT deployed at:", address(usdt));

        usdt.mint(deployer, mintAmount);
        console.log("Minted", mintAmount, "to deployer");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Done ===");
        console.log("MockUSDT:", address(usdt));
        console.log("Balance:", usdt.balanceOf(deployer));
    }
}
