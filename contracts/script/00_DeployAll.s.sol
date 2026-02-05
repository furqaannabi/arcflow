// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";

import {ArcFlowRouter} from "../src/ArcFlowRouter.sol";
import {ArcFlowStateManager} from "../src/ArcFlowStateManager.sol";
import {ArcFlowMigration} from "../src/ArcFlowMigration.sol";
import {ChainConfig} from "./ChainConfig.sol";

/// @notice Deploys ArcFlowRouter and ArcFlowStateManager on any supported source chain
/// @dev Automatically detects chain and uses appropriate configuration
contract DeployAllScript is Script {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

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

        IPoolManager poolManager = IPoolManager(config.poolManager);

        // 1. Check if pool exists, initialize if needed
        PoolId poolId = poolKey.toId();
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(poolId);

        vm.startBroadcast(deployerPrivateKey);

        if (sqrtPriceX96 == 0) {
            int24 tick = poolManager.initialize(poolKey, SQRT_PRICE_1_1);
            console.log("Pool initialized at tick:", tick);
        } else {
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

        // 5. Deploy migration contract
        ArcFlowMigration migration = new ArcFlowMigration(
            address(router),
            address(stateManager),
            config.gatewayWallet,
            config.usdc
        );
        console.log("ArcFlowMigration deployed at:", address(migration));

        // 6. Configure router and migration
        router.setAgent(agentAddress);
        router.setMigrationContract(address(migration));
        migration.setAgent(agentAddress);
        if (config.gatewayMinter != address(0)) {
            migration.setGatewayMinter(config.gatewayMinter);
        }
        console.log("Agent and migration configured");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("Chain:", config.name);
        console.log("StateManager:", address(stateManager));
        console.log("Router:", address(router));
        console.log("Migration:", address(migration));

        // Write addresses to file
        _writeAddresses(config, address(router), address(stateManager), address(migration));
    }

    function _writeAddresses(
        ChainConfig.Config memory config,
        address router,
        address stateManager,
        address migration
    ) internal {
        string memory chainKey = _getChainKey(config.chainId);

        string memory json = string.concat(
            '{\n',
            '  "', chainKey, '": {\n',
            '    "router": "', vm.toString(router), '",\n',
            '    "stateManager": "', vm.toString(stateManager), '",\n',
            '    "migration": "', vm.toString(migration), '",\n',
            '    "usdc": "', vm.toString(config.usdc), '",\n',
            '    "usdt": "', vm.toString(config.usdt), '"\n',
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
        return "unknown";
    }
}
