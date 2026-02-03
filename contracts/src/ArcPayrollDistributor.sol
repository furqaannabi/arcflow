// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PayrollRecipient} from "./structs/ArcPayrollDistributorStructs.sol";

/// @title ArcFlow Payroll Distributor
/// @notice Direct payroll distribution using native currency
contract ArcPayrollDistributor is ReentrancyGuard, Ownable {
    // ============ Events ============

    event PayrollExecuted(
        uint256 indexed batchId,
        uint256 totalAmount,
        uint256 recipientCount
    );
    event PaymentSent(
        uint256 indexed batchId,
        address indexed recipient,
        uint256 amount
    );
    event AgentAuthorized(address indexed agent, bool authorized);

    // ============ Errors ============

    error UnauthorizedAgent();
    error InsufficientBalance();
    error ZeroAddress();
    error EmptyRecipients();
    error TransferFailed();

    // ============ State ============

    mapping(address => bool) public authorizedAgents;
    uint256 public currentBatchId;

    // ============ Modifiers ============

    modifier onlyAuthorizedAgent() {
        if (!authorizedAgents[msg.sender] && msg.sender != owner()) {
            revert UnauthorizedAgent();
        }
        _;
    }

    constructor() Ownable(msg.sender) {}

    // ============ Admin ============

    function setAgentAuthorization(
        address agent,
        bool authorized
    ) external onlyOwner {
        if (agent == address(0)) revert ZeroAddress();
        authorizedAgents[agent] = authorized;
        emit AgentAuthorized(agent, authorized);
    }

    // ============ Payroll ============

    /// @notice Execute payroll distribution with native currency
    function executePayroll(
        PayrollRecipient[] calldata recipients
    )
        external
        payable
        onlyAuthorizedAgent
        nonReentrant
        returns (uint256 batchId)
    {
        if (recipients.length == 0) revert EmptyRecipients();

        uint256 total = 0;
        for (uint256 i = 0; i < recipients.length; i++) {
            total += recipients[i].amount;
        }

        if (msg.value != total) revert InsufficientBalance();

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

        emit PayrollExecuted(batchId, total, recipients.length);
    }

    // ============ View ============

    function isAuthorizedAgent(address agent) external view returns (bool) {
        return authorizedAgents[agent];
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // ============ Receive ============

    receive() external payable {}
}
