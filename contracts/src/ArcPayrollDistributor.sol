// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
/// @title ArcFlow Payroll Distributor
/// @notice Distributes payroll on Arc Network with gasless transactions for employees
/// @dev Deployed on Arc Network to receive USDC via Circle Gateway and distribute to employees
contract ArcPayrollDistributor is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ============ Structs ============
    
    struct PayrollBatch {
        uint256 batchId;
        uint256 totalAmount;
        uint256 recipientCount;
        uint256 executedAt;
        bool executed;
    }
    
    struct PayrollRecipient {
        address wallet;
        uint256 amount;
        string employeeId; // Off-chain reference
    }

    // ============ Events ============
    
    event PayrollExecuted(
        uint256 indexed batchId,
        uint256 totalAmount,
        uint256 recipientCount,
        uint256 timestamp
    );
    event PaymentSent(
        uint256 indexed batchId,
        address indexed recipient,
        uint256 amount,
        string employeeId
    );
    event AgentAuthorized(address indexed agent, bool authorized);
    event FundsReceived(address indexed from, uint256 amount);
    event EmergencyWithdrawal(address indexed token, address indexed to, uint256 amount);
    event PayrollScheduled(
        uint256 indexed batchId,
        uint256 totalAmount,
        uint256 recipientCount,
        uint256 executeAfter
    );

    // ============ Errors ============
    
    error UnauthorizedAgent();
    error BatchAlreadyExecuted();
    error BatchNotFound();
    error InvalidBatchData();
    error InsufficientBalance();
    error OnlyOwner();
    error ZeroAddress();
    error InvalidSignature();
    error NonceAlreadyUsed();
    error PayrollNotReady();
    error ArrayLengthMismatch();
    error TransferFailed();

    // ============ State Variables ============

    /// @notice Authorized AI agents
    mapping(address => bool) public authorizedAgents;
    
    /// @notice Payroll batch records
    mapping(uint256 => PayrollBatch) public batches;
    
    /// @notice Current batch ID counter
    uint256 public currentBatchId;
    
    /// @notice Used nonces for replay protection
    mapping(bytes32 => bool) public usedNonces;
    
    /// @notice Scheduled payrolls (batchId => executeAfter timestamp)
    mapping(uint256 => uint256) public scheduledPayrolls;

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
    
    /// @notice Authorize or revoke an AI agent
    function setAgentAuthorization(address agent, bool authorized) external onlyOwner {
        if (agent == address(0)) revert ZeroAddress();
        authorizedAgents[agent] = authorized;
        emit AgentAuthorized(agent, authorized);
    }
    
    
    /// @notice Emergency withdrawal (only owner)
    function emergencyWithdraw(address token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
        emit EmergencyWithdrawal(token, to, amount);
    }

    // ============ Payroll Functions ============
    
    /// @notice Schedule a payroll batch for future execution
    /// @param recipients Array of payroll recipients
    /// @param executeAfter Timestamp after which payroll can be executed
    /// @return batchId The ID of the scheduled batch
    function schedulePayroll(
        PayrollRecipient[] calldata recipients,
        uint256 executeAfter
    ) external onlyAuthorizedAgent returns (uint256 batchId) {
        if (recipients.length == 0) revert InvalidBatchData();
        
        batchId = ++currentBatchId;
        
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < recipients.length; i++) {
            if (recipients[i].wallet == address(0)) revert ZeroAddress();
            totalAmount += recipients[i].amount;
        }
        
        batches[batchId] = PayrollBatch({
            batchId: batchId,
            totalAmount: totalAmount,
            recipientCount: recipients.length,
            executedAt: 0,
            executed: false
        });
        
        scheduledPayrolls[batchId] = executeAfter;
        
        emit PayrollScheduled(batchId, totalAmount, recipients.length, executeAfter);
    }
    
    /// @notice Execute payroll distribution immediately
    /// @param recipients Array of payroll recipients with wallet addresses and amounts
    /// @return batchId The ID of the executed batch
    function executePayroll(
        PayrollRecipient[] calldata recipients
    ) external onlyAuthorizedAgent nonReentrant returns (uint256 batchId) {
        if (recipients.length == 0) revert InvalidBatchData();
        
        batchId = ++currentBatchId;
        
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < recipients.length; i++) {
            totalAmount += recipients[i].amount;
        }
        
        // Check balance
        if (address(this).balance < totalAmount) {
            revert InsufficientBalance();
        }
        
        // Execute transfers
        for (uint256 i = 0; i < recipients.length; i++) {
            PayrollRecipient calldata recipient = recipients[i];
            if (recipient.wallet == address(0)) revert ZeroAddress();
            
            (bool success, ) = payable(recipient.wallet).call{value: recipient.amount}("");
            if (!success) revert TransferFailed();
            emit PaymentSent(batchId, recipient.wallet, recipient.amount, recipient.employeeId);
        }
        
        // Record batch
        batches[batchId] = PayrollBatch({
            batchId: batchId,
            totalAmount: totalAmount,
            recipientCount: recipients.length,
            executedAt: block.timestamp,
            executed: true
        });
        
        emit PayrollExecuted(batchId, totalAmount, recipients.length, block.timestamp);
    }
    
    /// @notice Execute payroll with agent signature (for gasless/meta-tx scenarios)
    /// @param recipients Array of payroll recipients
    /// @param signature Agent's signature authorizing the payroll
    /// @param nonce Unique nonce for replay protection
    /// @param expiry Signature expiry timestamp
    function executePayrollWithSignature(
        PayrollRecipient[] calldata recipients,
        bytes calldata signature,
        bytes32 nonce,
        uint256 expiry
    ) external nonReentrant returns (uint256 batchId) {
        // Validate signature
        _validatePayrollSignature(recipients, signature, nonce, expiry);
        
        if (recipients.length == 0) revert InvalidBatchData();
        
        batchId = ++currentBatchId;
        
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < recipients.length; i++) {
            totalAmount += recipients[i].amount;
        }
        
        // Check balance
        if (address(this).balance < totalAmount) {
            revert InsufficientBalance();
        }
        
        // Execute transfers
        for (uint256 i = 0; i < recipients.length; i++) {
            PayrollRecipient calldata recipient = recipients[i];
            if (recipient.wallet == address(0)) revert ZeroAddress();
            
            (bool success, ) = payable(recipient.wallet).call{value: recipient.amount}("");
            if (!success) revert TransferFailed();
            emit PaymentSent(batchId, recipient.wallet, recipient.amount, recipient.employeeId);
        }
        
        // Record batch
        batches[batchId] = PayrollBatch({
            batchId: batchId,
            totalAmount: totalAmount,
            recipientCount: recipients.length,
            executedAt: block.timestamp,
            executed: true
        });
        
        emit PayrollExecuted(batchId, totalAmount, recipients.length, block.timestamp);
    }
    
    /// @notice Bulk transfer to multiple addresses (simplified version)
    /// @param wallets Array of recipient wallet addresses
    /// @param amounts Array of amounts to send
    function bulkTransfer(
        address[] calldata wallets,
        uint256[] calldata amounts
    ) external onlyAuthorizedAgent nonReentrant {
        if (wallets.length != amounts.length) revert ArrayLengthMismatch();
        if (wallets.length == 0) revert InvalidBatchData();
        
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
        }
        
        if (address(this).balance < totalAmount) {
            revert InsufficientBalance();
        }
        
        uint256 batchId = ++currentBatchId;
        
        for (uint256 i = 0; i < wallets.length; i++) {
            if (wallets[i] == address(0)) revert ZeroAddress();
            (bool success, ) = payable(wallets[i]).call{value: amounts[i]}("");
            if (!success) revert TransferFailed();
            emit PaymentSent(batchId, wallets[i], amounts[i], "");
        }
        
        batches[batchId] = PayrollBatch({
            batchId: batchId,
            totalAmount: totalAmount,
            recipientCount: wallets.length,
            executedAt: block.timestamp,
            executed: true
        });
        
        emit PayrollExecuted(batchId, totalAmount, wallets.length, block.timestamp);
    }

    // ============ Internal Functions ============
    
    function _validatePayrollSignature(
        PayrollRecipient[] calldata recipients,
        bytes calldata signature,
        bytes32 nonce,
        uint256 expiry
    ) internal {
        if (block.timestamp > expiry) revert PayrollNotReady();
        if (usedNonces[nonce]) revert NonceAlreadyUsed();
        
        // Build recipients hash
        bytes32 recipientsHash = keccak256(abi.encode(recipients));
        
        bytes32 messageHash = keccak256(abi.encodePacked(
            "ArcFlow:Payroll",
            address(this),
            recipientsHash,
            nonce,
            expiry
        ));
        
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
        address signer = ethSignedHash.recover(signature);
        
        if (!authorizedAgents[signer]) revert UnauthorizedAgent();
        
        usedNonces[nonce] = true;
    }

    // ============ View Functions ============
    
    /// @notice Get batch details
    function getBatch(uint256 batchId) external view returns (PayrollBatch memory) {
        return batches[batchId];
    }
    
    
    /// @notice Check if an agent is authorized
    function isAuthorizedAgent(address agent) external view returns (bool) {
        return authorizedAgents[agent];
    }

    // ============ Receive Functions ============
    
    /// @notice Called when USDC is received (for tracking purposes)
    /// @dev Note: ERC20 transfers don't trigger this, use events from Circle Gateway
    receive() external payable {
        // Arc uses USDC as gas, so receiving native currency is valid
        emit FundsReceived(msg.sender, msg.value);
    }
}
