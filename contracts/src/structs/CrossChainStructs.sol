// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

enum MigrationStatus {
    PENDING,
    COMPLETED,
    FAILED
}

struct MigrationState {
    uint256 payrollId;
    uint256 amount;
    uint256 fromChainId;
    uint256 toChainId;
    uint256 timestamp;
    bytes32 stateHash;
    MigrationStatus status;
}

struct ChainConfig {
    uint256 chainId;
    uint32 circleDomain;
    address router;
    address lpPool;
    bool active;
}

struct ChainApyData {
    uint256 chainId;
    uint256 apy;
    uint256 lastUpdated;
}
