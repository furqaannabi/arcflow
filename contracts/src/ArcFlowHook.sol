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
import {Currency} from "v4-core/src/types/Currency.sol";
import {DepositData} from "./structs/ArcFlowHookStructs.sol";

/// @title ArcFlow Payroll Guard Hook
/// @notice Uniswap v4 hook that tracks deposits - router handles token transfers
contract ArcFlowHook is BaseHook, Ownable {
    using PoolIdLibrary for PoolKey;

    // ============ Events ============
    event TreasuryDeposit(
        PoolId indexed poolId,
        address indexed depositor,
        uint256 amount0,
        uint256 amount1
    );
    event WithdrawalTracked(PoolId indexed poolId, address indexed recipient);

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

            // Delta is negative when adding (we owe pool)
            int128 d0 = delta.amount0();
            int128 d1 = delta.amount1();
            uint256 amt0 = d0 < 0 ? uint256(uint128(-d0)) : 0;
            uint256 amt1 = d1 < 0 ? uint256(uint128(-d1)) : 0;

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
        BalanceDelta,
        BalanceDelta,
        bytes calldata hookData
    ) internal override returns (bytes4, BalanceDelta) {
        // Just track - router handles token transfers
        address recipient = hookData.length > 0
            ? abi.decode(hookData, (address))
            : msg.sender;

        PoolId poolId = key.toId();
        delete poolDeposits[poolId];

        emit WithdrawalTracked(poolId, recipient);
        return (this.afterRemoveLiquidity.selector, BalanceDelta.wrap(0));
    }

    // ============ View Functions ============
    function getPoolDeposits(
        PoolId poolId
    ) external view returns (DepositData memory) {
        return poolDeposits[poolId];
    }
}
