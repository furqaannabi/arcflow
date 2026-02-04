// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {Deployers} from "@uniswap/v4-core/test/utils/Deployers.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";

import {ArcFlowRouter} from "../src/ArcFlowRouter.sol";
import {ArcFlowStateManager} from "../src/ArcFlowStateManager.sol";
import {LPPosition} from "../src/ArcFlowTypes.sol";
import {PayrollRecipient} from "../src/structs/ArcPayrollDistributorStructs.sol";

/// @notice Mock Gateway Wallet for testing
contract MockGatewayWallet {
    event Deposit(address token, uint256 amount);

    function deposit(address token, uint256 amount) external {
        emit Deposit(token, amount);
    }
}

/// @notice Mock Gateway Minter for cross-chain testing
/// @dev Mints USDC tokens to caller when gatewayMint is called
contract MockGatewayMinter {
    MockERC20 public usdc;

    event GatewayMint(bytes attestation, bytes signature, uint256 amount);

    constructor(address _usdc) {
        usdc = MockERC20(_usdc);
    }

    function setMintAmount(uint256 amount) external {
        // Mint USDC to this contract for next gatewayMint call
        usdc.mint(address(this), amount);
    }

    function gatewayMint(
        bytes calldata attestation,
        bytes calldata signature
    ) external {
        // Transfer all USDC held by this contract to caller
        uint256 balance = usdc.balanceOf(address(this));
        if (balance > 0) {
            usdc.transfer(msg.sender, balance);
        }
        emit GatewayMint(attestation, signature, balance);
    }
}

