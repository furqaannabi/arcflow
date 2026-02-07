// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";

import {ArcFlowRouter} from "../src/ArcFlowRouter.sol";
import {PayrollRecipient} from "../src/structs/ArcPayrollDistributorStructs.sol";
import {ChainConfig} from "./ChainConfig.sol";

/// @notice Deposit USDC into ArcFlowRouter.
///         Checks pool liquidity and balances before attempting deposit.
///
/// Usage:
///   forge script script/04_Deposit.s.sol:DepositScript \
///     --rpc-url https://sepolia.base.org --broadcast -vvvv
contract DepositScript is Script {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    function run() public {
        require(ChainConfig.isSourceChain(), "Not a source chain");

        ChainConfig.Config memory config = ChainConfig.getConfig();
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Read deployed router address
        string memory json = vm.readFile(
            string.concat("deployments/", _chainKey(config.chainId), ".json")
        );
        string memory chainKey = string.concat(".", _chainKey(config.chainId));
        address routerAddr = vm.parseJsonAddress(json, string.concat(chainKey, ".router"));

        ArcFlowRouter router = ArcFlowRouter(routerAddr);
        IPoolManager poolManager = IPoolManager(config.poolManager);
        IERC20 usdc = IERC20(config.usdc);

        // Config
        uint256 payrollDate = vm.envOr("PAYROLL_DATE", block.timestamp + 5 minutes);
        address recipient = vm.envOr("RECIPIENT", deployer);

        // Build pool key
        (address t0, address t1) = config.usdc < config.usdt
            ? (config.usdc, config.usdt)
            : (config.usdt, config.usdc);

        PoolKey memory poolKey = PoolKey({
            currency0: Currency.wrap(t0),
            currency1: Currency.wrap(t1),
            fee: 500,
            tickSpacing: 10,
            hooks: IHooks(address(0))
        });

        PoolId poolId = poolKey.toId();

        // ============================
        // Pre-flight checks
        // ============================
        console.log("=== Pre-flight Checks ===");

        // 1. Check pool exists
        (uint160 sqrtPriceX96, int24 tick,,) = poolManager.getSlot0(poolId);
        console.log("Pool sqrtPriceX96:", uint256(sqrtPriceX96));
        console.log("Pool tick:", tick);

        if (sqrtPriceX96 == 0) {
            console.log("FAIL: Pool not initialized");
            revert("Pool not initialized");
        }
        console.log("OK: Pool is initialized");

        // 2. Check pool liquidity — seed if empty
        uint128 poolLiquidity = poolManager.getLiquidity(poolId);
        console.log("Pool liquidity:", uint256(poolLiquidity));

        IERC20 usdt = IERC20(config.usdt);

        vm.startBroadcast(deployerPrivateKey);

        if (poolLiquidity == 0) {
            console.log("Pool has no liquidity, seeding via router.seed()...");
            uint256 seedAmt = 10e6; // 10 USDC + 10 USDT
            console.log("Deployer USDC balance:", usdc.balanceOf(deployer));
            console.log("Deployer USDT balance:", usdt.balanceOf(deployer));
            require(usdc.balanceOf(deployer) >= seedAmt && usdt.balanceOf(deployer) >= seedAmt, "Need 10 USDC and 10 USDT to seed");
            console.log("Seed amount per token:", seedAmt);

            usdc.approve(routerAddr, seedAmt);
            usdt.approve(routerAddr, seedAmt);
            router.seed(seedAmt, seedAmt);
            console.log("OK: Pool seeded");
        } else {
            console.log("OK: Pool has liquidity");
        }
        vm.stopBroadcast();
    }

    function _chainKey(uint256 chainId) internal pure returns (string memory) {
        if (chainId == ChainConfig.SEPOLIA) return "sepolia";
        if (chainId == ChainConfig.BASE_SEPOLIA) return "baseSepolia";
        return "unknown";
    }
}
