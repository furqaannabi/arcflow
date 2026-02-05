// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IGatewayWallet, IGatewayMinter} from "./interfaces/ICircleGateway.sol";
import {ArcFlowStateManager} from "./ArcFlowStateManager.sol";
import {LPPosition, CallbackData} from "./ArcFlowTypes.sol";

/// @title ArcFlow Base
abstract contract ArcFlowBase is IUnlockCallback {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;

    int24 internal constant TICK_LOWER = -887220;
    int24 internal constant TICK_UPPER = 887220;

    IPoolManager public immutable poolManager;
    IERC20 public immutable usdc;
    IERC20 public immutable usdt;
    uint256 public immutable chainId;

    PoolKey public poolKey;
    PoolId public poolId;
    IGatewayWallet public gatewayWallet;
    IGatewayMinter public gatewayMinter;
    ArcFlowStateManager public stateManager;
    address public agent;
    address public owner;

    mapping(uint256 => LPPosition) public positions;
    mapping(address => uint256[]) public providerPayrolls;
    uint256[] public activePayrollIds;
    mapping(uint256 => uint256) public payrollIdIndex;
    uint256 public totalLiquidity;
    uint256 public nextPayrollId;

    constructor(
        IPoolManager _poolManager,
        PoolKey memory _existingPoolKey,
        address _gatewayWallet,
        address _stateManager
    ) {
        poolManager = _poolManager;
        poolKey = _existingPoolKey;
        poolId = _existingPoolKey.toId();
        owner = msg.sender;
        gatewayWallet = IGatewayWallet(_gatewayWallet);
        stateManager = ArcFlowStateManager(_stateManager);
        chainId = block.chainid;
        usdc = IERC20(Currency.unwrap(_existingPoolKey.currency0));
        usdt = IERC20(Currency.unwrap(_existingPoolKey.currency1));
    }

    modifier onlyAgent() {
        require(msg.sender == agent || msg.sender == owner, "Unauth");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Unauth");
        _;
    }

    function _swap(bool zeroForOne, uint256 amountIn) internal returns (uint256) {
        bytes memory result = poolManager.unlock(abi.encode(CallbackData(2, address(this), abi.encode(zeroForOne, amountIn))));
        return abi.decode(result, (uint256));
    }

    function _addLiquidity(uint256 a0, uint256 a1) internal returns (uint128 liq) {
        liq = uint128(a0 < a1 ? a0 : a1);
        poolManager.unlock(abi.encode(CallbackData(0, address(this), abi.encode(ModifyLiquidityParams(TICK_LOWER, TICK_UPPER, int256(uint256(liq)), bytes32(0))))));
    }

    function _removeLiquidity(uint128 liq) internal returns (uint256 a0, uint256 a1) {
        bytes memory result = poolManager.unlock(abi.encode(CallbackData(1, address(this), abi.encode(ModifyLiquidityParams(TICK_LOWER, TICK_UPPER, -int256(uint256(liq)), bytes32(0))))));
        (a0, a1) = abi.decode(result, (uint256, uint256));
    }

    function _removePayroll(uint256 pid) internal {
        uint256 idx = payrollIdIndex[pid];
        uint256 last = activePayrollIds.length - 1;
        if (idx != last) {
            uint256 lastPid = activePayrollIds[last];
            activePayrollIds[idx] = lastPid;
            payrollIdIndex[lastPid] = idx;
        }
        activePayrollIds.pop();
        delete payrollIdIndex[pid];
    }

    function _removeFromProviderPayrolls(address provider, uint256 pid) internal {
        uint256[] storage arr = providerPayrolls[provider];
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i] == pid) {
                arr[i] = arr[arr.length - 1];
                arr.pop();
                break;
            }
        }
    }

    function unlockCallback(bytes calldata rawData) external override returns (bytes memory) {
        require(msg.sender == address(poolManager), "Only PM");
        CallbackData memory d = abi.decode(rawData, (CallbackData));
        if (d.action == 0) return _handleAdd(d.data);
        if (d.action == 1) return _handleRemove(d.data);
        return _handleSwap(d.data);
    }

    function _handleAdd(bytes memory data) internal returns (bytes memory) {
        (BalanceDelta delta, ) = poolManager.modifyLiquidity(poolKey, abi.decode(data, (ModifyLiquidityParams)), "");
        if (delta.amount0() < 0) { poolManager.sync(poolKey.currency0); usdc.transfer(address(poolManager), uint256(uint128(-delta.amount0()))); poolManager.settle(); }
        if (delta.amount1() < 0) { poolManager.sync(poolKey.currency1); usdt.transfer(address(poolManager), uint256(uint128(-delta.amount1()))); poolManager.settle(); }
        return "";
    }

    function _handleRemove(bytes memory data) internal returns (bytes memory) {
        (BalanceDelta delta, ) = poolManager.modifyLiquidity(poolKey, abi.decode(data, (ModifyLiquidityParams)), "");
        uint256 a0; uint256 a1;
        if (delta.amount0() > 0) { a0 = uint256(uint128(delta.amount0())); poolManager.take(poolKey.currency0, address(this), a0); }
        if (delta.amount1() > 0) { a1 = uint256(uint128(delta.amount1())); poolManager.take(poolKey.currency1, address(this), a1); }
        return abi.encode(a0, a1);
    }

    function _handleSwap(bytes memory data) internal returns (bytes memory) {
        (bool zeroForOne, uint256 amtIn) = abi.decode(data, (bool, uint256));
        BalanceDelta delta = poolManager.swap(poolKey, SwapParams(zeroForOne, -int256(amtIn), zeroForOne ? 4295128740 : 1461446703485210103287273052203988822378723970341), "");
        uint256 out;
        if (zeroForOne) {
            if (delta.amount0() < 0) { poolManager.sync(poolKey.currency0); usdc.transfer(address(poolManager), uint256(uint128(-delta.amount0()))); poolManager.settle(); }
            if (delta.amount1() > 0) { out = uint256(uint128(delta.amount1())); poolManager.take(poolKey.currency1, address(this), out); }
        } else {
            if (delta.amount1() < 0) { poolManager.sync(poolKey.currency1); usdt.transfer(address(poolManager), uint256(uint128(-delta.amount1()))); poolManager.settle(); }
            if (delta.amount0() > 0) { out = uint256(uint128(delta.amount0())); poolManager.take(poolKey.currency0, address(this), out); }
        }
        return abi.encode(out);
    }

    function getReadyPayrolls() external view returns (uint256[] memory) {
        uint256 cnt = 0;
        for (uint256 i = 0; i < activePayrollIds.length; i++) {
            if (block.timestamp >= positions[activePayrollIds[i]].payrollDate) cnt++;
        }
        uint256[] memory r = new uint256[](cnt);
        uint256 idx = 0;
        for (uint256 i = 0; i < activePayrollIds.length; i++) {
            uint256 pid = activePayrollIds[i];
            if (block.timestamp >= positions[pid].payrollDate) r[idx++] = pid;
        }
        return r;
    }

    function isPayrollReady(uint256 pid) external view returns (bool) {
        LPPosition memory p = positions[pid];
        return p.liquidity > 0 && block.timestamp >= p.payrollDate && p.currentChainId == chainId;
    }
}
