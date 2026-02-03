// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseHook} from "@openzeppelin/uniswap-hooks/src/base/BaseHook.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {
    BeforeSwapDelta,
    BeforeSwapDeltaLibrary
} from "v4-core/src/types/BeforeSwapDelta.sol";
import {
    SwapParams,
    ModifyLiquidityParams
} from "v4-core/src/types/PoolOperation.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {DepositData} from "./structs/ArcFlowHookStructs.sol";

/// @title ArcFlow Payroll Guard Hook
/// @notice Uniswap v4 hook that tracks deposits and handles withdrawals
contract ArcFlowHook is BaseHook, Ownable {
    using PoolIdLibrary for PoolKey;

    // ============ Events ============
    event TreasuryDeposit(
        PoolId indexed poolId,
        address indexed depositor,
        uint256 amount0,
        uint256 amount1
    );
    event WithdrawalExecuted(
        PoolId indexed poolId,
        address indexed recipient,
        uint256 totalUsdc
    );
    event TokensSwapped(
        address indexed tokenIn,
        uint256 amountIn,
        uint256 usdcOut
    );

    // ============ Errors ============
    error ZeroAddress();

    // ============ State Variables ============
    address public usdc;
    mapping(PoolId => DepositData) public poolDeposits;

    // ============ Constructor ============
    constructor(
        IPoolManager _poolManager,
        address _usdc
    ) BaseHook(_poolManager) Ownable(msg.sender) {
        usdc = _usdc;
    }

    // ============ Admin Functions ============
    function setUsdc(address _usdc) external onlyOwner {
        if (_usdc == address(0)) revert ZeroAddress();
        usdc = _usdc;
    }

    // ============ Hook Permissions ============
    function getHookPermissions()
        public
        pure
        override
        returns (Hooks.Permissions memory)
    {
        return
            Hooks.Permissions({
                beforeInitialize: false,
                afterInitialize: false,
                beforeAddLiquidity: false,
                afterAddLiquidity: true,
                beforeRemoveLiquidity: false,
                afterRemoveLiquidity: true,
                beforeSwap: false,
                afterSwap: false,
                beforeDonate: false,
                afterDonate: false,
                beforeSwapReturnDelta: false,
                afterSwapReturnDelta: false,
                afterAddLiquidityReturnDelta: false,
                afterRemoveLiquidityReturnDelta: false
            });
    }

    // ============ Hook Callbacks ============

    function _afterAddLiquidity(
        address sender,
        PoolKey calldata key,
        ModifyLiquidityParams calldata params,
        BalanceDelta delta,
        BalanceDelta,
        bytes calldata
    ) internal override returns (bytes4, BalanceDelta) {
        if (params.liquidityDelta > 0) {
            PoolId poolId = key.toId();
            uint256 amt0 = delta.amount0() > 0
                ? uint256(uint128(delta.amount0()))
                : 0;
            uint256 amt1 = delta.amount1() > 0
                ? uint256(uint128(delta.amount1()))
                : 0;

            poolDeposits[poolId] = DepositData({
                tokenA: Currency.unwrap(key.currency0),
                tokenB: Currency.unwrap(key.currency1),
                amountA: amt0,
                amountB: amt1,
                timestamp: block.timestamp
            });

            emit TreasuryDeposit(poolId, sender, amt0, amt1);
        }
        return (this.afterAddLiquidity.selector, BalanceDelta.wrap(0));
    }

    function _afterRemoveLiquidity(
        address,
        PoolKey calldata key,
        ModifyLiquidityParams calldata,
        BalanceDelta delta,
        BalanceDelta,
        bytes calldata hookData
    ) internal override returns (bytes4, BalanceDelta) {
        address recipient = hookData.length > 0
            ? abi.decode(hookData, (address))
            : msg.sender;

        uint256 totalUsdc = _processWithdrawal(key, delta);

        if (totalUsdc > 0) {
            IERC20(usdc).transfer(recipient, totalUsdc);
        }

        emit WithdrawalExecuted(key.toId(), recipient, totalUsdc);
        return (this.afterRemoveLiquidity.selector, BalanceDelta.wrap(0));
    }

    // ============ Internal Functions ============

    function _processWithdrawal(
        PoolKey calldata key,
        BalanceDelta delta
    ) internal returns (uint256 totalUsdc) {
        delete poolDeposits[key.toId()];

        uint256 amt0 = delta.amount0() < 0
            ? uint256(uint128(-delta.amount0()))
            : 0;
        uint256 amt1 = delta.amount1() < 0
            ? uint256(uint128(-delta.amount1()))
            : 0;

        address token0 = Currency.unwrap(key.currency0);
        address token1 = Currency.unwrap(key.currency1);

        if (amt0 > 0) {
            totalUsdc += (token0 == usdc)
                ? amt0
                : _swapToUsdc(key, token0, amt0);
        }
        if (amt1 > 0) {
            totalUsdc += (token1 == usdc)
                ? amt1
                : _swapToUsdc(key, token1, amt1);
        }
    }

    function _swapToUsdc(
        PoolKey calldata key,
        address tokenIn,
        uint256 amountIn
    ) internal returns (uint256 usdcOut) {
        address token0 = Currency.unwrap(key.currency0);
        bool zeroForOne = (tokenIn == token0);

        BalanceDelta swapDelta = poolManager.swap(
            key,
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: -int256(amountIn),
                sqrtPriceLimitX96: zeroForOne
                    ? 4295128740
                    : 1461446703485210103287273052203988822378723970341
            }),
            ""
        );

        int128 usdcDelta = zeroForOne
            ? swapDelta.amount1()
            : swapDelta.amount0();
        usdcOut = usdcDelta > 0 ? uint256(uint128(usdcDelta)) : 0;

        emit TokensSwapped(tokenIn, amountIn, usdcOut);
    }

    // ============ View Functions ============
    function getPoolDeposits(
        PoolId poolId
    ) external view returns (DepositData memory) {
        return poolDeposits[poolId];
    }
}
