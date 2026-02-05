// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId} from "v4-core/src/types/PoolId.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IGatewayWallet, IGatewayMinter} from "./interfaces/ICircleGateway.sol";
import {ArcFlowStateManager} from "./ArcFlowStateManager.sol";
import {ArcFlowBase} from "./ArcFlowBase.sol";
import {LPPosition} from "./ArcFlowTypes.sol";
import {PayrollRecipient} from "./structs/ArcPayrollDistributorStructs.sol";
import {MigrationStatus} from "./structs/CrossChainStructs.sol";

/// @title ArcFlow Router
/// @notice Single-sided USDC deposit into existing USDC-USDT pool
contract ArcFlowRouter is ArcFlowBase {
    using SafeERC20 for IERC20;

    // ============ Events ============

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
    event YieldCredited(
        uint256 indexed payrollId,
        address indexed provider,
        uint256 yieldAmount,
        uint256 totalWithdrawn,
        uint256 originalDeposit
    );
    event AgentUpdated(address indexed oldAgent, address indexed newAgent);
    event MigrationOut(
        uint256 indexed payrollId,
        uint256 fromChainId,
        uint256 toChainId,
        uint256 amount
    );
    event MigrationIn(
        uint256 indexed payrollId,
        uint256 fromChainId,
        uint256 amount,
        uint128 newLiquidity
    );

    // Track yield per provider
    mapping(address => uint256) public providerAccumulatedYield;

    // Track pending migrations (payrollId => migrated USDC amount)
    mapping(uint256 => uint256) public pendingMigrations;

    // ============ Constructor ============

    constructor(
        IPoolManager _poolManager,
        PoolKey memory _existingPoolKey,
        address _gatewayWallet,
        address _stateManager
    ) ArcFlowBase(_poolManager, _existingPoolKey, _gatewayWallet, _stateManager) {}

    // ============ Admin ============

    function setAgent(address _agent) external onlyOwner {
        emit AgentUpdated(agent, _agent);
        agent = _agent;
    }

    function setGatewayWallet(address _gateway) external onlyOwner {
        gatewayWallet = IGatewayWallet(_gateway);
    }

    function setGatewayMinter(address _gatewayMinter) external onlyOwner {
        gatewayMinter = IGatewayMinter(_gatewayMinter);
    }

    function setStateManager(address _stateManager) external onlyOwner {
        stateManager = ArcFlowStateManager(_stateManager);
    }

    // ============ Deposit ============

    function deposit(
        uint256 usdcAmount,
        uint256 payrollDate,
        PayrollRecipient[] calldata recipients
    ) external returns (uint256 payrollId, uint128 liquidity) {
        require(usdcAmount > 0, "Zero amount");
        require(payrollDate > block.timestamp, "Invalid date");
        require(recipients.length > 0, "No recipients");

        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);

        uint256 swapAmount = usdcAmount / 2;
        uint256 usdtReceived = _swap(true, swapAmount);

        uint256 usdcForLp = usdcAmount - swapAmount;
        liquidity = _addLiquidity(usdcForLp, usdtReceived);

        payrollId = ++nextPayrollId;
        bytes32 recipientsHash = keccak256(abi.encode(recipients));

        positions[payrollId] = LPPosition({
            payrollId: payrollId,
            provider: msg.sender,
            liquidity: liquidity,
            usdcDeposited: usdcAmount,
            depositTime: block.timestamp,
            payrollDate: payrollDate,
            payrollStateHash: keccak256(abi.encodePacked(payrollId, msg.sender, usdcAmount, payrollDate, block.chainid, recipientsHash)),
            accumulatedYield: 0,
            sourceChainId: block.chainid,
            currentChainId: block.chainid,
            migrationCount: 0,
            recipientsHash: recipientsHash
        });

        totalLiquidity += liquidity;
        providerPayrolls[msg.sender].push(payrollId);
        payrollIdIndex[payrollId] = activePayrollIds.length;
        activePayrollIds.push(payrollId);

        emit Deposited(payrollId, msg.sender, usdcAmount, liquidity, payrollDate);
    }

    // ============ Withdraw ============

    function withdraw(uint256 payrollId) external onlyAgent returns (uint256 usdcBridged) {
        usdcBridged = _executeWithdraw(payrollId);
    }

    function _executeWithdraw(uint256 payrollId) internal returns (uint256 usdcBridged) {
        LPPosition memory pos = positions[payrollId];
        require(pos.liquidity > 0, "No position");
        require(block.timestamp >= pos.payrollDate, "Not ready");
        require(pos.currentChainId == chainId, "Wrong chain");

        (uint256 usdc0, uint256 usdt0) = _removeLiquidity(pos.liquidity);
        if (usdt0 > 0) usdc0 += _swap(false, usdt0);

        // Calculate yield (can be positive or negative due to IL)
        uint256 yieldAmount = 0;
        uint256 originalDeposit = pos.usdcDeposited;

        if (usdc0 > originalDeposit) {
            // Positive yield - send principal to gateway, yield to provider
            yieldAmount = usdc0 - originalDeposit;
            usdcBridged = originalDeposit;

            // Credit yield to provider
            providerAccumulatedYield[pos.provider] += yieldAmount;

            // Transfer yield directly to provider
            usdc.safeTransfer(pos.provider, yieldAmount);

            emit YieldCredited(payrollId, pos.provider, yieldAmount, usdc0, originalDeposit);
        } else {
            // No yield or negative (IL) - bridge whatever we got
            usdcBridged = usdc0;
        }

        uint128 liq = pos.liquidity;
        address provider = pos.provider;
        delete positions[payrollId];
        totalLiquidity -= liq;

        _removePayroll(payrollId);
        _removeFromProviderPayrolls(provider, payrollId);

        // Bridge principal to gateway for distribution
        usdc.approve(address(gatewayWallet), usdcBridged);
        gatewayWallet.deposit(address(usdc), usdcBridged);

        emit Withdrawn(payrollId, provider, liq, usdcBridged, yieldAmount);
    }

    // ============ Migration Functions ============

    /// @notice Migrate funds OUT to another chain for better yield
    /// @dev Removes LP, converts to USDC, bridges via Circle Gateway
    /// @param payrollId The payroll to migrate
    /// @param targetChainId The destination chain ID
    /// @return amount The USDC amount being migrated
    function migrateOut(
        uint256 payrollId,
        uint256 targetChainId
    ) external onlyAgent returns (uint256 amount) {
        LPPosition storage pos = positions[payrollId];
        require(pos.liquidity > 0, "No position");
        require(pos.currentChainId == chainId, "Not on this chain");
        require(targetChainId != chainId, "Same chain");

        // Check migration is valid (not too close to payroll date)
        require(
            stateManager.isMigrationValid(pos.payrollDate),
            "Too close to payroll date"
        );

        // Remove liquidity
        (uint256 usdc0, uint256 usdt0) = _removeLiquidity(pos.liquidity);

        // Swap USDT back to USDC
        if (usdt0 > 0) {
            usdc0 += _swap(false, usdt0);
        }

        amount = usdc0;

        // Update position state
        uint128 oldLiquidity = pos.liquidity;
        pos.liquidity = 0;
        pos.currentChainId = targetChainId;
        pos.migrationCount++;

        totalLiquidity -= oldLiquidity;

        // Update state manager
        stateManager.updateMigrationState(
            payrollId,
            amount,
            chainId,
            targetChainId,
            MigrationStatus.PENDING
        );

        // Bridge USDC via Circle Gateway
        usdc.approve(address(gatewayWallet), amount);
        gatewayWallet.deposit(address(usdc), amount);

        emit MigrationOut(payrollId, chainId, targetChainId, amount);
    }

    /// @notice Migrate funds IN from another chain
    /// @dev Mints USDC from Circle Gateway, adds to LP
    /// @param payrollId The payroll being migrated
    /// @param fromChainId The source chain ID
    /// @param amount The USDC amount being received
    /// @param attestation Circle Gateway attestation
    /// @param signature Circle Gateway signature
    /// @return newLiquidity The new LP position liquidity
    function migrateIn(
        uint256 payrollId,
        uint256 fromChainId,
        uint256 amount,
        bytes calldata attestation,
        bytes calldata signature
    ) external onlyAgent returns (uint128 newLiquidity) {
        LPPosition storage pos = positions[payrollId];
        require(pos.currentChainId == chainId, "Not migrating to this chain");
        require(pos.liquidity == 0, "Already has liquidity");

        // Mint USDC from Circle Gateway
        gatewayMinter.gatewayMint(attestation, signature);

        // Add to LP pool
        uint256 swapAmount = amount / 2;
        uint256 usdtReceived = _swap(true, swapAmount);
        uint256 usdcForLp = amount - swapAmount;

        newLiquidity = _addLiquidity(usdcForLp, usdtReceived);

        // Update position
        pos.liquidity = newLiquidity;
        totalLiquidity += newLiquidity;

        // Update state manager
        stateManager.updateMigrationState(
            payrollId,
            amount,
            fromChainId,
            chainId,
            MigrationStatus.COMPLETED
        );

        emit MigrationIn(payrollId, fromChainId, amount, newLiquidity);
    }

    /// @notice Get payrolls eligible for migration (to better yield chain)
    /// @return payrollIds Array of payroll IDs that can be migrated
    /// @return currentApys Current APY for each position
    function getMigratablePayrolls()
        external
        view
        returns (uint256[] memory payrollIds, uint256[] memory currentApys)
    {
        uint256 count = 0;

        // Count eligible payrolls
        for (uint256 i = 0; i < activePayrollIds.length; i++) {
            LPPosition memory pos = positions[activePayrollIds[i]];
            if (
                pos.currentChainId == chainId &&
                pos.liquidity > 0 &&
                stateManager.isMigrationValid(pos.payrollDate)
            ) {
                count++;
            }
        }

        // Build arrays
        payrollIds = new uint256[](count);
        currentApys = new uint256[](count);
        uint256 idx = 0;

        (uint256 currentChainApy, , ) = stateManager.getChainApy(chainId);

        for (uint256 i = 0; i < activePayrollIds.length; i++) {
            uint256 pid = activePayrollIds[i];
            LPPosition memory pos = positions[pid];
            if (
                pos.currentChainId == chainId &&
                pos.liquidity > 0 &&
                stateManager.isMigrationValid(pos.payrollDate)
            ) {
                payrollIds[idx] = pid;
                currentApys[idx] = currentChainApy;
                idx++;
            }
        }
    }

    /// @notice Check if migration is recommended for a payroll
    /// @param payrollId The payroll to check
    /// @return migrate Whether migration is recommended
    /// @return targetChain The recommended target chain (0 if no migration)
    /// @return apyDiff The APY difference in basis points
    function shouldMigrate(
        uint256 payrollId
    )
        external
        view
        returns (bool migrate, uint256 targetChain, uint256 apyDiff)
    {
        LPPosition memory pos = positions[payrollId];

        if (pos.currentChainId != chainId || pos.liquidity == 0) {
            return (false, 0, 0);
        }

        if (!stateManager.isMigrationValid(pos.payrollDate)) {
            return (false, 0, 0);
        }

        (uint256 currentApy, , ) = stateManager.getChainApy(chainId);
        (uint256 bestChain, uint256 bestApy) = stateManager.getBestChainForApy();

        if (bestChain != chainId && bestApy > currentApy) {
            apyDiff = bestApy - currentApy;
            // Recommend migration if APY diff > 50 basis points (0.5%)
            if (apyDiff >= 50) {
                return (true, bestChain, apyDiff);
            }
        }

        return (false, 0, 0);
    }

    // ============ View Functions ============

    function getPoolKey() external view returns (PoolKey memory) {
        return poolKey;
    }

    function getPoolId() external view returns (PoolId) {
        return poolId;
    }

    function getPosition(uint256 payrollId) external view returns (LPPosition memory) {
        return positions[payrollId];
    }

    function getProviderPayrolls(address provider) external view returns (uint256[] memory) {
        return providerPayrolls[provider];
    }

    function getProviderPositions(address provider) external view returns (LPPosition[] memory) {
        uint256[] memory payrollIds = providerPayrolls[provider];
        LPPosition[] memory result = new LPPosition[](payrollIds.length);
        for (uint256 i = 0; i < payrollIds.length; i++) {
            result[i] = positions[payrollIds[i]];
        }
        return result;
    }

    function getActivePayrollsCount() external view returns (uint256) {
        return activePayrollIds.length;
    }

    function getActivePayrollIds() external view returns (uint256[] memory) {
        return activePayrollIds;
    }

    function getChainId() external view returns (uint256) {
        return chainId;
    }

    function getProviderAccumulatedYield(address provider) external view returns (uint256) {
        return providerAccumulatedYield[provider];
    }

    // ============ Batch Execute ============

    /// @notice Execute all ready payrolls in a single transaction
    function executeReadyPayrolls() external onlyAgent returns (uint256 executed, uint256 totalBridged) {
        uint256[] memory ready = this.getReadyPayrolls();
        for (uint256 i = 0; i < ready.length; i++) {
            totalBridged += _executeWithdraw(ready[i]);
            executed++;
        }
    }

    // ============ Emergency ============

    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner, amount);
    }
}
