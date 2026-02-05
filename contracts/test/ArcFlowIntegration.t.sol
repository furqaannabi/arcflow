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
import {ArcFlowMigration} from "../src/ArcFlowMigration.sol";
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
contract MockGatewayMinter {
    MockERC20 public usdc;

    constructor(address _usdc) {
        usdc = MockERC20(_usdc);
    }

    function setMintAmount(uint256 amount) external {
        usdc.mint(address(this), amount);
    }

    function gatewayMint(bytes calldata, bytes calldata) external {
        uint256 balance = usdc.balanceOf(address(this));
        if (balance > 0) {
            usdc.transfer(msg.sender, balance);
        }
    }
}

contract ArcFlowIntegrationTest is Test, Deployers {
    using PoolIdLibrary for PoolKey;

    ArcFlowRouter router;
    ArcFlowStateManager stateManager;
    ArcFlowMigration migration;
    MockGatewayWallet gatewayWallet;
    MockGatewayMinter gatewayMinter;

    MockERC20 usdc;
    MockERC20 usdt;

    address agent = address(0xA6E47);
    address employer = address(0xE43107E8);

    PoolKey poolKey;
    PoolId poolId;

    uint256 constant INITIAL_BALANCE = 1_000_000e6;
    uint32 constant CIRCLE_DOMAIN = 0;

    function setUp() public {
        deployFreshManagerAndRouters();

        usdc = new MockERC20("USD Coin", "USDC", 6);
        usdt = new MockERC20("Tether USD", "USDT", 6);

        gatewayWallet = new MockGatewayWallet();
        gatewayMinter = new MockGatewayMinter(address(usdc));

        stateManager = new ArcFlowStateManager();

        (address token0, address token1) = address(usdc) < address(usdt)
            ? (address(usdc), address(usdt))
            : (address(usdt), address(usdc));

        poolKey = PoolKey({
            currency0: Currency.wrap(token0),
            currency1: Currency.wrap(token1),
            fee: 100,
            tickSpacing: 1,
            hooks: IHooks(address(0))
        });
        poolId = poolKey.toId();

        manager.initialize(poolKey, SQRT_PRICE_1_1);
        _addInitialLiquidity(token0, token1);

        router = new ArcFlowRouter(
            manager,
            poolKey,
            address(gatewayWallet),
            address(stateManager)
        );

        migration = new ArcFlowMigration(
            address(router),
            address(stateManager),
            address(gatewayWallet),
            address(usdc)
        );

        router.setAgent(agent);
        router.setMigrationContract(address(migration));
        migration.setAgent(agent);
        migration.setGatewayMinter(address(gatewayMinter));

        stateManager.setAgentAuthorization(agent, true);
        stateManager.setAgentAuthorization(address(migration), true);
        stateManager.configureChain(block.chainid, CIRCLE_DOMAIN, address(router), address(0), true);

        usdc.mint(employer, INITIAL_BALANCE);
        usdt.mint(employer, INITIAL_BALANCE);

        vm.startPrank(employer);
        usdc.approve(address(router), type(uint256).max);
        usdt.approve(address(router), type(uint256).max);
        vm.stopPrank();
    }

    function _addInitialLiquidity(address token0, address token1) internal {
        uint256 liquidityAmount = 100_000_000e6;

        MockERC20(token0).mint(address(this), liquidityAmount);
        MockERC20(token1).mint(address(this), liquidityAmount);

        MockERC20(token0).approve(address(modifyLiquidityRouter), type(uint256).max);
        MockERC20(token1).approve(address(modifyLiquidityRouter), type(uint256).max);

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

    function test_DepositFlow() public {
        uint256 depositAmount = 10_000e6;
        uint256 payrollDate = block.timestamp + 30 days;

        PayrollRecipient[] memory recipients = new PayrollRecipient[](1);
        recipients[0] = PayrollRecipient({wallet: address(0x1), amount: 10_000e6});

        vm.prank(employer);
        (uint256 payrollId, uint128 liquidity) = router.deposit(depositAmount, payrollDate, recipients);

        assertTrue(payrollId > 0, "Should receive payroll ID");
        assertTrue(liquidity > 0, "Should receive liquidity");

        LPPosition memory pos = router.getPosition(payrollId);
        assertEq(pos.payrollId, payrollId);
        assertEq(pos.liquidity, liquidity);
        assertEq(pos.provider, employer);
    }

    function test_CannotWithdrawEarly() public {
        uint256 payrollDate = block.timestamp + 30 days;

        PayrollRecipient[] memory recipients = new PayrollRecipient[](1);
        recipients[0] = PayrollRecipient({wallet: address(0x1), amount: 10_000e6});

        vm.prank(employer);
        (uint256 payrollId, ) = router.deposit(10_000e6, payrollDate, recipients);

        vm.prank(agent);
        vm.expectRevert(ArcFlowRouter.NotReady.selector);
        router.withdraw(payrollId);
    }

    function test_WithdrawAfterPayrollDate() public {
        uint256 payrollDate = block.timestamp + 30 days;

        PayrollRecipient[] memory recipients = new PayrollRecipient[](1);
        recipients[0] = PayrollRecipient({wallet: address(0x1), amount: 10_000e6});

        vm.prank(employer);
        (uint256 payrollId, ) = router.deposit(10_000e6, payrollDate, recipients);

        vm.warp(payrollDate + 1);

        vm.prank(agent);
        uint256 usdcBridged = router.withdraw(payrollId);

        assertTrue(usdcBridged > 0, "Should bridge USDC");
    }

    function test_OnlyAgentCanWithdraw() public {
        uint256 payrollDate = block.timestamp + 1;

        PayrollRecipient[] memory recipients = new PayrollRecipient[](1);
        recipients[0] = PayrollRecipient({wallet: address(0x1), amount: 10_000e6});

        vm.prank(employer);
        (uint256 payrollId, ) = router.deposit(10_000e6, payrollDate, recipients);

        vm.warp(payrollDate + 1);

        vm.prank(employer);
        vm.expectRevert("Unauth");
        router.withdraw(payrollId);
    }

    function test_GetReadyPayrolls() public {
        uint256 payrollDate1 = block.timestamp + 10 days;
        uint256 payrollDate2 = block.timestamp + 30 days;

        PayrollRecipient[] memory recipients = new PayrollRecipient[](1);
        recipients[0] = PayrollRecipient({wallet: address(0x1), amount: 5_000e6});

        vm.startPrank(employer);
        (uint256 payrollId1, ) = router.deposit(5_000e6, payrollDate1, recipients);
        router.deposit(5_000e6, payrollDate2, recipients);
        vm.stopPrank();

        uint256[] memory readyIds = router.getReadyPayrolls();
        assertEq(readyIds.length, 0, "No payrolls ready initially");

        vm.warp(payrollDate1 + 1);
        readyIds = router.getReadyPayrolls();
        assertEq(readyIds.length, 1, "One payroll ready");
        assertEq(readyIds[0], payrollId1);

        vm.warp(payrollDate2 + 1);
        readyIds = router.getReadyPayrolls();
        assertEq(readyIds.length, 2, "Both payrolls ready");
    }

    function test_ExecuteReadyPayrolls() public {
        uint256 payrollDate = block.timestamp + 10 days;

        PayrollRecipient[] memory recipients = new PayrollRecipient[](1);
        recipients[0] = PayrollRecipient({wallet: address(0x1), amount: 5_000e6});

        vm.startPrank(employer);
        router.deposit(5_000e6, payrollDate, recipients);
        router.deposit(5_000e6, payrollDate, recipients);
        vm.stopPrank();

        vm.warp(payrollDate + 1);

        vm.prank(agent);
        (uint256 executed, uint256 totalBridged) = router.executeReadyPayrolls();

        assertEq(executed, 2, "Should execute 2 payrolls");
        assertTrue(totalBridged > 0, "Should bridge USDC");
    }

    function test_StateManagerApyTracking() public {
        stateManager.configureChain(137, 7, address(0x456), address(0), true);

        vm.startPrank(agent);
        stateManager.updateChainApy(block.chainid, 300);
        stateManager.updateChainApy(137, 800);
        vm.stopPrank();

        (uint256 bestChainId, uint256 bestApy) = stateManager.getBestChainForApy();

        assertEq(bestChainId, 137, "Polygon should be best chain");
        assertEq(bestApy, 800, "Best APY should be 8%");
    }

    function test_MultiplePayrollsPerProvider() public {
        PayrollRecipient[] memory recipients = new PayrollRecipient[](1);
        recipients[0] = PayrollRecipient({wallet: address(0x1), amount: 3_000e6});

        vm.startPrank(employer);
        router.deposit(3_000e6, block.timestamp + 10 days, recipients);
        router.deposit(4_000e6, block.timestamp + 20 days, recipients);
        router.deposit(5_000e6, block.timestamp + 30 days, recipients);
        vm.stopPrank();

        uint256[] memory providerPayrollIds = router.getProviderPayrolls(employer);
        assertEq(providerPayrollIds.length, 3, "Should have 3 payrolls");
    }

    function test_ShouldMigrate() public {
        uint256 payrollDate = block.timestamp + 30 days;

        PayrollRecipient[] memory recipients = new PayrollRecipient[](1);
        recipients[0] = PayrollRecipient({wallet: address(0x1), amount: 10_000e6});

        vm.prank(employer);
        (uint256 payrollId, ) = router.deposit(10_000e6, payrollDate, recipients);

        // Configure another chain with better APY
        stateManager.configureChain(137, 7, address(0x456), address(0), true);

        vm.startPrank(agent);
        stateManager.updateChainApy(block.chainid, 300); // 3%
        stateManager.updateChainApy(137, 349); // 3.49% - diff = 49bps < 50bps, no migration
        vm.stopPrank();

        (bool migrate, uint256 targetChain, uint256 apyDiff) = migration.shouldMigrate(payrollId);
        assertFalse(migrate, "Should not migrate with <0.5% diff");

        vm.prank(agent);
        stateManager.updateChainApy(137, 350); // 3.5% - diff = 50bps, should migrate

        (migrate, targetChain, apyDiff) = migration.shouldMigrate(payrollId);
        assertTrue(migrate, "Should migrate with >=0.5% diff");
        assertEq(targetChain, 137);
    }

    function test_ZeroAmountReverts() public {
        PayrollRecipient[] memory recipients = new PayrollRecipient[](1);
        recipients[0] = PayrollRecipient({wallet: address(0x1), amount: 0});

        vm.prank(employer);
        vm.expectRevert(ArcFlowRouter.ZeroAmount.selector);
        router.deposit(0, block.timestamp + 30 days, recipients);
    }

    function test_InvalidDateReverts() public {
        PayrollRecipient[] memory recipients = new PayrollRecipient[](1);
        recipients[0] = PayrollRecipient({wallet: address(0x1), amount: 1000e6});

        vm.prank(employer);
        vm.expectRevert(ArcFlowRouter.InvalidDate.selector);
        router.deposit(1000e6, block.timestamp - 1, recipients);
    }

    function test_NoRecipientsReverts() public {
        PayrollRecipient[] memory recipients = new PayrollRecipient[](0);

        vm.prank(employer);
        vm.expectRevert(ArcFlowRouter.NoRecipients.selector);
        router.deposit(1000e6, block.timestamp + 30 days, recipients);
    }
}
