// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {
    MessageHashUtils
} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IGatewayMinter} from "./interfaces/ICircleGateway.sol";
import {PoolId} from "v4-core/src/types/PoolId.sol";

/// @title ArcFlow Payroll Distributor
/// @notice Distributes payroll on Arc Network with Circle Gateway + Yellow Intent integration
/// @dev Receives USDC via Circle Gateway with signed payroll intents
contract ArcPayrollDistributor is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ============ Structs ============

    /// @notice Payroll recipient data
    struct Recipient {
        address wallet;
        uint256 amount;
    }

    /// @notice Signed payroll intent (Yellow-style)
    struct PayrollIntent {
        PoolId poolId; // Uniswap pool ID from ArcFlowHook
        Recipient[] recipients; // Payroll recipients
        uint256 totalAmount; // Total USDC amount
        uint256 executeAfter; // Timestamp when payroll can be executed
        uint256 expiry; // Intent expiry timestamp
        bytes32 nonce; // Unique nonce for replay protection
    }

    /// @notice Stored intent for execution
    struct StoredIntent {
        PoolId poolId;
        uint256 totalAmount;
        uint256 executeAfter;
        uint256 recipientCount;
        bool executed;
        bytes32 recipientsHash; // Hash of recipients array for verification
    }

    // ============ Events ============

    event IntentReceived(
        bytes32 indexed intentId,
        PoolId indexed poolId,
        uint256 totalAmount,
        uint256 executeAfter,
        uint256 recipientCount
    );
    event PayrollExecuted(
        bytes32 indexed intentId,
        PoolId indexed poolId,
        uint256 totalAmount,
        uint256 recipientCount
    );
    event PaymentSent(
        bytes32 indexed intentId,
        address indexed recipient,
        uint256 amount
    );
    event AgentAuthorized(address indexed agent, bool authorized);
    event GatewayConfigured(address indexed minter, address indexed usdc);

    // ============ Errors ============

    error UnauthorizedAgent();
    error InvalidSignature();
    error IntentExpired();
    error IntentNotReady();
    error IntentAlreadyExecuted();
    error IntentNotFound();
    error NonceAlreadyUsed();
    error InsufficientBalance();
    error ZeroAddress();
    error InvalidRecipients();

    // ============ State Variables ============

    mapping(address => bool) public authorizedAgents;
    mapping(bytes32 => StoredIntent) public intents;
    mapping(bytes32 => bool) public usedNonces;

    IGatewayMinter public gatewayMinter;
    IERC20 public usdc;

    // ============ Modifiers ============

    modifier onlyAuthorizedAgent() {
        if (!authorizedAgents[msg.sender] && msg.sender != owner()) {
            revert UnauthorizedAgent();
        }
        _;
    }

    // ============ Constructor ============

    constructor() Ownable(msg.sender) {}

    // ============ Admin Functions ============

    function setAgentAuthorization(
        address agent,
        bool authorized
    ) external onlyOwner {
        if (agent == address(0)) revert ZeroAddress();
        authorizedAgents[agent] = authorized;
        emit AgentAuthorized(agent, authorized);
    }

    function configureGateway(
        address _gatewayMinter,
        address _usdc
    ) external onlyOwner {
        if (_gatewayMinter == address(0) || _usdc == address(0))
            revert ZeroAddress();
        gatewayMinter = IGatewayMinter(_gatewayMinter);
        usdc = IERC20(_usdc);
        emit GatewayConfigured(_gatewayMinter, _usdc);
    }

    // ============ Gateway + Intent Functions ============

    /// @notice Receive USDC from Circle Gateway with a signed payroll intent
    /// @param attestationPayload Gateway attestation for minting USDC
    /// @param gatewaySignature Gateway signature
    /// @param intent The payroll intent data
    /// @param intentSignature Agent signature over the intent
    function receiveFromGateway(
        bytes calldata attestationPayload,
        bytes calldata gatewaySignature,
        PayrollIntent calldata intent,
        bytes calldata intentSignature
    ) external onlyAuthorizedAgent nonReentrant {
        // Verify intent signature
        _verifyIntentSignature(intent, intentSignature);

        // Check nonce
        if (usedNonces[intent.nonce]) revert NonceAlreadyUsed();
        usedNonces[intent.nonce] = true;

        // Check expiry
        if (block.timestamp > intent.expiry) revert IntentExpired();

        // Mint USDC from Gateway
        uint256 balanceBefore = usdc.balanceOf(address(this));
        gatewayMinter.gatewayMint(attestationPayload, gatewaySignature);
        uint256 received = usdc.balanceOf(address(this)) - balanceBefore;

        // Store the intent for later execution
        bytes32 intentId = keccak256(abi.encode(intent.poolId, intent.nonce));
        bytes32 recipientsHash = keccak256(abi.encode(intent.recipients));

        intents[intentId] = StoredIntent({
            poolId: intent.poolId,
            totalAmount: received,
            executeAfter: intent.executeAfter,
            recipientCount: intent.recipients.length,
            executed: false,
            recipientsHash: recipientsHash
        });

        emit IntentReceived(
            intentId,
            intent.poolId,
            received,
            intent.executeAfter,
            intent.recipients.length
        );
    }

    /// @notice Execute a stored payroll intent
    /// @param poolId The Uniswap pool ID
    /// @param nonce The intent nonce
    /// @param recipients The recipients array (must match stored hash)
    function executePayroll(
        PoolId poolId,
        bytes32 nonce,
        Recipient[] calldata recipients
    ) external onlyAuthorizedAgent nonReentrant {
        bytes32 intentId = keccak256(abi.encode(poolId, nonce));
        StoredIntent storage intent = intents[intentId];

        // Validate
        if (intent.totalAmount == 0) revert IntentNotFound();
        if (intent.executed) revert IntentAlreadyExecuted();
        if (block.timestamp < intent.executeAfter) revert IntentNotReady();

        // Verify recipients match
        bytes32 recipientsHash = keccak256(abi.encode(recipients));
        if (recipientsHash != intent.recipientsHash) revert InvalidRecipients();

        // Calculate total
        uint256 total = 0;
        for (uint256 i = 0; i < recipients.length; i++) {
            total += recipients[i].amount;
        }

        if (usdc.balanceOf(address(this)) < total) revert InsufficientBalance();

        // Mark executed
        intent.executed = true;

        // Distribute
        for (uint256 i = 0; i < recipients.length; i++) {
            if (recipients[i].wallet == address(0)) revert ZeroAddress();
            usdc.safeTransfer(recipients[i].wallet, recipients[i].amount);
            emit PaymentSent(
                intentId,
                recipients[i].wallet,
                recipients[i].amount
            );
        }

        emit PayrollExecuted(intentId, poolId, total, recipients.length);
    }

    // ============ Internal Functions ============

    function _verifyIntentSignature(
        PayrollIntent calldata intent,
        bytes calldata signature
    ) internal view {
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                "ArcFlow:PayrollIntent",
                address(this),
                PoolId.unwrap(intent.poolId),
                keccak256(abi.encode(intent.recipients)),
                intent.totalAmount,
                intent.executeAfter,
                intent.expiry,
                intent.nonce
            )
        );

        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
        address signer = ethSignedHash.recover(signature);

        if (!authorizedAgents[signer]) revert InvalidSignature();
    }

    // ============ View Functions ============

    function getIntent(
        PoolId poolId,
        bytes32 nonce
    ) external view returns (StoredIntent memory) {
        return intents[keccak256(abi.encode(poolId, nonce))];
    }

    function isAuthorizedAgent(address agent) external view returns (bool) {
        return authorizedAgents[agent];
    }
}
