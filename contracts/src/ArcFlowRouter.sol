// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {
    IUnlockCallback
} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";
import {BalanceDelta, toBalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ArcFlowHook} from "./ArcFlowHook.sol";

/// @title ArcFlow Router
/// @notice Helper contract for interacting with ArcFlowHook pools via unlock callback
contract ArcFlowRouter is IUnlockCallback {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;

    // ============ State ============

    IPoolManager public immutable poolManager;
    ArcFlowHook public immutable hook;
    address public agent;
    address public owner;

    // Callback data struct
    struct CallbackData {
        PoolKey key;
        ModifyLiquidityParams params;
        bytes hookData;
        address sender;
        bool isAdd;
    }

    // ============ Events ============

    event PoolCreated(PoolId indexed poolId, address token0, address token1);
    event LiquidityAdded(
        PoolId indexed poolId,
        address indexed provider,
        uint128 liquidity
    );
    event LiquidityRemoved(
        PoolId indexed poolId,
        address indexed provider,
        uint128 liquidity
    );
    event AgentUpdated(address indexed oldAgent, address indexed newAgent);

    // ============ Errors ============

    error InvalidTokenOrder();
    error ZeroLiquidity();
    error Unauthorized();

    // ============ Modifiers ============

    modifier onlyAgent() {
        if (msg.sender != agent && msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    // ============ Constructor ============

    constructor(IPoolManager _poolManager, ArcFlowHook _hook) {
        poolManager = _poolManager;
        hook = _hook;
        owner = msg.sender;
    }

    // ============ Admin ============

    function setAgent(address _agent) external onlyOwner {
        emit AgentUpdated(agent, _agent);
        agent = _agent;
    }

    // ============ Pool Creation ============

    function createPool(
        address token0,
        address token1,
        uint24 fee,
        uint160 sqrtPriceX96
    ) external returns (PoolKey memory key, PoolId poolId) {
        if (token0 >= token1) revert InvalidTokenOrder();

        key = PoolKey({
            currency0: Currency.wrap(token0),
            currency1: Currency.wrap(token1),
            fee: fee,
            tickSpacing: _getTickSpacing(fee),
            hooks: IHooks(address(hook))
        });

        poolId = key.toId();
        poolManager.initialize(key, sqrtPriceX96);

        emit PoolCreated(poolId, token0, token1);
    }

    // ============ Liquidity Operations ============

    function addLiquidity(
        PoolKey calldata key,
        uint256 amount0,
        uint256 amount1,
        int24 tickLower,
        int24 tickUpper
    ) external returns (uint128 liquidity) {
        address token0 = Currency.unwrap(key.currency0);
        address token1 = Currency.unwrap(key.currency1);

        // Transfer tokens from sender to this contract
        IERC20(token0).safeTransferFrom(msg.sender, address(this), amount0);
        IERC20(token1).safeTransferFrom(msg.sender, address(this), amount1);

        // Calculate liquidity
        liquidity = uint128(amount0 < amount1 ? amount0 : amount1);
        if (liquidity == 0) revert ZeroLiquidity();

        // Create params
        ModifyLiquidityParams memory params = ModifyLiquidityParams({
            tickLower: tickLower,
            tickUpper: tickUpper,
            liquidityDelta: int256(uint256(liquidity)),
            salt: bytes32(0)
        });

        // Call through unlock
        CallbackData memory data = CallbackData({
            key: key,
            params: params,
            hookData: "",
            sender: msg.sender,
            isAdd: true
        });

        poolManager.unlock(abi.encode(data));

        emit LiquidityAdded(key.toId(), msg.sender, liquidity);
    }

    function addFullRangeLiquidity(
        PoolKey calldata key,
        uint256 amount0,
        uint256 amount1
    ) external returns (uint128 liquidity) {
        return this.addLiquidity(key, amount0, amount1, -887220, 887220);
    }

    function removeLiquidity(
        PoolKey calldata key,
        uint128 liquidity,
        int24 tickLower,
        int24 tickUpper,
        address recipient
    ) external onlyAgent {
        ModifyLiquidityParams memory params = ModifyLiquidityParams({
            tickLower: tickLower,
            tickUpper: tickUpper,
            liquidityDelta: -int256(uint256(liquidity)),
            salt: bytes32(0)
        });

        CallbackData memory data = CallbackData({
            key: key,
            params: params,
            hookData: abi.encode(recipient),
            sender: msg.sender,
            isAdd: false
        });

        poolManager.unlock(abi.encode(data));

        emit LiquidityRemoved(key.toId(), msg.sender, liquidity);
    }

    // ============ Unlock Callback ============

    function unlockCallback(
        bytes calldata rawData
    ) external override returns (bytes memory) {
        require(msg.sender == address(poolManager), "Only PoolManager");

        CallbackData memory data = abi.decode(rawData, (CallbackData));

        // Perform the liquidity modification
        (BalanceDelta delta, ) = poolManager.modifyLiquidity(
            data.key,
            data.params,
            data.hookData
        );

        // Handle delta settlement
        int128 delta0 = delta.amount0();
        int128 delta1 = delta.amount1();

        if (data.isAdd) {
            // Adding liquidity: delta is NEGATIVE (we owe tokens to pool)
            // We need to sync, transfer tokens, then settle
            if (delta0 < 0) {
                uint256 amount = uint256(uint128(-delta0));
                poolManager.sync(data.key.currency0);
                IERC20(Currency.unwrap(data.key.currency0)).transfer(
                    address(poolManager),
                    amount
                );
                poolManager.settle();
            }
            if (delta1 < 0) {
                uint256 amount = uint256(uint128(-delta1));
                poolManager.sync(data.key.currency1);
                IERC20(Currency.unwrap(data.key.currency1)).transfer(
                    address(poolManager),
                    amount
                );
                poolManager.settle();
            }
        } else {
            // Removing liquidity: delta is POSITIVE (pool owes us tokens)
            // Take the tokens from pool manager and send to recipient
            address recipient = abi.decode(data.hookData, (address));

            if (delta0 > 0) {
                uint256 amount = uint256(uint128(delta0));
                poolManager.take(data.key.currency0, address(this), amount);
                IERC20(Currency.unwrap(data.key.currency0)).transfer(
                    recipient,
                    amount
                );
            }
            if (delta1 > 0) {
                uint256 amount = uint256(uint128(delta1));
                poolManager.take(data.key.currency1, address(this), amount);
                IERC20(Currency.unwrap(data.key.currency1)).transfer(
                    recipient,
                    amount
                );
            }
        }

        return "";
    }

    // ============ View Functions ============

    function getPoolKey(
        address token0,
        address token1,
        uint24 fee
    ) external view returns (PoolKey memory) {
        return
            PoolKey({
                currency0: Currency.wrap(token0),
                currency1: Currency.wrap(token1),
                fee: fee,
                tickSpacing: _getTickSpacing(fee),
                hooks: IHooks(address(hook))
            });
    }

    function getPoolDeposit(
        PoolId poolId
    )
        external
        view
        returns (
            address tokenA,
            address tokenB,
            uint256 amountA,
            uint256 amountB,
            uint256 timestamp
        )
    {
        (tokenA, tokenB, amountA, amountB, timestamp) = hook.poolDeposits(
            poolId
        );
    }

    // ============ Internal ============

    function _getTickSpacing(uint24 fee) internal pure returns (int24) {
        if (fee == 500) return 10;
        if (fee == 3000) return 60;
        if (fee == 10000) return 200;
        return 60;
    }
}
