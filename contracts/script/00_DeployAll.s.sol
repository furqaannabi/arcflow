// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";

import {ArcFlowHook} from "../src/ArcFlowHook.sol";
import {ArcFlowRouter} from "../src/ArcFlowRouter.sol";

/// @notice Deploys both ArcFlowHook and ArcFlowRouter in one transaction
contract DeployAllScript is Script {
    // Sepolia Uniswap V4 PoolManager address
    address constant SEPOLIA_POOL_MANAGER =
        0x8C4BcBE6b9eF47855f97E675296FA3F6fafa5F1A;

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // USDC address on Sepolia
        address usdc = vm.envOr(
            "USDC_ADDRESS",
            address(0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238)
        );
        address agentAddress = vm.envOr("AGENT_ADDRESS", deployer);

        IPoolManager poolManager = IPoolManager(SEPOLIA_POOL_MANAGER);

        console.log("=== ArcFlow Deployment ===");
        console.log("Deployer:", deployer);
        console.log("USDC:", usdc);
        console.log("Agent:", agentAddress);

        // Hook flags: afterAddLiquidity, afterRemoveLiquidity
        uint160 flags = uint160(
            Hooks.AFTER_ADD_LIQUIDITY_FLAG | Hooks.AFTER_REMOVE_LIQUIDITY_FLAG
        );

        // Mine a salt that will produce a hook address with the correct flags
        bytes memory constructorArgs = abi.encode(poolManager, usdc);
        (address hookAddress, bytes32 salt) = HookMiner.find(
            CREATE2_FACTORY,
            flags,
            type(ArcFlowHook).creationCode,
            constructorArgs
        );

        console.log("");
        console.log("--- Step 1: Deploy Hook ---");
        console.log("Expected hook address:", hookAddress);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy the hook using CREATE2
        ArcFlowHook hook = new ArcFlowHook{salt: salt}(poolManager, usdc);
        require(address(hook) == hookAddress, "Hook address mismatch");

        console.log("ArcFlowHook deployed at:", address(hook));

        // 2. Deploy the router
        console.log("");
        console.log("--- Step 2: Deploy Router ---");

        ArcFlowRouter router = new ArcFlowRouter(poolManager, hook);
        console.log("ArcFlowRouter deployed at:", address(router));

        // 3. Set the agent on router
        router.setAgent(agentAddress);
        console.log("Agent set to:", agentAddress);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("Hook:", address(hook));
        console.log("Router:", address(router));
    }
}
