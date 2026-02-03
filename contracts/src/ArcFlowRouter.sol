// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {
    IUnlockCallback
} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {
    ModifyLiquidityParams,
    SwapParams
} from "v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IGatewayWallet} from "./interfaces/ICircleGateway.sol";

/// @title ArcFlow Router
/// @notice Single-sided USDC deposit into existing USDC-USDT pool
/// @dev User deposits USDC only - 50% swapped to USDT for LP, swapped back on withdrawal
contract ArcFlowRouter is IUnlockCallback {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;

    // ============ Structs ============

    struct CallbackData {
        uint8 action; // 0=addLiquidity, 1=removeLiquidity, 2=swap
        address sender;
        bytes data;
    }

    struct LPPosition {
        uint256 payrollId;
        uint128 liquidity;
        uint256 usdcDeposited;
        uint256 depositTime;
        uint256 payrollDate;
        bytes32 payrollStateHash; // Yellow Network state verification
    }

    // ============ State ============

    IPoolManager public immutable poolManager;
    IERC20 public immutable usdc;
    IERC20 public immutable usdt;
    IGatewayWallet public gatewayWallet;

    PoolKey public poolKey;
    PoolId public poolId;

    address public agent;
    address public owner;

    // LP positions held by this contract
    mapping(address => LPPosition) public positions;
    uint256 public totalLiquidity;
    uint256 public nextPayrollId;

    // Full range ticks
    int24 constant TICK_LOWER = -887220;
    int24 constant TICK_UPPER = 887220;

    // ============ Events ============

    event Deposited(
        uint256 indexed payrollId,
        address indexed provider,
        uint256 usdcAmount,
        uint128 liquidity,
        uint256 payrollDate
    );
    event Withdrawn(
        address indexed provider,
        uint128 liquidity,
        uint256 usdcBridged
    );
    event AgentUpdated(address indexed oldAgent, address indexed newAgent);
    event GatewayDepositInitiated(uint256 amount, address recipient);

    // Yellow Network state verification
    event PayrollStateCreated(
        uint256 indexed payrollId,
        bytes32 stateHash,
        address provider,
        uint256 amount,
        uint256 payrollDate
    );

    // ============ Errors ============

    error ZeroAmount();
    error Unauthorized();
    error InsufficientBalance();
    error NoPosition();
    error PayrollNotReady();

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

    constructor(
        IPoolManager _poolManager,
        PoolKey memory _existingPoolKey,
        address _gatewayWallet
    ) {
        poolManager = _poolManager;
        poolKey = _existingPoolKey;
        poolId = _existingPoolKey.toId();
        owner = msg.sender;
        gatewayWallet = IGatewayWallet(_gatewayWallet);

        // Set token references from pool key
        usdc = IERC20(Currency.unwrap(_existingPoolKey.currency0));
        usdt = IERC20(Currency.unwrap(_existingPoolKey.currency1));
    }

    // ============ Admin ============

    function setAgent(address _agent) external onlyOwner {
        emit AgentUpdated(agent, _agent);
        agent = _agent;
    }

    function setGatewayWallet(address _gateway) external onlyOwner {
        gatewayWallet = IGatewayWallet(_gateway);
    }

    // ============ Single-Sided Deposit ============

    /// @notice Deposit USDC with scheduled payroll date
    /// @param usdcAmount Amount of USDC to deposit
    /// @param payrollDate Scheduled time for withdrawal/bridging
    function deposit(
        uint256 usdcAmount,
        uint256 payrollDate
    ) external returns (uint256 payrollId, uint128 liquidity) {
        if (usdcAmount == 0) revert ZeroAmount();
        if (payrollDate <= block.timestamp) revert ZeroAmount(); // payroll must be in future

        // Transfer USDC from user
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);

        // Swap 50% USDC to USDT
        uint256 swapAmount = usdcAmount / 2;
        uint256 usdtReceived = _swap(true, swapAmount); // true = USDC to USDT

        // Add liquidity with both tokens
        uint256 usdcForLp = usdcAmount - swapAmount;
        liquidity = _addLiquidity(usdcForLp, usdtReceived);

        // Generate payroll ID
        payrollId = ++nextPayrollId;

        // Compute state hash for Yellow Network verification
        bytes32 stateHash = keccak256(
            abi.encodePacked(
                payrollId,
                msg.sender,
                usdcAmount,
                payrollDate,
                block.chainid
            )
        );

        // Track position
        positions[msg.sender] = LPPosition({
            payrollId: payrollId,
            liquidity: liquidity,
            usdcDeposited: usdcAmount,
            depositTime: block.timestamp,
            payrollDate: payrollDate,
            payrollStateHash: stateHash
        });
        totalLiquidity += liquidity;

        emit Deposited(
            payrollId,
            msg.sender,
            usdcAmount,
            liquidity,
            payrollDate
        );
        emit PayrollStateCreated(
            payrollId,
            stateHash,
            msg.sender,
            usdcAmount,
            payrollDate
        );
    }

    // ============ Withdrawal to Gateway (Agent Only) ============

    /// @notice Withdraw LP, swap USDT back to USDC, deposit to Circle Gateway
    function withdraw(
        address provider
    ) external onlyAgent returns (uint256 usdcBridged) {
        LPPosition memory pos = positions[provider];
        if (pos.liquidity == 0) revert NoPosition();
        if (block.timestamp < pos.payrollDate) revert PayrollNotReady();

        // Remove liquidity - get USDC and USDT
        (uint256 usdc0, uint256 usdt0) = _removeLiquidity(pos.liquidity);

        // Swap all USDT back to USDC
        uint256 usdcFromSwap = 0;
        if (usdt0 > 0) {
            usdcFromSwap = _swap(false, usdt0); // false = USDT to USDC
        }

        usdcBridged = usdc0 + usdcFromSwap;

        // Clear position
        uint128 liq = pos.liquidity;
        delete positions[provider];
        totalLiquidity -= liq;

        // Deposit all USDC to Circle Gateway
        usdc.approve(address(gatewayWallet), usdcBridged);
        gatewayWallet.deposit(address(usdc), usdcBridged);

        emit Withdrawn(provider, liq, usdcBridged);
    }

    // ============ Internal: Swap ============

    function _swap(
        bool zeroForOne,
        uint256 amountIn
    ) internal returns (uint256 amountOut) {
        // Encode swap data
        bytes memory swapData = abi.encode(zeroForOne, amountIn);

        CallbackData memory data = CallbackData({
            action: 2, // swap
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

        bytes memory lpData = abi.encode(params);

        CallbackData memory data = CallbackData({
            action: 0, // addLiquidity
            sender: address(this),
            data: lpData
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

        bytes memory lpData = abi.encode(params);

        CallbackData memory data = CallbackData({
            action: 1, // removeLiquidity
            sender: address(this),
            data: lpData
        });

        bytes memory result = poolManager.unlock(abi.encode(data));
        (amount0, amount1) = abi.decode(result, (uint256, uint256));
    }

    // ============ Circle Gateway ============

    function depositToGateway(
        uint256 amount,
        address recipient
    ) external onlyAgent {
        if (usdc.balanceOf(address(this)) < amount)
            revert InsufficientBalance();
        usdc.approve(address(gatewayWallet), amount);
        gatewayWallet.deposit(address(usdc), amount);
        emit GatewayDepositInitiated(amount, recipient);
    }

    // ============ Unlock Callback ============

    function unlockCallback(
        bytes calldata rawData
    ) external override returns (bytes memory) {
        require(msg.sender == address(poolManager), "Only PoolManager");

        CallbackData memory data = abi.decode(rawData, (CallbackData));

        if (data.action == 0) {
            // Add Liquidity
            ModifyLiquidityParams memory params = abi.decode(
                data.data,
                (ModifyLiquidityParams)
            );
            (BalanceDelta delta, ) = poolManager.modifyLiquidity(
                poolKey,
                params,
                ""
            );

            // Settle negative deltas (we owe pool)
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
        } else if (data.action == 1) {
            // Remove Liquidity
            ModifyLiquidityParams memory params = abi.decode(
                data.data,
                (ModifyLiquidityParams)
            );
            (BalanceDelta delta, ) = poolManager.modifyLiquidity(
                poolKey,
                params,
                ""
            );

            uint256 amt0 = 0;
            uint256 amt1 = 0;

            // Take positive deltas (pool owes us)
            if (delta.amount0() > 0) {
                amt0 = uint256(uint128(delta.amount0()));
                poolManager.take(poolKey.currency0, address(this), amt0);
            }
            if (delta.amount1() > 0) {
                amt1 = uint256(uint128(delta.amount1()));
                poolManager.take(poolKey.currency1, address(this), amt1);
            }
            return abi.encode(amt0, amt1);
        } else if (data.action == 2) {
            // Swap
            (bool zeroForOne, uint256 amountIn) = abi.decode(
                data.data,
                (bool, uint256)
            );

            // Execute swap
            BalanceDelta delta = poolManager.swap(
                poolKey,
                SwapParams({
                    zeroForOne: zeroForOne,
                    amountSpecified: -int256(amountIn), // exact input
                    sqrtPriceLimitX96: zeroForOne
                        ? 4295128740
                        : 1461446703485210103287273052203988822378723970341
                }),
                ""
            );

            uint256 amountOut;

            if (zeroForOne) {
                // Paid USDC, received USDT
                poolManager.sync(poolKey.currency0);
                usdc.transfer(address(poolManager), amountIn);
                poolManager.settle();

                amountOut = uint256(uint128(delta.amount1()));
                poolManager.take(poolKey.currency1, address(this), amountOut);
            } else {
                // Paid USDT, received USDC
                poolManager.sync(poolKey.currency1);
                usdt.transfer(address(poolManager), amountIn);
                poolManager.settle();

                amountOut = uint256(uint128(delta.amount0()));
                poolManager.take(poolKey.currency0, address(this), amountOut);
            }

            return abi.encode(amountOut);
        }

        return "";
    }

    // ============ View Functions ============

    function getPoolKey() external view returns (PoolKey memory) {
        return poolKey;
    }

    function getPoolId() external view returns (PoolId) {
        return poolId;
    }

    function getPosition(
        address provider
    ) external view returns (LPPosition memory) {
        return positions[provider];
    }

    // ============ Emergency ============

    function emergencyWithdraw(
        address token,
        uint256 amount
    ) external onlyOwner {
        IERC20(token).safeTransfer(owner, amount);
    }
}
