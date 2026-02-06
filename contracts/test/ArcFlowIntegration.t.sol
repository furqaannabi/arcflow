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
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

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
    using MessageHashUtils for bytes32;

    ArcFlowRouter router;
    ArcFlowStateManager stateManager;
    ArcFlowMigration migration;
    MockGatewayWallet gatewayWallet;
    MockGatewayMinter gatewayMinter;

    MockERC20 usdc;
    MockERC20 usdt;

    uint256 agentPrivateKey = 0xA6E47;
    address agent;
    address employer = address(0xE43107E8);

    PoolKey poolKey;
    PoolId poolId;

    uint256 constant INITIAL_BALANCE = 1_000_000e6;
    uint32 constant CIRCLE_DOMAIN = 0;

    function setUp() public {
        agent = vm.addr(agentPrivateKey);
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
        router.setMigration(address(migration));
        migration.setAgent(agent);
        migration.setGatewayMinter(address(gatewayMinter));

        stateManager.setAgentAuthorization(agent, true);
        stateManager.setAgentAuthorization(address(router), true);
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

    /// @notice Helper to create a signed channel state for testing
    function _signChannelState(bytes32 channelId, uint256 payrollId, uint256 amount) internal view returns (bytes memory) {
        bytes32 stateHash = keccak256(abi.encodePacked(channelId, payrollId, amount));
        bytes32 ethSignedHash = stateHash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agentPrivateKey, ethSignedHash);
        return abi.encodePacked(r, s, v);
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

        LPPosition memory pos = router.getPos(payrollId);
        assertEq(pos.payrollId, payrollId);
        assertEq(pos.liquidity, liquidity);
        assertEq(pos.provider, employer);
    }

    function test_CannotSettleEarly() public {
        uint256 payrollDate = block.timestamp + 30 days;
        uint256 depositAmount = 10_000e6;

        PayrollRecipient[] memory recipients = new PayrollRecipient[](1);
        recipients[0] = PayrollRecipient({wallet: address(0x1), amount: depositAmount});

        vm.prank(employer);
        (uint256 payrollId, ) = router.deposit(depositAmount, payrollDate, recipients);

        bytes32 channelId = keccak256(abi.encodePacked("channel", payrollId));
        bytes memory signature = _signChannelState(channelId, payrollId, depositAmount);

        vm.prank(agent);
        vm.expectRevert(ArcFlowRouter.NotReady.selector);
        router.settle(payrollId, channelId, signature);
    }

    function test_SettleAfterPayrollDate() public {
        uint256 payrollDate = block.timestamp + 30 days;
        uint256 depositAmount = 10_000e6;

        PayrollRecipient[] memory recipients = new PayrollRecipient[](1);
        recipients[0] = PayrollRecipient({wallet: address(0x1), amount: depositAmount});

        vm.prank(employer);
        (uint256 payrollId, ) = router.deposit(depositAmount, payrollDate, recipients);

        vm.warp(payrollDate + 1);

        bytes32 channelId = keccak256(abi.encodePacked("channel", payrollId));
        bytes memory signature = _signChannelState(channelId, payrollId, depositAmount);

        vm.prank(agent);
        uint256 usdcBridged = router.settle(payrollId, channelId, signature);

        assertTrue(usdcBridged > 0, "Should bridge USDC");
    }

    function test_OnlyAgentCanSettle() public {
        uint256 payrollDate = block.timestamp + 1;
        uint256 depositAmount = 10_000e6;

        PayrollRecipient[] memory recipients = new PayrollRecipient[](1);
        recipients[0] = PayrollRecipient({wallet: address(0x1), amount: depositAmount});

        vm.prank(employer);
        (uint256 payrollId, ) = router.deposit(depositAmount, payrollDate, recipients);

        vm.warp(payrollDate + 1);

        bytes32 channelId = keccak256(abi.encodePacked("channel", payrollId));
        bytes memory signature = _signChannelState(channelId, payrollId, depositAmount);

        vm.prank(employer);
        vm.expectRevert("Unauth");
        router.settle(payrollId, channelId, signature);
    }

    function test_InvalidChannelSignatureReverts() public {
        uint256 payrollDate = block.timestamp + 1;
        uint256 depositAmount = 10_000e6;

        PayrollRecipient[] memory recipients = new PayrollRecipient[](1);
        recipients[0] = PayrollRecipient({wallet: address(0x1), amount: depositAmount});

        vm.prank(employer);
        (uint256 payrollId, ) = router.deposit(depositAmount, payrollDate, recipients);

        vm.warp(payrollDate + 1);

        bytes32 channelId = keccak256(abi.encodePacked("channel", payrollId));
        // Sign with wrong amount to create invalid signature
        bytes memory badSignature = _signChannelState(channelId, payrollId, depositAmount + 1);

        vm.prank(agent);
        vm.expectRevert(ArcFlowRouter.InvalidChannelState.selector);
        router.settle(payrollId, channelId, badSignature);
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

    function test_SettleMultiplePayrolls() public {
        uint256 payrollDate = block.timestamp + 10 days;
        uint256 depositAmount = 5_000e6;

        PayrollRecipient[] memory recipients = new PayrollRecipient[](1);
        recipients[0] = PayrollRecipient({wallet: address(0x1), amount: depositAmount});

        vm.startPrank(employer);
        (uint256 payrollId1, ) = router.deposit(depositAmount, payrollDate, recipients);
        (uint256 payrollId2, ) = router.deposit(depositAmount, payrollDate, recipients);
        vm.stopPrank();

        vm.warp(payrollDate + 1);

        // Settle first payroll
        bytes32 channelId1 = keccak256(abi.encodePacked("channel", payrollId1));
        bytes memory sig1 = _signChannelState(channelId1, payrollId1, depositAmount);
        vm.prank(agent);
        uint256 bridged1 = router.settle(payrollId1, channelId1, sig1);

        // Settle second payroll
        bytes32 channelId2 = keccak256(abi.encodePacked("channel", payrollId2));
        bytes memory sig2 = _signChannelState(channelId2, payrollId2, depositAmount);
        vm.prank(agent);
        uint256 bridged2 = router.settle(payrollId2, channelId2, sig2);

        assertTrue(bridged1 > 0, "Should bridge first payroll");
        assertTrue(bridged2 > 0, "Should bridge second payroll");

        // Verify positions are deleted
        LPPosition memory pos1 = router.getPos(payrollId1);
        LPPosition memory pos2 = router.getPos(payrollId2);
        assertEq(pos1.liquidity, 0, "First position should be deleted");
        assertEq(pos2.liquidity, 0, "Second position should be deleted");
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
