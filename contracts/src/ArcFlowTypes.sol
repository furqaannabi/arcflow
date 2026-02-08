// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ArcFlow Types
/// @notice Shared types, events, and errors for ArcFlow contracts

// ============ Structs ============

struct LPPosition {
    uint256 payrollId;
    address provider;
    uint128 liquidity;
    uint256 usdcDeposited;
    uint256 depositTime;
    uint256 payrollDate;
    bytes32 payrollStateHash;
    uint256 accumulatedYield;
    uint256 sourceChainId;
    uint256 currentChainId;
    uint256 migrationCount;
    PayrollRecipient[] recipients;
    bytes32 recipientsHash;
    bool executed;
    bool distributed;
}

struct CallbackData {
    uint8 action; // 0=addLiquidity, 1=removeLiquidity, 2=swap
    bytes data;
}

struct PayrollRecipient {
    address wallet;
    uint256 amount;
}

// ============ Events ============

library ArcFlowEvents {
    event Deposited(
        uint256 indexed payrollId,
        address indexed provider,
        uint256 usdcAmount,
        uint128 liquidity,
        uint256 payrollDate
    );

    event Withdrawn(
        uint256 indexed payrollId,
        address indexed provider,
        uint128 liquidity,
        uint256 usdcBridged,
        uint256 yield
    );

    event AgentUpdated(address indexed oldAgent, address indexed newAgent);
    event GatewayDepositInitiated(uint256 amount, address recipient);

    event PayrollStateCreated(
        uint256 indexed payrollId,
        bytes32 stateHash,
        address provider,
        uint256 amount,
        uint256 payrollDate
    );

    event FundsMigrated(
        uint256 indexed payrollId,
        uint256 indexed fromChainId,
        uint256 indexed toChainId,
        uint256 amount,
        uint256 yieldBeforeMigration
    );

    event FundsReceived(
        uint256 indexed payrollId,
        uint256 indexed fromChainId,
        uint256 amount,
        bytes32 stateHash
    );

    event YieldAccumulated(
        uint256 indexed payrollId,
        uint256 yieldAmount,
        uint256 totalYield
    );
}

// ============ Errors ============

library ArcFlowErrors {
    error ZeroAmount();
    error Unauthorized();
    error InsufficientBalance();
    error NoPosition();
    error PayrollNotReady();
    error MigrationWindowTooSmall();
    error InvalidMigrationState();
    error PositionNotOnThisChain();
}
