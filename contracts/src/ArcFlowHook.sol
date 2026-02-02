// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseHook} from "@openzeppelin/uniswap-hooks/src/base/BaseHook.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "v4-core/src/types/BeforeSwapDelta.sol";
import {SwapParams, ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ICircleGateway} from "./interfaces/CircleGateway.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {DepositData} from "./structs/ArcFlowHookStructs.sol";

/// @title ArcFlow Payroll Guard Hook
/// @notice Uniswap v4 hook that restricts fund exits to authorized AI agents only
/// @dev Implements the "Payroll Guard" concept - funds can only be withdrawn with agent signature
contract ArcFlowHook is BaseHook, Ownable {
    using PoolIdLibrary for PoolKey;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ============ Events ============
    event AgentAuthorized(address indexed agent, bool authorized);
    event CircleGatewayUpdated(address indexed oldGateway, address indexed newGateway);
    event UsdcUpdated(address indexed oldUsdc, address indexed newUsdc);
    event TokensSwapped(address indexed tokenIn, uint256 amountIn, uint256 usdcOut);
    event WithdrawalAuthorized(
        PoolId indexed poolId,
        address indexed agent,
        address token0,
        address token1,
        uint256 amount0,
        uint256 amount1,
        uint256 timestamp
    );
    event TreasuryDeposit(PoolId indexed poolId, address indexed depositor, address token0, address token1, uint256 amount0, uint256 amount1, uint256 timestamp);
    event EmployerSet(address indexed user, address indexed employer);
    event RewardDistributed(PoolId indexed poolId, address indexed employer, uint256 rewardAmount);

    // ============ Errors ============
    error UnauthorizedAgent();
    error InvalidSignature();
    error NonceAlreadyUsed();
    error WithdrawalExpired();
    error InvalidCircleGateway();
    error OnlyOwner();
    error ZeroAddress();
    error PartialWithdrawalNotAllowed();
    error NoEmployerSet();
    error BelowMinimumAmount();

    // ============ State Variables ============
    
    /// @notice USDC token address - the base asset for all deposits
    address public usdc;
    
    /// @notice Authorized AI agents that can sign withdrawal intents
    mapping(address => bool) public authorizedAgents;
    
    /// @notice Circle Gateway interface for cross-chain transfers
    ICircleGateway public circleGateway;
    
    /// @notice Used nonces to prevent replay attacks
    mapping(bytes32 => bool) public usedNonces;
    
    /// @notice Tracks total deposits per pool
    mapping(PoolId => DepositData) public poolDeposits;

    /// @notice Withdrawal authorization validity period (default 1 hour)
    uint256 public constant AUTHORIZATION_VALIDITY = 1 hours;

    // ============ Modifiers ============
    
    // ============ Constructor ============
    
    constructor(
        IPoolManager _poolManager,
        ICircleGateway _circleGateway,
        address _usdc
    ) BaseHook(_poolManager) Ownable(msg.sender) {
        circleGateway = _circleGateway;
        usdc = _usdc;
    }

    // ============ Admin Functions ============
    
    /// @notice Authorize or revoke an AI agent
    /// @param agent The agent address
    /// @param authorized Whether the agent is authorized
    function setAgentAuthorization(address agent, bool authorized) external onlyOwner {
        if (agent == address(0)) revert ZeroAddress();
        authorizedAgents[agent] = authorized;
        emit AgentAuthorized(agent, authorized);
    }

    // ============ Hook Permissions ============
    
    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: true, // Track deposits
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: true, // Guard withdrawals
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
    
    /// @notice Called after adding liquidity - tracks treasury deposits and initial USDC value
    function _afterAddLiquidity(
        address sender,
        PoolKey calldata key,
        ModifyLiquidityParams calldata params,
        BalanceDelta delta,
        BalanceDelta,
        bytes calldata
    ) internal override returns (bytes4, BalanceDelta) {
        PoolId poolId = key.toId();
        
        // Track the deposit (liquidityDelta is positive for adds)
        if (params.liquidityDelta > 0) {
            address token0 = Currency.unwrap(key.currency0);
            address token1 = Currency.unwrap(key.currency1);
            int128 amount0 = delta.amount0();
            int128 amount1 = delta.amount1();
            uint256 token0Amount = amount0 > 0 ? uint256(uint128(amount0)) : 0;
            uint256 token1Amount = amount1 > 0 ? uint256(uint128(amount1)) : 0;
            poolDeposits[poolId] = DepositData({
                tokenA: token0,
                tokenB: token1,
                amountA: token0Amount,
                amountB: token1Amount,
                timestamp: block.timestamp
            });
            
            emit TreasuryDeposit(poolId, sender, token0, token1, token0Amount, token1Amount, block.timestamp);
        }
        
        return (this.afterAddLiquidity.selector, BalanceDelta.wrap(0));
    }

    /// @notice Called after removing liquidity - swaps token0 and token1 to USDC, checks minimum, deposits to gateway
    /// @dev hookData must contain: (signature, nonce, expiry, gatewayMinimum, recipient)
    function _afterRemoveLiquidity(
        address sender,
        PoolKey calldata key,
        ModifyLiquidityParams calldata params,
        BalanceDelta delta,
        BalanceDelta,
        bytes calldata hookData
    ) internal override returns (bytes4, BalanceDelta) {
        // Decode the authorization data
        (
            bytes memory signature,
            bytes32 nonce,
            uint256 expiry,
            uint256 gatewayMinimum,
            address recipient
        ) = abi.decode(hookData, (bytes, bytes32, uint256, uint256, address));
        
        // Validate the withdrawal authorization
        _validateWithdrawalAuthorization(
            key,
            sender,
            params.liquidityDelta,
            signature,
            nonce,
            expiry,
            gatewayMinimum,
            recipient
        );
        
        PoolId poolId = key.toId();
    
        // Get token amounts from the delta (negative values for tokens going out)
        int128 amount0 = delta.amount0();
        int128 amount1 = delta.amount1();
        
        // Convert to positive amounts (removing liquidity returns negative deltas)
        uint256 token0Amount = amount0 < 0 ? uint256(uint128(-amount0)) : 0;
        uint256 token1Amount = amount1 < 0 ? uint256(uint128(-amount1)) : 0;
        
        // Get token addresses from the pool key
        address token0 = Currency.unwrap(key.currency0);
        address token1 = Currency.unwrap(key.currency1);
        
        // Track total USDC to deposit
        uint256 totalUsdcAmount = 0;
        
        // Swap token0 to USDC (if not already USDC)
        if (token0Amount > 0) {
            if (token0 == usdc) {
                totalUsdcAmount += token0Amount;
            } else {
                uint256 usdcReceived = _swapToUsdc(key, token0, token0Amount);
                totalUsdcAmount += usdcReceived;
            }
        }
        
        // Swap token1 to USDC (if not already USDC)
        if (token1Amount > 0) {
            if (token1 == usdc) {
                totalUsdcAmount += token1Amount;
            } else {
                uint256 usdcReceived = _swapToUsdc(key, token1, token1Amount);
                totalUsdcAmount += usdcReceived;
            }
        }

        // Check minimum USDC amount before gateway deposit
        if (totalUsdcAmount < gatewayMinimum) revert BelowMinimumAmount();
        
        // Clear pool tracking
        delete poolDeposits[poolId];

        // Deposit to Circle Gateway
        if (address(circleGateway) != address(0) && totalUsdcAmount > 0) {
            IERC20(usdc).approve(address(circleGateway), totalUsdcAmount);
            circleGateway.deposit(recipient, totalUsdcAmount);
        }
        
        emit WithdrawalAuthorized(poolId, sender, token0, token1, token0Amount, token1Amount, block.timestamp);
        
        return (this.afterRemoveLiquidity.selector, BalanceDelta.wrap(0));
    }
    
    /// @notice Internal function to swap a token to USDC
    /// @param key The pool key
    /// @param tokenIn The token to swap from
    /// @param amountIn The amount to swap
    /// @return usdcOut The amount of USDC received
    function _swapToUsdc(
        PoolKey calldata key,
        address tokenIn,
        uint256 amountIn
    ) internal returns (uint256 usdcOut) {
        // Determine swap direction based on which token is USDC
        address token0 = Currency.unwrap(key.currency0);
        address token1 = Currency.unwrap(key.currency1);
        
        // Only proceed if USDC is in this pool
        require(token0 == usdc || token1 == usdc, "Pool does not contain USDC");
        
        // Determine correct swap direction
        bool swapZeroForOne = (tokenIn == token0);
        
        // Perform the swap through the pool manager
        BalanceDelta swapDelta = poolManager.swap(
            key,
            SwapParams({
                zeroForOne: swapZeroForOne,
                amountSpecified: -int256(amountIn), // Negative for exact input
                sqrtPriceLimitX96: swapZeroForOne ? 4295128740 : 1461446703485210103287273052203988822378723970341 // Min/max price limits
            }),
            ""
        );
        
        // Extract USDC amount received (positive delta is tokens received)
        int128 usdcDelta = swapZeroForOne ? swapDelta.amount1() : swapDelta.amount0();
        usdcOut = usdcDelta > 0 ? uint256(uint128(usdcDelta)) : 0;
        
        emit TokensSwapped(tokenIn, amountIn, usdcOut);
    }

    /// @notice Called before swap - restricts swaps to authorized agents
    /// @dev Prevents unauthorized users from swapping out of the pool
    function _beforeSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata,
        bytes calldata hookData
    ) internal override returns (bytes4, BeforeSwapDelta, uint24) {
        // If hookData is empty, check if sender is authorized agent or owner
        if (hookData.length == 0) {
            if (!authorizedAgents[sender] && sender != owner()) {
                revert UnauthorizedAgent();
            }
        } else {
            // Decode and validate signature for swap authorization
            (
                bytes memory signature,
                bytes32 nonce,
                uint256 expiry
            ) = abi.decode(hookData, (bytes, bytes32, uint256));
            
            _validateSwapAuthorization(key, sender, signature, nonce, expiry);
        }
        
        return (this.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    // ============ Internal Validation Functions ============
    
    /// @notice Validates withdrawal authorization signature
    function _validateWithdrawalAuthorization(
        PoolKey calldata key,
        address sender,
        int256 liquidityDelta,
        bytes memory signature,
        bytes32 nonce,
        uint256 expiry,
        uint256 gatewayMinimum,
        address recipient
    ) internal {
        // Check expiry
        if (block.timestamp > expiry) revert WithdrawalExpired();
        
        // Check nonce hasn't been used
        if (usedNonces[nonce]) revert NonceAlreadyUsed();
        
        // Create the message hash
        bytes32 messageHash = keccak256(abi.encodePacked(
            "ArcFlow:Withdraw",
            address(this),
            key.toId(),
            sender,
            liquidityDelta,
            nonce,
            expiry,
            gatewayMinimum,
            recipient
        ));
        
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
        address signer = ethSignedHash.recover(signature);
        
        // Verify signer is an authorized agent
        if (!authorizedAgents[signer]) revert UnauthorizedAgent();
        
        // Mark nonce as used
        usedNonces[nonce] = true;
    }
    
    /// @notice Validates swap authorization signature
    function _validateSwapAuthorization(
        PoolKey calldata key,
        address sender,
        bytes memory signature,
        bytes32 nonce,
        uint256 expiry
    ) internal {
        // Check expiry
        if (block.timestamp > expiry) revert WithdrawalExpired();
        
        // Check nonce hasn't been used
        if (usedNonces[nonce]) revert NonceAlreadyUsed();
        
        // Create the message hash
        bytes32 messageHash = keccak256(abi.encodePacked(
            "ArcFlow:Swap",
            address(this),
            key.toId(),
            sender,
            nonce,
            expiry
        ));
        
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
        address signer = ethSignedHash.recover(signature);
        
        // Verify signer is an authorized agent
        if (!authorizedAgents[signer]) revert UnauthorizedAgent();
        
        // Mark nonce as used
        usedNonces[nonce] = true;
    }

    // ============ View Functions ============
    
    /// @notice Check if an agent is authorized
    function isAuthorizedAgent(address agent) external view returns (bool) {
        return authorizedAgents[agent];
    }

    /// @notice Get pool deposit data
    function getPoolDeposits(PoolId poolId) external view returns (DepositData memory) {
        return poolDeposits[poolId];
    }
}