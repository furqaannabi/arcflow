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
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IGatewayWallet, IGatewayMinter} from "./interfaces/ICircleGateway.sol";
import {ArcFlowStateManager} from "./ArcFlowStateManager.sol";
import {LPPosition, CallbackData} from "./ArcFlowTypes.sol";

/// @title ArcFlow Base
/// @notice Base contract with storage and internal pool operations
abstract contract ArcFlowBase is IUnlockCallback {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;

    // ============ Constants ============

    int24 internal constant TICK_LOWER = -887220;
    int24 internal constant TICK_UPPER = 887220;

    // ============ Immutables ============

    IPoolManager public immutable poolManager;
    IERC20 public immutable usdc;
    IERC20 public immutable usdt;
    uint256 public immutable chainId;

    // ============ Storage ============

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

    // ============ Constructor ============

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

    // ============ Modifiers ============

    modifier onlyAgent() {
        require(msg.sender == agent || msg.sender == owner, "Unauthorized");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Unauthorized");
        _;
    }

    // ============ Internal: Swap ============

    function _swap(
        bool zeroForOne,
        uint256 amountIn
    ) internal returns (uint256 amountOut) {
        bytes memory swapData = abi.encode(zeroForOne, amountIn);
        CallbackData memory data = CallbackData({
            action: 2,
            sender: address(this),
            data: swapData
        });
        bytes memory result = poolManager.unlock(abi.encode(data));
        amountOut = abi.decode(result, (uint256));
    }

    // ============ Internal: Add Liquidity ============

    function _addLiquidity(
        uint256 amount0,
        uint256 amount1
    ) internal returns (uint128 liquidity) {
        liquidity = uint128(amount0 < amount1 ? amount0 : amount1);

        ModifyLiquidityParams memory params = ModifyLiquidityParams({
            tickLower: TICK_LOWER,
            tickUpper: TICK_UPPER,
            liquidityDelta: int256(uint256(liquidity)),
            salt: bytes32(0)
        });

        CallbackData memory data = CallbackData({
            action: 0,
            sender: address(this),
            data: abi.encode(params)
        });

        poolManager.unlock(abi.encode(data));
    }

    // ============ Internal: Remove Liquidity ============

    function _removeLiquidity(
        uint128 liquidity
    ) internal returns (uint256 amount0, uint256 amount1) {
        ModifyLiquidityParams memory params = ModifyLiquidityParams({
            tickLower: TICK_LOWER,
            tickUpper: TICK_UPPER,
            liquidityDelta: -int256(uint256(liquidity)),
            salt: bytes32(0)
        });

        CallbackData memory data = CallbackData({
            action: 1,
            sender: address(this),
            data: abi.encode(params)
        });

        bytes memory result = poolManager.unlock(abi.encode(data));
        (amount0, amount1) = abi.decode(result, (uint256, uint256));
    }

    // ============ Internal Helpers ============

    function _removePayroll(uint256 payrollId) internal {
        uint256 index = payrollIdIndex[payrollId];
        uint256 lastIndex = activePayrollIds.length - 1;

        if (index != lastIndex) {
            uint256 lastPayrollId = activePayrollIds[lastIndex];
            activePayrollIds[index] = lastPayrollId;
            payrollIdIndex[lastPayrollId] = index;
        }

        activePayrollIds.pop();
        delete payrollIdIndex[payrollId];
    }

    function _removeFromProviderPayrolls(
        address provider,
        uint256 payrollId
    ) internal {
        uint256[] storage payrolls = providerPayrolls[provider];
        for (uint256 i = 0; i < payrolls.length; i++) {
            if (payrolls[i] == payrollId) {
                payrolls[i] = payrolls[payrolls.length - 1];
                payrolls.pop();
                break;
            }
        }
    }

    // ============ Unlock Callback ============

    function unlockCallback(
        bytes calldata rawData
    ) external override returns (bytes memory) {
        require(msg.sender == address(poolManager), "Only PoolManager");

        CallbackData memory data = abi.decode(rawData, (CallbackData));

        if (data.action == 0) {
            return _handleAddLiquidity(data.data);
        } else if (data.action == 1) {
            return _handleRemoveLiquidity(data.data);
        } else if (data.action == 2) {
            return _handleSwap(data.data);
        }

        return "";
    }

    function _handleAddLiquidity(
        bytes memory data
    ) internal returns (bytes memory) {
        ModifyLiquidityParams memory params = abi.decode(
            data,
            (ModifyLiquidityParams)
        );
        (BalanceDelta delta, ) = poolManager.modifyLiquidity(poolKey, params, "");

        if (delta.amount0() < 0) {
            uint256 amt = uint256(uint128(-delta.amount0()));
            poolManager.sync(poolKey.currency0);
            usdc.transfer(address(poolManager), amt);
            poolManager.settle();
        }
        if (delta.amount1() < 0) {
            uint256 amt = uint256(uint128(-delta.amount1()));
            poolManager.sync(poolKey.currency1);
            usdt.transfer(address(poolManager), amt);
            poolManager.settle();
        }
        return "";
    }

    function _handleRemoveLiquidity(
        bytes memory data
    ) internal returns (bytes memory) {
        ModifyLiquidityParams memory params = abi.decode(
            data,
            (ModifyLiquidityParams)
        );
        (BalanceDelta delta, ) = poolManager.modifyLiquidity(poolKey, params, "");

        uint256 amt0 = 0;
        uint256 amt1 = 0;

        if (delta.amount0() > 0) {
            amt0 = uint256(uint128(delta.amount0()));
            poolManager.take(poolKey.currency0, address(this), amt0);
        }
        if (delta.amount1() > 0) {
            amt1 = uint256(uint128(delta.amount1()));
            poolManager.take(poolKey.currency1, address(this), amt1);
        }
        return abi.encode(amt0, amt1);
    }

    function _handleSwap(bytes memory data) internal returns (bytes memory) {
        (bool zeroForOne, uint256 amountIn) = abi.decode(data, (bool, uint256));

        BalanceDelta delta = poolManager.swap(
            poolKey,
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: -int256(amountIn),
                sqrtPriceLimitX96: zeroForOne
                    ? 4295128740
                    : 1461446703485210103287273052203988822378723970341
            }),
            ""
        );

        uint256 amountOut;

        if (zeroForOne) {
            if (delta.amount0() < 0) {
                uint256 amt = uint256(uint128(-delta.amount0()));
                poolManager.sync(poolKey.currency0);
                usdc.transfer(address(poolManager), amt);
                poolManager.settle();
            }
            if (delta.amount1() > 0) {
                amountOut = uint256(uint128(delta.amount1()));
                poolManager.take(poolKey.currency1, address(this), amountOut);
            }
        } else {
            if (delta.amount1() < 0) {
                uint256 amt = uint256(uint128(-delta.amount1()));
                poolManager.sync(poolKey.currency1);
                usdt.transfer(address(poolManager), amt);
                poolManager.settle();
            }
            if (delta.amount0() > 0) {
                amountOut = uint256(uint128(delta.amount0()));
                poolManager.take(poolKey.currency0, address(this), amountOut);
            }
        }

        return abi.encode(amountOut);
    }

    // ============ Ready Payrolls (View) ============

    /// @notice Get all payroll IDs that are ready to execute
    function getReadyPayrolls() external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < activePayrollIds.length; i++) {
            if (block.timestamp >= positions[activePayrollIds[i]].payrollDate) {
                count++;
            }
        }

        uint256[] memory ready = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < activePayrollIds.length; i++) {
            uint256 pid = activePayrollIds[i];
            if (block.timestamp >= positions[pid].payrollDate) {
                ready[idx++] = pid;
            }
        }
        return ready;
    }

    /// @notice Check if a specific payroll is ready
    function isPayrollReady(uint256 payrollId) external view returns (bool) {
        LPPosition memory pos = positions[payrollId];
        return pos.liquidity > 0 && block.timestamp >= pos.payrollDate && pos.currentChainId == chainId;
    }
}
