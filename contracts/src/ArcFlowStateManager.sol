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
import {IDeposit} from "./interfaces/INitrolite.sol";

/// @title ArcFlow State Manager
/// @notice Manages Yellow Network state verification and cross-chain APY tracking
/// @dev Used by ArcFlowRouter for cross-chain migration decisions
contract ArcFlowStateManager is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ============ State ============

    // Authorized agents for state updates
    mapping(address => bool) public authorizedAgents;

    // Chain configurations
    mapping(uint256 => ChainConfig) public chainConfigs;
    uint256[] public supportedChainIds;

    // Chain APY data (updated by agent)
    mapping(uint256 => ChainApyData) public chainApys;

    // Migration state tracking by payrollId
    mapping(uint256 => MigrationState) public migrations;

    // Processed migration hashes to prevent replay
    mapping(bytes32 => bool) public processedMigrations;

    // Constants
    uint256 public constant MIN_MIGRATION_WINDOW = 24 hours;
    uint256 public constant APY_STALE_THRESHOLD = 1 hours;

    // ============ Nitrolite Integration ============

    // Yellow Network Nitrolite contract addresses
    address public nitroliteDeposit;
    address public nitroliteAdjudicator;

    // Channel settlement tracking
    struct ChannelSettlement {
        bytes32 channelId;
        uint256 payrollId;
        uint256 totalAmount;
        uint256 settledAt;
        bool distributed;
    }

    // Channel settlements by channelId
    mapping(bytes32 => ChannelSettlement) public channelSettlements;

    // Payroll to channel mapping
    mapping(uint256 => bytes32) public payrollChannels;

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
    event NitroliteContractsUpdated(address deposit, address adjudicator);
    event ChannelSettlementRecorded(
        bytes32 indexed channelId,
        uint256 indexed payrollId,
        uint256 totalAmount
    );
    event ChannelDistributionCompleted(bytes32 indexed channelId, uint256 indexed payrollId);

    // ============ Errors ============

    error UnauthorizedAgent();
    error ChainNotSupported();
    error StaleApyData();
    error MigrationWindowTooSmall();
    error MigrationAlreadyProcessed();
    error InvalidStateSignature();
    error ChannelAlreadySettled();
    error ChannelNotSettled();
    error InvalidChannelState();

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

    /// @notice Update APY data for a chain
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

    /// @notice Batch update APY for multiple chains
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

    /// @notice Update migration state
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

    /// @notice Compute migration state hash for Yellow Network verification
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

    /// @notice Verify migration state signature from Yellow Network
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

    /// @notice Get the best chain for APY
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

            // Skip stale data
            if (block.timestamp - data.lastUpdated > APY_STALE_THRESHOLD)
                continue;

            // Skip inactive chains
            if (!chainConfigs[cid].active) continue;

            if (data.apy > bestApy) {
                bestApy = data.apy;
                bestChainId = cid;
            }
        }

        return (bestChainId, bestApy);
    }

    /// @notice Get chain config
    function getChainConfig(
        uint256 _chainId
    ) external view returns (ChainConfig memory) {
        return chainConfigs[_chainId];
    }

    /// @notice Get all supported chain IDs
    function getSupportedChainIds() external view returns (uint256[] memory) {
        return supportedChainIds;
    }

    /// @notice Get APY for a specific chain
    function getChainApy(
        uint256 _chainId
    ) external view returns (uint256 apy, uint256 lastUpdated, bool isStale) {
        ChainApyData memory data = chainApys[_chainId];
        isStale = block.timestamp - data.lastUpdated > APY_STALE_THRESHOLD;
        return (data.apy, data.lastUpdated, isStale);
    }

    /// @notice Check if migration is valid (not too close to payroll date)
    function isMigrationValid(
        uint256 payrollDate
    ) external view returns (bool) {
        return block.timestamp + MIN_MIGRATION_WINDOW < payrollDate;
    }

    /// @notice Get migration state for a payroll
    function getMigrationState(
        uint256 payrollId
    ) external view returns (MigrationState memory) {
        return migrations[payrollId];
    }

    // ============ Nitrolite Functions ============

    /// @notice Set Nitrolite contract addresses
    /// @param _deposit Yellow Network deposit/custody contract
    /// @param _adjudicator Yellow Network adjudicator contract
    function setNitroliteContracts(
        address _deposit,
        address _adjudicator
    ) external onlyOwner {
        nitroliteDeposit = _deposit;
        nitroliteAdjudicator = _adjudicator;
        emit NitroliteContractsUpdated(_deposit, _adjudicator);
    }

    /// @notice Record a channel settlement from Yellow Network
    /// @param channelId The settled channel ID
    /// @param payrollId Associated payroll ID
    /// @param totalAmount Total amount settled
    function recordChannelSettlement(
        bytes32 channelId,
        uint256 payrollId,
        uint256 totalAmount
    ) external onlyAuthorizedAgent {
        if (channelSettlements[channelId].settledAt != 0)
            revert ChannelAlreadySettled();

        channelSettlements[channelId] = ChannelSettlement({
            channelId: channelId,
            payrollId: payrollId,
            totalAmount: totalAmount,
            settledAt: block.timestamp,
            distributed: false
        });

        payrollChannels[payrollId] = channelId;

        emit ChannelSettlementRecorded(channelId, payrollId, totalAmount);
    }

    /// @notice Mark channel distribution as completed
    /// @param channelId The channel that was distributed
    function markChannelDistributed(bytes32 channelId) external onlyAuthorizedAgent {
        ChannelSettlement storage settlement = channelSettlements[channelId];
        if (settlement.settledAt == 0) revert ChannelNotSettled();

        settlement.distributed = true;
        emit ChannelDistributionCompleted(channelId, settlement.payrollId);
    }

    /// @notice Verify a channel state hash with signature
    /// @param channelId Channel identifier
    /// @param stateHash Hash of the channel state
    /// @param signature Signature from authorized agent
    /// @return valid Whether the signature is valid
    function verifyChannelState(
        bytes32 channelId,
        bytes32 stateHash,
        bytes calldata signature
    ) external view returns (bool valid) {
        bytes32 ethSignedHash = stateHash.toEthSignedMessageHash();
        address signer = ethSignedHash.recover(signature);
        return authorizedAgents[signer] || signer == owner();
    }

    /// @notice Get channel settlement info
    /// @param channelId Channel to query
    /// @return settlement The settlement data
    function getChannelSettlement(
        bytes32 channelId
    ) external view returns (ChannelSettlement memory) {
        return channelSettlements[channelId];
    }

    /// @notice Get channel ID for a payroll
    /// @param payrollId Payroll to query
    /// @return channelId The associated channel
    function getPayrollChannel(uint256 payrollId) external view returns (bytes32) {
        return payrollChannels[payrollId];
    }

    /// @notice Get balance from Nitrolite custody contract
    /// @param account Account to query
    /// @param token Token address
    /// @return balance The custody balance
    function getNitroliteBalance(
        address account,
        address token
    ) external view returns (uint256) {
        if (nitroliteDeposit == address(0)) return 0;

        address[] memory accounts = new address[](1);
        address[] memory tokens = new address[](1);
        accounts[0] = account;
        tokens[0] = token;

        uint256[] memory balances = IDeposit(nitroliteDeposit).getAccountsBalances(
            accounts,
            tokens
        );

        return balances.length > 0 ? balances[0] : 0;
    }
}
