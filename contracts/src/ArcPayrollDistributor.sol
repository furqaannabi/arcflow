// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {
    MessageHashUtils
} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {PayrollRecipient} from "./structs/ArcPayrollDistributorStructs.sol";
import {IGatewayMinter} from "./interfaces/ICircleGateway.sol";

/// @title ArcFlow Payroll Distributor (Arc Chain)
/// @notice Mints USDC from Circle Gateway and distributes to employees
/// @dev Verifies payroll state from Yellow Network before distribution
contract ArcPayrollDistributor is ReentrancyGuard, Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ============ State ============

    IGatewayMinter public immutable gatewayMinter;
    mapping(address => bool) public authorizedAgents;
    mapping(bytes32 => bool) public processedPayrolls; // prevent replay
    mapping(bytes32 => bool) public processedChannels; // prevent channel replay
    uint256 public currentBatchId;

    // Ethereum chain ID for state hash verification
    uint256 public constant ETH_CHAIN_ID = 1; // mainnet, change for testnet

    // Yellow Network channel state tracking
    struct ChannelPayroll {
        bytes32 channelId;
        uint256 payrollId;
        uint256 totalAmount;
        uint256 settledAt;
        bool distributed;
    }
    mapping(bytes32 => ChannelPayroll) public channelPayrolls;

    // ============ Events ============

    event PayrollExecuted(
        uint256 indexed batchId,
        bytes32 indexed stateHash,
        uint256 totalAmount,
        uint256 recipientCount
    );
    event PaymentSent(
        uint256 indexed batchId,
        address indexed recipient,
        uint256 amount
    );
    event AgentAuthorized(address indexed agent, bool authorized);
    event PayrollStateVerified(bytes32 indexed stateHash, address signer);
    event ChannelPayrollVerified(
        bytes32 indexed channelId,
        uint256 indexed payrollId,
        uint256 totalAmount
    );
    event ChannelDistributionCompleted(
        bytes32 indexed channelId,
        uint256 indexed payrollId,
        uint256 recipientCount
    );

    // ============ Errors ============

    error UnauthorizedAgent();
    error InsufficientBalance();
    error ZeroAddress();
    error EmptyRecipients();
    error TransferFailed();
    error InvalidStateSignature();
    error PayrollAlreadyProcessed();
    error StateMismatch();
    error ChannelAlreadyProcessed();
    error InvalidChannelSignature();
    error ChannelAmountMismatch();

    // ============ Modifiers ============

    modifier onlyAuthorizedAgent() {
        if (!authorizedAgents[msg.sender] && msg.sender != owner())
            revert UnauthorizedAgent();
        _;
    }

    constructor(address _gatewayMinter) Ownable(msg.sender) {
        gatewayMinter = IGatewayMinter(_gatewayMinter);
    }

    function setAgentAuthorization(
        address agent,
        bool authorized
    ) external onlyOwner {
        if (agent == address(0)) revert ZeroAddress();
        authorizedAgents[agent] = authorized;
        emit AgentAuthorized(agent, authorized);
    }

    // ============ Yellow Network State Verification ============

    /// @notice Verify payroll state signed via Yellow Network
    /// @param payrollId The payroll ID from Ethereum router
    /// @param provider The employer address
    /// @param amount The total USDC amount
    /// @param payrollDate The scheduled payroll date
    /// @param stateSignature Yellow Network signed state
    /// @return stateHash The computed state hash
    function verifyPayrollState(
        uint256 payrollId,
        address provider,
        uint256 amount,
        uint256 payrollDate,
        PayrollRecipient[] calldata recipients,
        bytes calldata stateSignature
    ) public view returns (bytes32 stateHash) {
        bytes32 recipientsHash = keccak256(abi.encode(recipients));

        // Compute expected state hash (must match Ethereum router)
        stateHash = keccak256(
            abi.encodePacked(
                payrollId,
                provider,
                amount,
                payrollDate,
                ETH_CHAIN_ID,
                recipientsHash
            )
        );

        // Verify signature from authorized agent
        bytes32 ethSignedHash = stateHash.toEthSignedMessageHash();
        address signer = ethSignedHash.recover(stateSignature);

        if (!authorizedAgents[signer] && signer != owner()) {
            revert InvalidStateSignature();
        }
    }

    // ============ Main Distribution Function ============

    /// @notice Mint from gateway, verify state, and distribute
    /// @param attestation Circle Gateway attestation
    /// @param signature Circle Gateway signature
    /// @param payrollId Payroll ID from Ethereum
    /// @param provider Employer address
    /// @param totalAmount Expected total amount
    /// @param payrollDate Scheduled date
    /// @param stateSignature Yellow Network state signature
    /// @param recipients Employee payment details
    function mintVerifyAndDistribute(
        bytes calldata attestation,
        bytes calldata signature,
        uint256 payrollId,
        address provider,
        uint256 totalAmount,
        uint256 payrollDate,
        bytes calldata stateSignature,
        PayrollRecipient[] calldata recipients
    ) external onlyAuthorizedAgent nonReentrant returns (uint256 batchId) {
        if (recipients.length == 0) revert EmptyRecipients();

        // Step 1: Verify Yellow Network state
        // Step 1: Verify Yellow Network state
        bytes32 stateHash = verifyPayrollState(
            payrollId,
            provider,
            totalAmount,
            payrollDate,
            recipients,
            stateSignature
        );

        // Step 2: Check not already processed
        if (processedPayrolls[stateHash]) revert PayrollAlreadyProcessed();
        processedPayrolls[stateHash] = true;

        // Step 3: Mint from Circle Gateway
        uint256 balanceBefore = address(this).balance;
        gatewayMinter.gatewayMint(attestation, signature);
        uint256 minted = address(this).balance - balanceBefore;

        // Step 4: Verify amounts match
        uint256 recipientTotal = 0;
        for (uint256 i = 0; i < recipients.length; i++) {
            recipientTotal += recipients[i].amount;
        }
        if (minted < recipientTotal) revert InsufficientBalance();
        if (recipientTotal != totalAmount) revert StateMismatch();

        // Step 5: Distribute
        batchId = ++currentBatchId;

        for (uint256 i = 0; i < recipients.length; i++) {
            if (recipients[i].wallet == address(0)) revert ZeroAddress();
            (bool success, ) = recipients[i].wallet.call{
                value: recipients[i].amount
            }("");
            if (!success) revert TransferFailed();
            emit PaymentSent(
                batchId,
                recipients[i].wallet,
                recipients[i].amount
            );
        }

        emit PayrollStateVerified(stateHash, msg.sender);
        emit PayrollExecuted(
            batchId,
            stateHash,
            recipientTotal,
            recipients.length
        );
    }

    // ============ Yellow Network Channel Verification ============

    /// @notice Verify a Yellow Network channel state for payroll
    /// @param channelId The Yellow Network channel ID
    /// @param payrollId The payroll ID
    /// @param totalAmount The total amount in the channel
    /// @param channelSignature Signature from authorized agent
    /// @return channelStateHash The computed channel state hash
    function verifyChannelState(
        bytes32 channelId,
        uint256 payrollId,
        uint256 totalAmount,
        bytes calldata channelSignature
    ) public view returns (bytes32 channelStateHash) {
        // Compute channel state hash
        channelStateHash = keccak256(
            abi.encodePacked(channelId, payrollId, totalAmount)
        );

        // Verify signature from authorized agent
        bytes32 ethSignedHash = channelStateHash.toEthSignedMessageHash();
        address signer = ethSignedHash.recover(channelSignature);

        if (!authorizedAgents[signer] && signer != owner()) {
            revert InvalidChannelSignature();
        }
    }

    /// @notice Distribute payroll from a verified Yellow Network channel
    /// @param channelId The Yellow Network channel ID
    /// @param payrollId The payroll ID
    /// @param totalAmount Expected total amount
    /// @param channelSignature Yellow Network channel state signature
    /// @param recipients Employee payment details
    function distributeFromChannel(
        bytes32 channelId,
        uint256 payrollId,
        uint256 totalAmount,
        bytes calldata channelSignature,
        PayrollRecipient[] calldata recipients
    ) external onlyAuthorizedAgent nonReentrant returns (uint256 batchId) {
        if (recipients.length == 0) revert EmptyRecipients();
        if (processedChannels[channelId]) revert ChannelAlreadyProcessed();

        // Step 1: Verify channel state
        bytes32 channelStateHash = verifyChannelState(
            channelId,
            payrollId,
            totalAmount,
            channelSignature
        );

        // Step 2: Verify recipient amounts match
        uint256 recipientTotal = 0;
        for (uint256 i = 0; i < recipients.length; i++) {
            recipientTotal += recipients[i].amount;
        }
        if (recipientTotal != totalAmount) revert ChannelAmountMismatch();

        // Step 3: Check contract has sufficient balance
        if (address(this).balance < recipientTotal) revert InsufficientBalance();

        // Step 4: Mark as processed
        processedChannels[channelId] = true;
        channelPayrolls[channelId] = ChannelPayroll({
            channelId: channelId,
            payrollId: payrollId,
            totalAmount: totalAmount,
            settledAt: block.timestamp,
            distributed: true
        });

        // Step 5: Distribute to recipients
        batchId = ++currentBatchId;

        for (uint256 i = 0; i < recipients.length; i++) {
            if (recipients[i].wallet == address(0)) revert ZeroAddress();
            (bool success, ) = recipients[i].wallet.call{
                value: recipients[i].amount
            }("");
            if (!success) revert TransferFailed();
            emit PaymentSent(
                batchId,
                recipients[i].wallet,
                recipients[i].amount
            );
        }

        emit ChannelPayrollVerified(channelId, payrollId, totalAmount);
        emit ChannelDistributionCompleted(channelId, payrollId, recipients.length);
        emit PayrollExecuted(batchId, channelStateHash, recipientTotal, recipients.length);
    }

    // ============ View Functions ============

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function isPayrollProcessed(
        bytes32 stateHash
    ) external view returns (bool) {
        return processedPayrolls[stateHash];
    }

    function isChannelProcessed(bytes32 channelId) external view returns (bool) {
        return processedChannels[channelId];
    }

    function getChannelPayroll(
        bytes32 channelId
    ) external view returns (ChannelPayroll memory) {
        return channelPayrolls[channelId];
    }

    // ============ Emergency ============

    function emergencyWithdraw(uint256 amount) external onlyOwner {
        (bool success, ) = owner().call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    receive() external payable {}
}
