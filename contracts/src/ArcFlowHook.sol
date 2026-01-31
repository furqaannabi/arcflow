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
    event WithdrawalAuthorized(
        PoolId indexed poolId,
        address indexed agent,
        uint256 amount,
        uint256 nonce,
        uint256 timestamp
    );
    event TreasuryDeposit(PoolId indexed poolId, address indexed depositor, uint256 amount);

    // ============ Errors ============
    error UnauthorizedAgent();
    error InvalidSignature();
    error NonceAlreadyUsed();
    error WithdrawalExpired();
    error InvalidCircleGateway();
    error OnlyOwner();
    error ZeroAddress();

    // ============ State Variables ============
    
    
    /// @notice Authorized AI agents that can sign withdrawal intents
    mapping(address => bool) public authorizedAgents;
    
    /// @notice Circle Gateway address for cross-chain transfers
    address public circleGateway;
    
    /// @notice Used nonces to prevent replay attacks
    mapping(bytes32 => bool) public usedNonces;
    
    /// @notice Tracks total deposits per pool
    mapping(PoolId => uint256) public poolDeposits;
    
    /// @notice Tracks deposits per user per pool
    mapping(PoolId => mapping(address => uint256)) public userDeposits;
    
    /// @notice Withdrawal authorization validity period (default 1 hour)
    uint256 public constant AUTHORIZATION_VALIDITY = 1 hours;

    // ============ Modifiers ============
    
    // ============ Constructor ============
    
    constructor(
        IPoolManager _poolManager,
        address _circleGateway
    ) BaseHook(_poolManager) Ownable(msg.sender) {
        circleGateway = _circleGateway;
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
    
    /// @notice Update the Circle Gateway address
    /// @param _circleGateway New gateway address
    function setCircleGateway(address _circleGateway) external onlyOwner {
        address oldGateway = circleGateway;
        circleGateway = _circleGateway;
        emit CircleGatewayUpdated(oldGateway, _circleGateway);
    }
    

    // ============ Hook Permissions ============
    
    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: true,      // Track deposits
            afterAddLiquidity: false,
            beforeRemoveLiquidity: true,   // Guard withdrawals
            afterRemoveLiquidity: false,
            beforeSwap: true,              // Guard swaps (prevent unauthorized exits)
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
    
    /// @notice Called before adding liquidity - tracks treasury deposits
    function _beforeAddLiquidity(
        address sender,
        PoolKey calldata key,
        ModifyLiquidityParams calldata params,
        bytes calldata
    ) internal override returns (bytes4) {
        PoolId poolId = key.toId();
        
        // Track the deposit (liquidityDelta is positive for adds)
        if (params.liquidityDelta > 0) {
            uint256 amount = uint256(params.liquidityDelta);
            poolDeposits[poolId] += amount;
            userDeposits[poolId][sender] += amount;
            emit TreasuryDeposit(poolId, sender, amount);
        }
        
        return this.beforeAddLiquidity.selector;
    }

    /// @notice Called before removing liquidity - requires agent authorization
    /// @dev hookData must contain: (signature, nonce, expiry, recipient)
    function _beforeRemoveLiquidity(
        address sender,
        PoolKey calldata key,
        ModifyLiquidityParams calldata params,
        bytes calldata hookData
    ) internal override returns (bytes4) {
        // Decode the authorization data
        (
            bytes memory signature,
            bytes32 nonce,
            uint256 expiry,
            address recipient
        ) = abi.decode(hookData, (bytes, bytes32, uint256, address));
        
        // Validate the withdrawal authorization
        _validateWithdrawalAuthorization(
            key,
            sender,
            params.liquidityDelta,
            signature,
            nonce,
            expiry,
            recipient
        );
        
        PoolId poolId = key.toId();
        uint256 amount = uint256(-params.liquidityDelta); // liquidityDelta is negative for removes
        
        emit WithdrawalAuthorized(poolId, sender, amount, uint256(nonce), block.timestamp);
        
        return this.beforeRemoveLiquidity.selector;
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
        address recipient
    ) internal {
        // Check expiry
        if (block.timestamp > expiry) revert WithdrawalExpired();
        
        // Check nonce hasn't been used
        if (usedNonces[nonce]) revert NonceAlreadyUsed();
        
        // If recipient is specified, it should be Circle Gateway for cross-chain
        if (recipient != address(0) && circleGateway != address(0)) {
            if (recipient != circleGateway) revert InvalidCircleGateway();
        }
        
        // Create the message hash
        bytes32 messageHash = keccak256(abi.encodePacked(
            "ArcFlow:Withdraw",
            address(this),
            key.toId(),
            sender,
            liquidityDelta,
            nonce,
            expiry,
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
    
    /// @notice Get user's deposit in a pool
    function getUserDeposit(PoolId poolId, address user) external view returns (uint256) {
        return userDeposits[poolId][user];
    }
    
    /// @notice Get total pool deposits
    function getPoolDeposits(PoolId poolId) external view returns (uint256) {
        return poolDeposits[poolId];
    }
}