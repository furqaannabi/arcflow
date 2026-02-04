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
    event AgentUpdated(address indexed oldAgent, address indexed newAgent);

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
        usdcBridged = usdc0;

        uint128 liq = pos.liquidity;
        address provider = pos.provider;
        delete positions[payrollId];
        totalLiquidity -= liq;

        _removePayroll(payrollId);
        _removeFromProviderPayrolls(provider, payrollId);

        usdc.approve(address(gatewayWallet), usdcBridged);
        gatewayWallet.deposit(address(usdc), usdcBridged);

        emit Withdrawn(payrollId, provider, liq, usdcBridged, 0);
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