contract ArcFlowIntegrationTest is Test, Deployers {
    using PoolIdLibrary for PoolKey;

    // Contracts
    ArcFlowRouter router;
    ArcFlowStateManager stateManager;
    MockGatewayWallet gatewayWallet;
    MockGatewayMinter gatewayMinter;

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
    uint32 constant CIRCLE_DOMAIN = 0;

    function setUp() public {
        // Deploy v4 core using Deployers helper
        deployFreshManagerAndRouters();

        // Deploy mock tokens
        usdc = new MockERC20("USD Coin", "USDC", 6);
        usdt = new MockERC20("Tether USD", "USDT", 6);

        // Deploy mock gateways
        gatewayWallet = new MockGatewayWallet();
        gatewayMinter = new MockGatewayMinter(address(usdc));

        // Deploy state manager
        stateManager = new ArcFlowStateManager();

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

        // Add initial liquidity to the pool
        _addInitialLiquidity(token0, token1);

        // Deploy router with stateManager
        router = new ArcFlowRouter(
            manager,
            poolKey,
            address(gatewayWallet),
            address(stateManager)
        );
        router.setAgent(agent);
        router.setGatewayMinter(address(gatewayMinter));

        // Configure state manager
        stateManager.setAgentAuthorization(agent, true);
        stateManager.configureChain(
            block.chainid,
            CIRCLE_DOMAIN,
            address(router),
            address(0),
            true
        );

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
        console.log("StateManager:", address(stateManager));
        console.log("USDC:", address(usdc));
        console.log("USDT:", address(usdt));
    }

    /// @dev Add initial liquidity to enable swaps in the pool
    function _addInitialLiquidity(address token0, address token1) internal {
        uint256 liquidityAmount = 100_000_000e6; // 100M tokens each

        // Mint tokens to this contract for providing liquidity
        MockERC20(token0).mint(address(this), liquidityAmount);
        MockERC20(token1).mint(address(this), liquidityAmount);

        // Approve the modifyLiquidityRouter
        MockERC20(token0).approve(address(modifyLiquidityRouter), type(uint256).max);
        MockERC20(token1).approve(address(modifyLiquidityRouter), type(uint256).max);

        // Add liquidity using full range ticks (-887220 to 887220)
        // These are the same tick bounds used in ArcFlowRouter
        modifyLiquidityRouter.modifyLiquidity(
            poolKey,
            ModifyLiquidityParams({
                tickLower: -887220,
                tickUpper: 887220,
                liquidityDelta: int256(liquidityAmount),
                salt: bytes32(0)
            }),
            ""
        );
    }

    /// @notice Test: Deposit USDC → Get payroll ID and liquidity
    function test_DepositFlow() public {
        console.log("\n=== Test: Deposit Flow ===\n");

        uint256 depositAmount = 10_000e6;
        uint256 payrollDate = block.timestamp + 30 days;

        console.log("1. Employer deposits USDC...");

        PayrollRecipient[] memory recipients = new PayrollRecipient[](1);
        recipients[0] = PayrollRecipient({
            wallet: address(0x1),
            amount: 10_000e6
        });

        vm.prank(employer);
        (uint256 payrollId, uint128 liquidity) = router.deposit(
            depositAmount,
            payrollDate,
            recipients
        );

        console.log("   Payroll ID:", payrollId);
        console.log("   Liquidity:", liquidity);

        assertTrue(payrollId > 0, "Should receive payroll ID");
        assertTrue(liquidity > 0, "Should receive liquidity");

        // Check position using getPosition
        LPPosition memory pos = router.getPosition(payrollId);
        assertEq(pos.payrollId, payrollId, "Payroll ID should match");
        assertEq(pos.liquidity, liquidity, "Liquidity should match");
        assertEq(pos.provider, employer, "Provider should be employer");
        assertEq(pos.currentChainId, block.chainid, "Chain ID should match");

        console.log("=== Test Passed ===");
    }

    /// @notice Test: Cannot withdraw before payroll date
    function test_CannotWithdrawEarly() public {
        uint256 payrollDate = block.timestamp + 30 days;

        vm.prank(employer);
        PayrollRecipient[] memory recipients = new PayrollRecipient[](1);
        recipients[0] = PayrollRecipient({
            wallet: address(0x1),
            amount: 10_000e6
        });
        (uint256 payrollId, ) = router.deposit(
            10_000e6,
            payrollDate,
            recipients
        );

        // Try to withdraw early
        vm.prank(agent);
        vm.expectRevert(ArcFlowRouter.PayrollNotReady.selector);
        router.withdraw(payrollId);

        console.log("Early withdrawal correctly blocked");
    }

    /// @notice Test: Withdraw after payroll date
    function test_WithdrawAfterPayrollDate() public {
        uint256 payrollDate = block.timestamp + 30 days;

        vm.prank(employer);
        PayrollRecipient[] memory recipients = new PayrollRecipient[](1);
        recipients[0] = PayrollRecipient({
            wallet: address(0x1),
            amount: 10_000e6
        });
        (uint256 payrollId, ) = router.deposit(
            10_000e6,
            payrollDate,
            recipients
        );

        // Warp to after payroll date
        vm.warp(payrollDate + 1);

        // Agent withdraws
        vm.prank(agent);
        uint256 usdcBridged = router.withdraw(payrollId);

        assertTrue(usdcBridged > 0, "Should bridge USDC");
        console.log("USDC bridged to gateway:", usdcBridged);
    }

    /// @notice Test: Only agent can withdraw
    function test_OnlyAgentCanWithdraw() public {
        uint256 payrollDate = block.timestamp + 1;

        vm.prank(employer);
        PayrollRecipient[] memory recipients = new PayrollRecipient[](1);
        recipients[0] = PayrollRecipient({
            wallet: address(0x1),
            amount: 10_000e6
        });
        (uint256 payrollId, ) = router.deposit(
            10_000e6,
            payrollDate,
            recipients
        );

        vm.warp(payrollDate + 1);

        // Non-agent should revert
        vm.prank(employer);
        vm.expectRevert(ArcFlowRouter.Unauthorized.selector);
        router.withdraw(payrollId);

        console.log("Non-agent correctly blocked");
    }

    /// @notice Test: Get payrolls ready for execution
    function test_GetPayrollsReadyForExecution() public {
        uint256 payrollDate1 = block.timestamp + 10 days;
        uint256 payrollDate2 = block.timestamp + 30 days;

        vm.startPrank(employer);
        PayrollRecipient[] memory recipients = new PayrollRecipient[](1);
        recipients[0] = PayrollRecipient({
            wallet: address(0x1),
            amount: 5_000e6
        });
        (uint256 payrollId1, ) = router.deposit(
            5_000e6,
            payrollDate1,
            recipients
        );
        router.deposit(5_000e6, payrollDate2, recipients);
        vm.stopPrank();

        // Nothing ready yet
        (
            uint256[] memory readyIds,
            LPPosition[] memory readyPositions
        ) = router.getPayrollsReadyForExecution();
        assertEq(readyIds.length, 0, "No payrolls ready initially");

        // Warp to after first payroll date
        vm.warp(payrollDate1 + 1);

        (readyIds, readyPositions) = router.getPayrollsReadyForExecution();
        assertEq(readyIds.length, 1, "One payroll ready");
        assertEq(readyIds[0], payrollId1, "First payroll should be ready");

        // Warp to after second payroll date
        vm.warp(payrollDate2 + 1);

        (readyIds, readyPositions) = router.getPayrollsReadyForExecution();
        assertEq(readyIds.length, 2, "Both payrolls ready");
    }

    /// @notice Test: Get payrolls ready for migration
    function test_GetPayrollsReadyForMigration() public {
        // Payroll date in 30 days (can migrate)
        uint256 payrollDate = block.timestamp + 30 days;

        vm.prank(employer);
        PayrollRecipient[] memory recipients = new PayrollRecipient[](1);
        recipients[0] = PayrollRecipient({
            wallet: address(0x1),
            amount: 10_000e6
        });
        router.deposit(10_000e6, payrollDate, recipients);

        // Update APY for this chain
        vm.prank(agent);
        stateManager.updateChainApy(block.chainid, 500); // 5% APY

        (
            uint256[] memory migratableIds,
            LPPosition[] memory migratablePositions
        ) = router.getPayrollsReadyForMigration();

        assertEq(migratableIds.length, 1, "Should have one migratable payroll");
        assertEq(
            migratablePositions[0].currentChainId,
            block.chainid,
            "Position should be on current chain"
        );
    }

    /// @notice Test: Cannot migrate within 24h of payroll
    function test_CannotMigrateWithinWindow() public {
        uint256 payrollDate = block.timestamp + 12 hours; // Less than 24h

        vm.prank(employer);
        PayrollRecipient[] memory recipients = new PayrollRecipient[](1);
        recipients[0] = PayrollRecipient({
            wallet: address(0x1),
            amount: 10_000e6
        });
        (uint256 payrollId, ) = router.deposit(
            10_000e6,
            payrollDate,
            recipients
        );

        // Update APY
        vm.prank(agent);
        stateManager.updateChainApy(block.chainid, 500);

        // Try to migrate - should fail due to small window
        vm.prank(agent);
        vm.expectRevert(ArcFlowRouter.MigrationWindowTooSmall.selector);
        router.migrateToChain(payrollId, 1);
    }

    /// @notice Test: State manager APY tracking
    function test_StateManagerApyTracking() public {
        // Configure a second chain
        stateManager.configureChain(137, 7, address(0x456), address(0), true);

        // Update APYs
        vm.startPrank(agent);
        stateManager.updateChainApy(block.chainid, 300); // 3% on current chain
        stateManager.updateChainApy(137, 800); // 8% on Polygon
        vm.stopPrank();

        // Get best chain
        (uint256 bestChainId, uint256 bestApy) = stateManager
            .getBestChainForApy();

        assertEq(bestChainId, 137, "Polygon should be best chain");
        assertEq(bestApy, 800, "Best APY should be 8%");
    }

    /// @notice Test: Multiple payrolls per provider
    function test_MultiplePayrollsPerProvider() public {
        uint256 payrollDate1 = block.timestamp + 10 days;
        uint256 payrollDate2 = block.timestamp + 20 days;
        uint256 payrollDate3 = block.timestamp + 30 days;

        vm.startPrank(employer);
        PayrollRecipient[] memory recipients1 = new PayrollRecipient[](1);
        recipients1[0] = PayrollRecipient({
            wallet: address(0x1),
            amount: 3_000e6
        });
        PayrollRecipient[] memory recipients2 = new PayrollRecipient[](1);
        recipients2[0] = PayrollRecipient({
            wallet: address(0x1),
            amount: 4_000e6
        });
        PayrollRecipient[] memory recipients3 = new PayrollRecipient[](1);
        recipients3[0] = PayrollRecipient({
            wallet: address(0x1),
            amount: 5_000e6
        });

        router.deposit(3_000e6, payrollDate1, recipients1);
        router.deposit(4_000e6, payrollDate2, recipients2);
        router.deposit(5_000e6, payrollDate3, recipients3);
        vm.stopPrank();

        // Check provider payrolls
        uint256[] memory providerPayrollIds = router.getProviderPayrolls(
            employer
        );
        assertEq(providerPayrollIds.length, 3, "Should have 3 payrolls");

        // Check positions
        LPPosition[] memory positions = router
            .getProviderPositions(employer);
        assertEq(positions.length, 3, "Should have 3 positions");
        assertEq(positions[0].usdcDeposited, 3_000e6);
        assertEq(positions[1].usdcDeposited, 4_000e6);
        assertEq(positions[2].usdcDeposited, 5_000e6);
    }
}
