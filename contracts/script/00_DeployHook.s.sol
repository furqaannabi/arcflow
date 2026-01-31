// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {AddressConstants} from "hookmate/constants/AddressConstants.sol";

import {ArcFlowHook} from "../src/ArcFlowHook.sol";

/// @notice Mines the address and deploys the ArcFlowHook contract on Sepolia
contract DeployHookScript is Script {
    // Sepolia Uniswap V4 PoolManager address
    address constant SEPOLIA_POOL_MANAGER = 0x8C4BcBE6b9eF47855f97E675296FA3F6fafa5F1A;
    
    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deployer:", deployer);

        address circleGateway = vm.envOr("CIRCLE_GATEWAY", address(0)); // Circle Gateway address
        
        IPoolManager poolManager = IPoolManager(SEPOLIA_POOL_MANAGER);
        
        // Hook contracts must have specific flags encoded in the address
        // ArcFlowHook uses: beforeAddLiquidity, beforeRemoveLiquidity, beforeSwap
        uint160 flags = uint160(
            Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG
        );

        // Mine a salt that will produce a hook address with the correct flags
        bytes memory constructorArgs = abi.encode(poolManager, circleGateway);
        (address hookAddress, bytes32 salt) =
            HookMiner.find(CREATE2_FACTORY, flags, type(ArcFlowHook).creationCode, constructorArgs);

        console.log("Deploying ArcFlowHook...");
        console.log("Expected hook address:", hookAddress);
        console.log("Circle Gateway:", circleGateway);

        // Deploy the hook using CREATE2
        vm.startBroadcast(deployerPrivateKey);
        ArcFlowHook hook = new ArcFlowHook{salt: salt}(poolManager, circleGateway);
        vm.stopBroadcast();

        require(address(hook) == hookAddress, "DeployHookScript: Hook Address Mismatch");
        
        console.log("ArcFlowHook deployed at:", address(hook));
    }
}
