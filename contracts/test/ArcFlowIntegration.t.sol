// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {Deployers} from "@uniswap/v4-core/test/utils/Deployers.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";

import {ArcFlowRouter} from "../src/ArcFlowRouter.sol";

/// @notice Mock Gateway Wallet for testing
contract MockGatewayWallet {
    event Deposit(address token, uint256 amount);

    function deposit(address token, uint256 amount) external {
        // Just emit event - in tests we don't need actual bridging
        emit Deposit(token, amount);
    }
}

contract ArcFlowIntegrationTest is Test, Deployers {
    using PoolIdLibrary for PoolKey;

    // Contracts
    ArcFlowRouter router;
    MockGatewayWallet gatewayWallet;

    // Tokens
    MockERC20 usdc;
    MockERC20 usdt;

    // Addresses
    address agent = address(0xA6E47);
    address employer = address(0xE43107E8);

    // Pool
    PoolKey poolKey;
    PoolId poolId;

    // Constants
    uint256 constant INITIAL_BALANCE = 1_000_000e6;

    function setUp() public {
        // Deploy v4 core using Deployers helper
        deployFreshManagerAndRouters();

        // Deploy mock tokens
        usdc = new MockERC20("USD Coin", "USDC", 6);
        usdt = new MockERC20("Tether USD", "USDT", 6);

        // Deploy mock gateway
        gatewayWallet = new MockGatewayWallet();

        // Sort tokens by address
        (address token0, address token1) = address(usdc) < address(usdt)
            ? (address(usdc), address(usdt))
            : (address(usdt), address(usdc));

        // Create pool key (no hooks)
        poolKey = PoolKey({
            currency0: Currency.wrap(token0),
            currency1: Currency.wrap(token1),
            fee: 100, // 0.01% for stablecoins
            tickSpacing: 1,
            hooks: IHooks(address(0))
        });
        poolId = poolKey.toId();

        // Initialize pool at 1:1 price
        manager.initialize(poolKey, SQRT_PRICE_1_1);

        // Deploy router
        router = new ArcFlowRouter(manager, poolKey, address(gatewayWallet));
        router.setAgent(agent);

        // Mint tokens to employer
        usdc.mint(employer, INITIAL_BALANCE);
        usdt.mint(employer, INITIAL_BALANCE);

        // Approve router
        vm.startPrank(employer);
        usdc.approve(address(router), type(uint256).max);
        usdt.approve(address(router), type(uint256).max);
        vm.stopPrank();

        console.log("=== Setup Complete ===");
        console.log("Router:", address(router));
        console.log("USDC:", address(usdc));
        console.log("USDT:", address(usdt));
    }

    /// @notice Test: Deposit USDC → Get payroll ID and liquidity
    function test_DepositFlow() public {
        console.log("\n=== Test: Deposit Flow ===\n");

        uint256 depositAmount = 10_000e6;
        uint256 payrollDate = block.timestamp + 30 days;

        console.log("1. Employer deposits USDC...");

        vm.prank(employer);
        (uint256 payrollId, uint128 liquidity) = router.deposit(
            depositAmount,
            payrollDate
        );

        console.log("   Payroll ID:", payrollId);
        console.log("   Liquidity:", liquidity);

        assertTrue(payrollId > 0, "Should receive payroll ID");
        assertTrue(liquidity > 0, "Should receive liquidity");

        // Check position
        (uint256 storedPayrollId, uint128 storedLiq, , , ) = router.positions(
            employer
        );
        assertEq(storedPayrollId, payrollId, "Payroll ID should match");
        assertEq(storedLiq, liquidity, "Liquidity should match");

        console.log("=== Test Passed ===");
    }

    /// @notice Test: Cannot withdraw before payroll date
    function test_CannotWithdrawEarly() public {
        uint256 payrollDate = block.timestamp + 30 days;

        vm.prank(employer);
        router.deposit(10_000e6, payrollDate);

        // Try to withdraw early
        vm.prank(agent);
        vm.expectRevert(ArcFlowRouter.PayrollNotReady.selector);
        router.withdraw(employer);

        console.log("Early withdrawal correctly blocked");
    }

    /// @notice Test: Withdraw after payroll date
    function test_WithdrawAfterPayrollDate() public {
        uint256 payrollDate = block.timestamp + 30 days;

        vm.prank(employer);
        router.deposit(10_000e6, payrollDate);

        // Warp to after payroll date
        vm.warp(payrollDate + 1);

        // Agent withdraws
        vm.prank(agent);
        uint256 usdcBridged = router.withdraw(employer);

        assertTrue(usdcBridged > 0, "Should bridge USDC");
        console.log("USDC bridged to gateway:", usdcBridged);
    }

    /// @notice Test: Only agent can withdraw
    function test_OnlyAgentCanWithdraw() public {
        uint256 payrollDate = block.timestamp + 1;

        vm.prank(employer);
        router.deposit(10_000e6, payrollDate);

        vm.warp(payrollDate + 1);

        // Non-agent should revert
        vm.prank(employer);
        vm.expectRevert(ArcFlowRouter.Unauthorized.selector);
        router.withdraw(employer);

        console.log("Non-agent correctly blocked");
    }
}
