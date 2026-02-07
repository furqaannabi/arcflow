// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {
    MessageHashUtils
} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {
    MigrationState,
    MigrationStatus,
    ChainApyData,
    ChainConfig
} from "./structs/CrossChainStructs.sol";

/// @title ArcFlow State Manager
/// @notice Manages cross-chain APY tracking and migration state
contract ArcFlowStateManager is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ============ State ============

    mapping(address => bool) public authorizedAgents;
    mapping(uint256 => ChainConfig) public chainConfigs;
    uint256[] public supportedChainIds;
    mapping(uint256 => ChainApyData) public chainApys;
    mapping(uint256 => MigrationState) public migrations;
    mapping(bytes32 => bool) public processedMigrations;

    uint256 public constant MIN_MIGRATION_WINDOW = 24 hours;
    uint256 public constant APY_STALE_THRESHOLD = 1 hours;

    // ============ Events ============

    event AgentAuthorized(address indexed agent, bool authorized);
    event ChainConfigured(
        uint256 indexed chainId,
        uint32 circleDomain,
        address router,
        bool active
    );
    event ApyUpdated(uint256 indexed chainId, uint256 apy, uint256 timestamp);
    event MigrationStateUpdated(
        uint256 indexed payrollId,
        MigrationStatus status,
        bytes32 stateHash
    );

    // ============ Errors ============

    error UnauthorizedAgent();
    error ChainNotSupported();
    error StaleApyData();
    error MigrationWindowTooSmall();
    error MigrationAlreadyProcessed();
    error InvalidStateSignature();

    // ============ Modifiers ============

    modifier onlyAuthorizedAgent() {
        if (!authorizedAgents[msg.sender] && msg.sender != owner())
            revert UnauthorizedAgent();
        _;
    }

    // ============ Constructor ============

    constructor() Ownable(msg.sender) {}

    // ============ Admin Functions ============

    function setAgentAuthorization(
        address agent,
        bool authorized
    ) external onlyOwner {
        authorizedAgents[agent] = authorized;
        emit AgentAuthorized(agent, authorized);
    }

    function configureChain(
        uint256 _chainId,
        uint32 circleDomain,
        address router,
        address lpPool,
        bool active
    ) external onlyOwner {
        bool isNew = chainConfigs[_chainId].chainId == 0;

        chainConfigs[_chainId] = ChainConfig({
            chainId: _chainId,
            circleDomain: circleDomain,
            router: router,
            lpPool: lpPool,
            active: active
        });

        if (isNew) {
            supportedChainIds.push(_chainId);
        }

        emit ChainConfigured(_chainId, circleDomain, router, active);
    }

    // ============ Agent Functions ============

    function updateChainApy(
        uint256 _chainId,
        uint256 apy
    ) external onlyAuthorizedAgent {
        if (chainConfigs[_chainId].chainId == 0) revert ChainNotSupported();

        chainApys[_chainId] = ChainApyData({
            chainId: _chainId,
            apy: apy,
            lastUpdated: block.timestamp
        });

        emit ApyUpdated(_chainId, apy, block.timestamp);
    }

    function batchUpdateChainApy(
        uint256[] calldata chainIds,
        uint256[] calldata apys
    ) external onlyAuthorizedAgent {
        require(chainIds.length == apys.length, "Length mismatch");

        for (uint256 i = 0; i < chainIds.length; i++) {
            if (chainConfigs[chainIds[i]].chainId == 0) continue;

            chainApys[chainIds[i]] = ChainApyData({
                chainId: chainIds[i],
                apy: apys[i],
                lastUpdated: block.timestamp
            });

            emit ApyUpdated(chainIds[i], apys[i], block.timestamp);
        }
    }

    function updateMigrationState(
        uint256 payrollId,
        uint256 amount,
        uint256 fromChainId,
        uint256 toChainId,
        MigrationStatus status
    ) external onlyAuthorizedAgent {
        bytes32 stateHash = computeMigrationStateHash(
            payrollId,
            amount,
            fromChainId,
            toChainId,
            block.timestamp
        );

        migrations[payrollId] = MigrationState({
            payrollId: payrollId,
            amount: amount,
            fromChainId: fromChainId,
            toChainId: toChainId,
            timestamp: block.timestamp,
            stateHash: stateHash,
            status: status
        });

        emit MigrationStateUpdated(payrollId, status, stateHash);
    }

    // ============ State Hash Functions ============

    function computeMigrationStateHash(
        uint256 payrollId,
        uint256 amount,
        uint256 fromChainId,
        uint256 toChainId,
        uint256 timestamp
    ) public pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    payrollId,
                    amount,
                    fromChainId,
                    toChainId,
                    timestamp
                )
            );
    }

    function verifyMigrationState(
        uint256 payrollId,
        uint256 amount,
        uint256 fromChainId,
        uint256 toChainId,
        uint256 timestamp,
        bytes calldata signature
    ) external view returns (bool) {
        bytes32 stateHash = computeMigrationStateHash(
            payrollId,
            amount,
            fromChainId,
            toChainId,
            timestamp
        );

        bytes32 ethSignedHash = stateHash.toEthSignedMessageHash();
        address signer = ethSignedHash.recover(signature);

        return authorizedAgents[signer] || signer == owner();
    }

    // ============ View Functions ============

    function getBestChainForApy()
        external
        view
        returns (uint256 bestChainId, uint256 bestApy)
    {
        bestApy = 0;
        bestChainId = 0;

        for (uint256 i = 0; i < supportedChainIds.length; i++) {
            uint256 cid = supportedChainIds[i];
            ChainApyData memory data = chainApys[cid];

            if (block.timestamp - data.lastUpdated > APY_STALE_THRESHOLD)
                continue;
            if (!chainConfigs[cid].active) continue;

            if (data.apy > bestApy) {
                bestApy = data.apy;
                bestChainId = cid;
            }
        }

        return (bestChainId, bestApy);
    }

    function getChainConfig(
        uint256 _chainId
    ) external view returns (ChainConfig memory) {
        return chainConfigs[_chainId];
    }

    function getSupportedChainIds() external view returns (uint256[] memory) {
        return supportedChainIds;
    }

    function getChainApy(
        uint256 _chainId
    ) external view returns (uint256 apy, uint256 lastUpdated, bool isStale) {
        ChainApyData memory data = chainApys[_chainId];
        isStale = block.timestamp - data.lastUpdated > APY_STALE_THRESHOLD;
        return (data.apy, data.lastUpdated, isStale);
    }

    function isMigrationValid(
        uint256 payrollDate
    ) external view returns (bool) {
        return block.timestamp + MIN_MIGRATION_WINDOW < payrollDate;
    }

    function getMigrationState(
        uint256 payrollId
    ) external view returns (MigrationState memory) {
        return migrations[payrollId];
    }
}
