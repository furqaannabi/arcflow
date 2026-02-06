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
/// @dev Supports both direct execution and Yellow Network state channel execution
contract ArcFlowRouter is ArcFlowBase {
    using SafeERC20 for IERC20;

    /// @notice Execution mode for payroll distribution
    enum ExecutionMode {
        Direct,      // Direct on-chain execution via Circle Gateway
        StateChannel // Yellow Network state channel execution
    }

    error ZeroAmount();
    error InvalidDate();
    error NoRecipients();
    error NoPosition();
    error NotReady();
    error WrongChain();
    error InvalidChannelState();
    error ChannelNotSettled();

    event Deposited(uint256 indexed payrollId, address indexed provider, uint256 usdcAmount, uint128 liquidity);
    event Withdrawn(uint256 indexed payrollId, address indexed provider, uint256 usdcBridged, uint256 yield);
    event AgentUpdated(address oldAgent, address newAgent);
    event ChannelSettled(uint256 indexed payrollId, bytes32 indexed channelId, uint256 amount);

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

    /// @notice Internal withdraw logic - only callable via settleFromChannel
    function _executeWithdrawInternal(uint256 payrollId) internal returns (uint256 usdcAmount) {
        LPPosition memory pos = positions[payrollId];
        if (pos.liquidity == 0) revert NoPosition();
        if (block.timestamp < pos.payrollDate) revert NotReady();
        if (pos.currentChainId != chainId) revert WrongChain();

        (uint256 usdc0, uint256 usdt0) = _removeLiquidity(pos.liquidity);
        if (usdt0 > 0) usdc0 += _swap(false, usdt0);

        uint256 yieldAmt = 0;
        if (usdc0 > pos.usdcDeposited) {
            yieldAmt = usdc0 - pos.usdcDeposited;
            usdcAmount = pos.usdcDeposited;
            providerAccumulatedYield[pos.provider] += yieldAmt;
            usdc.safeTransfer(pos.provider, yieldAmt);
        } else {
            usdcAmount = usdc0;
        }

        totalLiquidity -= pos.liquidity;
        delete positions[payrollId];
        _removePayroll(payrollId);
        _removeFromProviderPayrolls(pos.provider, payrollId);

        emit Withdrawn(payrollId, pos.provider, usdcAmount, yieldAmt);
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

    // ============ Yellow Network State Channel Functions ============

    /// @notice Settle a payroll from Yellow Network state channel (REQUIRED)
    /// @dev This is the ONLY way to execute payrolls. Direct execution is disabled.
    /// @param payrollId The payroll to settle
    /// @param channelId The Yellow Network channel ID
    /// @param stateSignature Signature from authorized agent verifying the channel state
    function settleFromChannel(
        uint256 payrollId,
        bytes32 channelId,
        bytes calldata stateSignature
    ) external onlyAgent returns (uint256 usdcAmount) {
        LPPosition memory pos = positions[payrollId];
        if (pos.liquidity == 0) revert NoPosition();
        if (block.timestamp < pos.payrollDate) revert NotReady();
        if (pos.currentChainId != chainId) revert WrongChain();

        // Verify the Yellow Network channel state signature (REQUIRED)
        bytes32 stateHash = keccak256(abi.encodePacked(channelId, payrollId, pos.usdcDeposited));
        bool valid = stateManager.verifyChannelState(channelId, stateHash, stateSignature);
        if (!valid) revert InvalidChannelState();

        // Execute withdrawal via internal method
        usdcAmount = _executeWithdrawInternal(payrollId);

        // Record settlement in state manager
        stateManager.recordChannelSettlement(channelId, payrollId, usdcAmount);

        // Bridge via Circle Gateway
        usdc.approve(address(gatewayWallet), usdcAmount);
        gatewayWallet.deposit(address(usdc), usdcAmount);

        emit ChannelSettled(payrollId, channelId, usdcAmount);
    }

    /// @notice Get execution mode info for a payroll
    /// @param payrollId Payroll to query
    /// @return channelId Associated channel (0x0 if none)
    /// @return isChannelSettled Whether channel is settled
    function getChannelInfo(uint256 payrollId) external view returns (bytes32 channelId, bool isChannelSettled) {
        channelId = stateManager.getPayrollChannel(payrollId);
        if (channelId != bytes32(0)) {
            ArcFlowStateManager.ChannelSettlement memory settlement = stateManager.getChannelSettlement(channelId);
            isChannelSettled = settlement.settledAt > 0;
        }
    }
}
