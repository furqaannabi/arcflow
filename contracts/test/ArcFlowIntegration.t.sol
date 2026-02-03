// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {Deployers} from "@uniswap/v4-core/test/utils/Deployers.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";

import {ArcFlowHook} from "../src/ArcFlowHook.sol";
import {ArcFlowRouter} from "../src/ArcFlowRouter.sol";
import {DepositData} from "../src/structs/ArcFlowHookStructs.sol";

contract ArcFlowIntegrationTest is Test, Deployers {
    using PoolIdLibrary for PoolKey;

    // Contracts
    ArcFlowHook hook;
    ArcFlowRouter router;

    // Tokens
    MockERC20 usdc;
    MockERC20 tokenA;

    // Addresses
    address agent = address(0xA6E47);
    address employer = address(0xE43107E8);
    address recipient = address(0x8EC1);

    // Pool
    PoolKey poolKey;
    PoolId poolId;

    // Constants
    uint256 constant INITIAL_BALANCE = 1_000_000e6;
    // SQRT_PRICE_1_1 inherited from Deployers

    function setUp() public {
        // Deploy v4 core using Deployers helper
        deployFreshManagerAndRouters();

        // Deploy mock tokens
        usdc = new MockERC20("USD Coin", "USDC", 6);
        tokenA = new MockERC20("Token A", "TKNA", 18);

        // Deploy hook at correct address using deployCodeTo
        uint160 flags = uint160(
            Hooks.AFTER_ADD_LIQUIDITY_FLAG | Hooks.AFTER_REMOVE_LIQUIDITY_FLAG
        );

        // Deploy hook to an address with correct flags
        address hookAddr = address(flags);
        deployCodeTo(
            "ArcFlowHook.sol:ArcFlowHook",
            abi.encode(manager, address(usdc)),
            hookAddr
        );
        hook = ArcFlowHook(hookAddr);

        // Deploy router
        router = new ArcFlowRouter(manager, hook);
        router.setAgent(agent);

        // Setup pool key (ensure currency0 < currency1)
        (Currency c0, Currency c1) = address(usdc) < address(tokenA)
            ? (Currency.wrap(address(usdc)), Currency.wrap(address(tokenA)))
            : (Currency.wrap(address(tokenA)), Currency.wrap(address(usdc)));

        poolKey = PoolKey({
            currency0: c0,
            currency1: c1,
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });
        poolId = poolKey.toId();

        // Initialize pool at 1:1 price
        manager.initialize(poolKey, SQRT_PRICE_1_1);

        // Mint tokens to employer
        usdc.mint(employer, INITIAL_BALANCE);
        tokenA.mint(employer, INITIAL_BALANCE * 1e12);

        // Approve router
        vm.startPrank(employer);
        usdc.approve(address(router), type(uint256).max);
        tokenA.approve(address(router), type(uint256).max);
        vm.stopPrank();

        console.log("=== Setup Complete ===");
        console.log("Hook:", address(hook));
        console.log("Router:", address(router));
    }

    /// @notice Test: Add liquidity → Remove liquidity → Check USDC received
    function test_AddRemoveLiquidityFlow() public {
        console.log("\n=== Test: Add -> Remove -> Check USDC ===\n");

        uint256 amount0 = 10_000e6;
        uint256 amount1 = 10_000e6;

        console.log("1. Employer adds liquidity...");

        vm.prank(employer);
        uint128 liquidity = router.addLiquidity(
            poolKey,
            amount0,
            amount1,
            -887220,
            887220
        );

        console.log("   Liquidity received:", liquidity);
        assertTrue(liquidity > 0, "Should receive liquidity tokens");

        // Check deposit was tracked
        DepositData memory deposit = hook.getPoolDeposits(poolId);
        assertTrue(deposit.timestamp > 0, "Deposit should be tracked");

        // Record recipient balances before
        uint256 usdcBefore = usdc.balanceOf(recipient);
        uint256 tokenABefore = tokenA.balanceOf(recipient);
        console.log(
            "2. Recipient balances before - USDC:",
            usdcBefore,
            "TokenA:",
            tokenABefore
        );

        // Agent removes liquidity
        console.log("3. Agent removes liquidity...");
        vm.prank(agent);
        router.removeLiquidity(poolKey, liquidity, -887220, 887220, recipient);

        // Check recipient received tokens
        uint256 usdcAfter = usdc.balanceOf(recipient);
        uint256 tokenAAfter = tokenA.balanceOf(recipient);
        uint256 usdcReceived = usdcAfter - usdcBefore;
        uint256 tokenAReceived = tokenAAfter - tokenABefore;

        console.log(
            "4. Tokens received - USDC:",
            usdcReceived,
            "TokenA:",
            tokenAReceived
        );

        // Should receive at least one of the tokens
        assertTrue(
            usdcReceived > 0 || tokenAReceived > 0,
            "Recipient should receive tokens"
        );

        // Check deposit tracking was cleared
        DepositData memory depositAfter = hook.getPoolDeposits(poolId);
        assertEq(depositAfter.timestamp, 0, "Deposit should be cleared");

        console.log("=== Test Passed ===");
    }

    /// @notice Test: Only agent can remove liquidity
    function test_OnlyAgentCanRemove() public {
        vm.prank(employer);
        uint128 liquidity = router.addLiquidity(
            poolKey,
            1_000e6,
            1_000e6,
            -887220,
            887220
        );

        // Non-agent should revert
        vm.prank(employer);
        vm.expectRevert();
        router.removeLiquidity(poolKey, liquidity, -887220, 887220, recipient);

        console.log("Non-agent correctly blocked");
    }

    /// @notice Test: Anyone can add liquidity
    function test_AnyoneCanAddLiquidity() public {
        address randomUser = address(0x12345);

        usdc.mint(randomUser, 10_000e6);
        tokenA.mint(randomUser, 10_000e18);

        vm.startPrank(randomUser);
        usdc.approve(address(router), type(uint256).max);
        tokenA.approve(address(router), type(uint256).max);

        uint128 liquidity = router.addLiquidity(
            poolKey,
            1_000e6,
            1_000e6,
            -887220,
            887220
        );
        vm.stopPrank();

        assertTrue(liquidity > 0, "Anyone should add liquidity");
        console.log("Random user added liquidity:", liquidity);
    }
}
