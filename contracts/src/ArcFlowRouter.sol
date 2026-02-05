// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IGatewayWallet} from "./interfaces/ICircleGateway.sol";
import {ArcFlowStateManager} from "./ArcFlowStateManager.sol";
import {ArcFlowBase} from "./ArcFlowBase.sol";
import {LPPosition} from "./ArcFlowTypes.sol";
import {PayrollRecipient} from "./structs/ArcPayrollDistributorStructs.sol";

/// @title ArcFlow Router
/// @notice Single-sided USDC deposit into existing USDC-USDT pool
contract ArcFlowRouter is ArcFlowBase {
    using SafeERC20 for IERC20;

    error ZeroAmount();
    error InvalidDate();
    error NoRecipients();
    error NoPosition();
    error NotReady();
    error WrongChain();

    event Deposited(uint256 indexed payrollId, address indexed provider, uint256 usdcAmount, uint128 liquidity);
    event Withdrawn(uint256 indexed payrollId, address indexed provider, uint256 usdcBridged, uint256 yield);
    event AgentUpdated(address oldAgent, address newAgent);

    mapping(address => uint256) public providerAccumulatedYield;
    address public migrationContract;

    constructor(
        IPoolManager _poolManager,
        PoolKey memory _existingPoolKey,
        address _gatewayWallet,
        address _stateManager
    ) ArcFlowBase(_poolManager, _existingPoolKey, _gatewayWallet, _stateManager) {}

    function setAgent(address _agent) external onlyOwner {
        emit AgentUpdated(agent, _agent);
        agent = _agent;
    }

    function setMigrationContract(address _migration) external onlyOwner {
        migrationContract = _migration;
    }

    function setGatewayWallet(address _gateway) external onlyOwner {
        gatewayWallet = IGatewayWallet(_gateway);
    }

    function setStateManager(address _stateManager) external onlyOwner {
        stateManager = ArcFlowStateManager(_stateManager);
    }

    function deposit(
        uint256 usdcAmount,
        uint256 payrollDate,
        PayrollRecipient[] calldata recipients
    ) external returns (uint256 payrollId, uint128 liquidity) {
        if (usdcAmount == 0) revert ZeroAmount();
        if (payrollDate <= block.timestamp) revert InvalidDate();
        if (recipients.length == 0) revert NoRecipients();

        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);

        uint256 half = usdcAmount / 2;
        uint256 usdtReceived = _swap(true, half);
        liquidity = _addLiquidity(usdcAmount - half, usdtReceived);

        payrollId = ++nextPayrollId;
        bytes32 rHash = keccak256(abi.encode(recipients));

        positions[payrollId] = LPPosition({
            payrollId: payrollId,
            provider: msg.sender,
            liquidity: liquidity,
            usdcDeposited: usdcAmount,
            depositTime: block.timestamp,
            payrollDate: payrollDate,
            payrollStateHash: keccak256(abi.encodePacked(payrollId, msg.sender, usdcAmount, payrollDate, block.chainid, rHash)),
            accumulatedYield: 0,
            sourceChainId: block.chainid,
            currentChainId: block.chainid,
            migrationCount: 0,
            recipientsHash: rHash
        });

        totalLiquidity += liquidity;
        providerPayrolls[msg.sender].push(payrollId);
        payrollIdIndex[payrollId] = activePayrollIds.length;
        activePayrollIds.push(payrollId);

        emit Deposited(payrollId, msg.sender, usdcAmount, liquidity);
    }

    function withdraw(uint256 payrollId) external onlyAgent returns (uint256) {
        return _executeWithdraw(payrollId);
    }

    function _executeWithdraw(uint256 payrollId) internal returns (uint256 usdcBridged) {
        LPPosition memory pos = positions[payrollId];
        if (pos.liquidity == 0) revert NoPosition();
        if (block.timestamp < pos.payrollDate) revert NotReady();
        if (pos.currentChainId != chainId) revert WrongChain();

        (uint256 usdc0, uint256 usdt0) = _removeLiquidity(pos.liquidity);
        if (usdt0 > 0) usdc0 += _swap(false, usdt0);

        uint256 yieldAmt = 0;
        if (usdc0 > pos.usdcDeposited) {
            yieldAmt = usdc0 - pos.usdcDeposited;
            usdcBridged = pos.usdcDeposited;
            providerAccumulatedYield[pos.provider] += yieldAmt;
            usdc.safeTransfer(pos.provider, yieldAmt);
        } else {
            usdcBridged = usdc0;
        }

        totalLiquidity -= pos.liquidity;
        delete positions[payrollId];
        _removePayroll(payrollId);
        _removeFromProviderPayrolls(pos.provider, payrollId);

        usdc.approve(address(gatewayWallet), usdcBridged);
        gatewayWallet.deposit(address(usdc), usdcBridged);

        emit Withdrawn(payrollId, pos.provider, usdcBridged, yieldAmt);
    }

    function executeReadyPayrolls() external onlyAgent returns (uint256 executed, uint256 totalBridged) {
        uint256[] memory ready = this.getReadyPayrolls();
        for (uint256 i = 0; i < ready.length; i++) {
            totalBridged += _executeWithdraw(ready[i]);
            executed++;
        }
    }

    // Migration helpers - called by migration contract
    function removeLiquidityFor(uint256 payrollId) external returns (uint256) {
        require(msg.sender == migrationContract, "Only migration");
        LPPosition storage pos = positions[payrollId];
        (uint256 usdc0, uint256 usdt0) = _removeLiquidity(pos.liquidity);
        if (usdt0 > 0) usdc0 += _swap(false, usdt0);
        totalLiquidity -= pos.liquidity;
        pos.liquidity = 0;
        usdc.safeTransfer(msg.sender, usdc0);
        return usdc0;
    }

    function addLiquidityFor(uint256 payrollId, uint256 amount) external returns (uint128) {
        require(msg.sender == migrationContract, "Only migration");
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        uint256 half = amount / 2;
        uint256 usdtReceived = _swap(true, half);
        uint128 liq = _addLiquidity(amount - half, usdtReceived);
        positions[payrollId].liquidity = liq;
        totalLiquidity += liq;
        return liq;
    }

    function updatePositionChain(uint256 payrollId, uint256 targetChainId) external {
        require(msg.sender == migrationContract, "Only migration");
        positions[payrollId].currentChainId = targetChainId;
        positions[payrollId].migrationCount++;
    }

    function getPositionData(uint256 payrollId) external view returns (uint128, uint256, uint256) {
        LPPosition memory p = positions[payrollId];
        return (p.liquidity, p.currentChainId, p.payrollDate);
    }

    function getPosition(uint256 payrollId) external view returns (LPPosition memory) {
        return positions[payrollId];
    }

    function getProviderPayrolls(address provider) external view returns (uint256[] memory) {
        return providerPayrolls[provider];
    }

    function getActivePayrollIds() external view returns (uint256[] memory) {
        return activePayrollIds;
    }

    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner, amount);
    }
}
