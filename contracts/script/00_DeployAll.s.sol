// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";

import {ArcFlowRouter} from "../src/ArcFlowRouter.sol";

/// @notice Deploys ArcFlowRouter using existing USDC-USDT pool
contract DeployAllScript is Script {
    // Sepolia addresses
    address constant SEPOLIA_POOL_MANAGER =
        0x8C4BcBE6b9eF47855f97E675296FA3F6fafa5F1A;
    address constant SEPOLIA_USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    address constant SEPOLIA_USDT = 0x7169D38820dfd117C3FA1f22a697dBA58d90BA06;
    address constant GATEWAY_WALLET =
        0x0022222ABE238Cc2C7Bb1f21003F0a260052475B;

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address agentAddress = vm.envOr("AGENT_ADDRESS", deployer);

        console.log("=== ArcFlow Router Deployment ===");
        console.log("Deployer:", deployer);
        console.log("Agent:", agentAddress);

        // Create pool key for existing USDC-USDT pool (no hooks)
        (address token0, address token1) = SEPOLIA_USDC < SEPOLIA_USDT
            ? (SEPOLIA_USDC, SEPOLIA_USDT)
            : (SEPOLIA_USDT, SEPOLIA_USDC);

        PoolKey memory poolKey = PoolKey({
            currency0: Currency.wrap(token0),
            currency1: Currency.wrap(token1),
            fee: 100, // 0.01% for stablecoins
            tickSpacing: 1,
            hooks: IHooks(address(0))
        });

        console.log("Pool Token0:", token0);
        console.log("Pool Token1:", token1);
        console.log("Gateway Wallet:", GATEWAY_WALLET);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy router with existing pool key
        ArcFlowRouter router = new ArcFlowRouter(
            IPoolManager(SEPOLIA_POOL_MANAGER),
            poolKey,
            GATEWAY_WALLET
        );
        console.log("ArcFlowRouter deployed at:", address(router));

        // Set agent
        router.setAgent(agentAddress);
        console.log("Agent set to:", agentAddress);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("Router:", address(router));
    }
}
