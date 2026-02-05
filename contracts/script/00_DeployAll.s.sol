// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";

import {ArcFlowRouter} from "../src/ArcFlowRouter.sol";
import {ArcFlowStateManager} from "../src/ArcFlowStateManager.sol";
import {ChainConfig} from "./ChainConfig.sol";

/// @notice Deploys ArcFlowRouter and ArcFlowStateManager on any supported source chain
/// @dev Automatically detects chain and uses appropriate configuration
contract DeployAllScript is Script {
    // 1:1 price for stablecoin pair
    uint160 constant SQRT_PRICE_1_1 = 79228162514264337593543950336;

    function run() public {
        // Validate we're on a source chain
        require(ChainConfig.isSourceChain(), "Not a source chain - use DeployDistributor for Arc");

        // Get chain config
        ChainConfig.Config memory config = ChainConfig.getConfig();

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address agentAddress = vm.envOr("AGENT_ADDRESS", deployer);

        console.log("=== ArcFlow Deployment ===");
        console.log("Chain:", config.name);
        console.log("Chain ID:", config.chainId);
        console.log("Deployer:", deployer);
        console.log("Agent:", agentAddress);

        // Create pool key for USDC-USDT pool (no hooks)
        (address token0, address token1) = config.usdc < config.usdt
            ? (config.usdc, config.usdt)
            : (config.usdt, config.usdc);

        PoolKey memory poolKey = PoolKey({
            currency0: Currency.wrap(token0),
            currency1: Currency.wrap(token1),
            fee: 100, // 0.01% for stablecoins
            tickSpacing: 1,
            hooks: IHooks(address(0))
        });

        console.log("Pool Token0:", token0);
        console.log("Pool Token1:", token1);
        console.log("Pool Manager:", config.poolManager);
        console.log("Gateway Wallet:", config.gatewayWallet);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Initialize the pool if it doesn't exist
        IPoolManager poolManager = IPoolManager(config.poolManager);
        try poolManager.initialize(poolKey, SQRT_PRICE_1_1) returns (int24 tick) {
            console.log("Pool initialized at tick:", tick);
        } catch {
            console.log("Pool already initialized - continuing");
        }

        // 2. Deploy StateManager
        ArcFlowStateManager stateManager = new ArcFlowStateManager();
        console.log("ArcFlowStateManager deployed at:", address(stateManager));

        // 3. Deploy router with stateManager
        ArcFlowRouter router = new ArcFlowRouter(
            poolManager,
            poolKey,
            config.gatewayWallet,
            address(stateManager)
        );
        console.log("ArcFlowRouter deployed at:", address(router));

        // 4. Configure StateManager
        stateManager.setAgentAuthorization(agentAddress, true);
        console.log("Agent authorized in StateManager");

        // Configure this chain
        stateManager.configureChain(
            config.chainId,
            config.circleDomain,
            address(router),
            address(0), // LP pool
            true
        );
        console.log("Chain configured in StateManager");

        // 5. Set agent in router
        router.setAgent(agentAddress);
        console.log("Agent set in Router");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("Chain:", config.name);
        console.log("StateManager:", address(stateManager));
        console.log("Router:", address(router));

        // Write addresses to file
        _writeAddresses(config, address(router), address(stateManager));
    }

    function _writeAddresses(
        ChainConfig.Config memory config,
        address router,
        address stateManager
    ) internal {
        string memory chainKey = _getChainKey(config.chainId);

        string memory json = string.concat(
            '{\n',
            '  "', chainKey, '": {\n',
            '    "router": "', vm.toString(router), '",\n',
            '    "stateManager": "', vm.toString(stateManager), '",\n',
            '    "usdc": "', vm.toString(config.usdc), '",\n',
            '    "usdt": "', vm.toString(config.usdt), '",\n',
            '    "poolManager": "', vm.toString(config.poolManager), '",\n',
            '    "gatewayWallet": "', vm.toString(config.gatewayWallet), '",\n',
            '    "circleDomain": ', vm.toString(uint256(config.circleDomain)), '\n',
            '  }\n',
            '}'
        );

        string memory filename = string.concat("deployments/", chainKey, ".json");
        vm.writeFile(filename, json);
        console.log("Deployment saved to:", filename);
    }

    function _getChainKey(uint256 chainId) internal pure returns (string memory) {
        if (chainId == ChainConfig.SEPOLIA) return "sepolia";
        if (chainId == ChainConfig.BASE_SEPOLIA) return "baseSepolia";
        if (chainId == ChainConfig.ARBITRUM_SEPOLIA) return "arbitrumSepolia";
        return "unknown";
    }
}
