// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ArcFlowHook} from "./ArcFlowHook.sol";

/// @title ArcFlow Router
/// @notice Helper contract for interacting with ArcFlowHook pools
contract ArcFlowRouter {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;

    // ============ State ============

    IPoolManager public immutable poolManager;
    ArcFlowHook public immutable hook;
    address public agent;
    address public owner;

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

    /// @notice Create a new pool with the ArcFlowHook
    /// @param token0 First token (must be lower address)
    /// @param token1 Second token (must be higher address)
    /// @param fee Pool fee in hundredths of a bip (e.g., 3000 = 0.3%)
    /// @param sqrtPriceX96 Initial sqrt price
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

    /// @notice Add liquidity to pool (treasury deposit)
    /// @param key The pool key
    /// @param amount0Desired Amount of token0 to add
    /// @param amount1Desired Amount of token1 to add
    /// @param tickLower Lower tick bound (-887220 for full range)
    /// @param tickUpper Upper tick bound (887220 for full range)
    function addLiquidity(
        PoolKey calldata key,
        uint256 amount0Desired,
        uint256 amount1Desired,
        int24 tickLower,
        int24 tickUpper
    ) external returns (uint128 liquidity) {
        // Transfer tokens from sender
        address token0 = Currency.unwrap(key.currency0);
        address token1 = Currency.unwrap(key.currency1);

        IERC20(token0).safeTransferFrom(
            msg.sender,
            address(this),
            amount0Desired
        );
        IERC20(token1).safeTransferFrom(
            msg.sender,
            address(this),
            amount1Desired
        );

        // Approve pool manager
        IERC20(token0).approve(address(poolManager), amount0Desired);
        IERC20(token1).approve(address(poolManager), amount1Desired);

        // Calculate liquidity from amounts (simplified - use smaller amount as basis)
        // For production, use proper LiquidityAmounts library with price
        liquidity = uint128(
            amount0Desired < amount1Desired ? amount0Desired : amount1Desired
        );

        if (liquidity == 0) revert ZeroLiquidity();

        // Add liquidity - hook will track deposit
        poolManager.modifyLiquidity(
            key,
            ModifyLiquidityParams({
                tickLower: tickLower,
                tickUpper: tickUpper,
                liquidityDelta: int256(uint256(liquidity)),
                salt: bytes32(0)
            }),
            "" // No hookData needed for deposits
        );

        emit LiquidityAdded(key.toId(), msg.sender, liquidity);
    }

    /// @notice Add full-range liquidity (simplest option)
    function addFullRangeLiquidity(
        PoolKey calldata key,
        uint256 amount0,
        uint256 amount1
    ) external returns (uint128 liquidity) {
        return this.addLiquidity(key, amount0, amount1, -887220, 887220);
    }

    /// @notice Remove liquidity (agent only)
    /// @param key The pool key
    /// @param liquidity Amount of liquidity to remove
    /// @param tickLower Lower tick bound
    /// @param tickUpper Upper tick bound
    /// @param recipient Address to receive USDC
    function removeLiquidity(
        PoolKey calldata key,
        uint128 liquidity,
        int24 tickLower,
        int24 tickUpper,
        address recipient
    ) external onlyAgent {
        // Encode recipient for hook
        bytes memory hookData = abi.encode(recipient);

        poolManager.modifyLiquidity(
            key,
            ModifyLiquidityParams({
                tickLower: tickLower,
                tickUpper: tickUpper,
                liquidityDelta: -int256(uint256(liquidity)),
                salt: bytes32(0)
            }),
            hookData
        );

        emit LiquidityRemoved(key.toId(), msg.sender, liquidity);
    }

    // ============ View Functions ============

    /// @notice Get pool key for token pair
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

    /// @notice Get pool deposit info from hook
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
        return 60; // Default
    }
}
