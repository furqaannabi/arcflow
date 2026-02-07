// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IGatewayWallet} from "./interfaces/ICircleGateway.sol";
import {ArcFlowStateManager} from "./ArcFlowStateManager.sol";
import {ArcFlowBase} from "./ArcFlowBase.sol";
import {LPPosition, PayrollRecipient} from "./ArcFlowTypes.sol";

contract ArcFlowRouter is ArcFlowBase {
    using SafeERC20 for IERC20;

    error ZeroAmount();
    error InvalidDate();
    error NoRecipients();
    error NoPosition();
    error NotReady();
    error WrongChain();
    error AlreadySeeded();
    error NotMigration();
    error NotProvider();
    error NotOnThisChain();

    event Deposited(
        uint256 indexed payrollId,
        address indexed provider,
        uint256 usdcAmount,
        uint128 liquidity
    );

    event Withdrawn(
        uint256 indexed payrollId,
        address indexed provider,
        uint256 usdcBridged,
        uint256 yieldAmt
    );

    event Executed(
        uint256 indexed payrollId,
        uint256 amount
    );

    event Cancelled(
        uint256 indexed payrollId,
        address indexed provider,
        uint256 amountReturned
    );

    mapping(address => uint256) public providerYield;
    address public migration;

    constructor(
        IPoolManager _pm,
        PoolKey memory _pk,
        address _gw,
        address _sm
    ) ArcFlowBase(_pm, _pk, _gw, _sm) {}

    function setAgent(address _a) external onlyOwner {
        agent = _a;
    }

    function setMigration(address _m) external onlyOwner {
        migration = _m;
    }

    function setGateway(address _g) external onlyOwner {
        gatewayWallet = IGatewayWallet(_g);
    }

    function setStateMgr(address _s) external onlyOwner {
        stateManager = ArcFlowStateManager(_s);
    }

    function deposit(
        uint256 amt,
        uint256 date,
        PayrollRecipient[] memory r
    ) external returns (uint256 pid, uint128 liq) {
        if (amt == 0) revert ZeroAmount();
        if (date <= block.timestamp) revert InvalidDate();
        if (r.length == 0) revert NoRecipients();

        usdc.safeTransferFrom(msg.sender, address(this), amt);

        uint256 half = amt / 2;
        uint256 swapped = _swap(true, half);

        liq = _addLiquidity(amt - half, swapped);
        if (liq == 0) revert ZeroAmount();

        pid = ++nextPayrollId;

        bytes32 rHash = keccak256(abi.encode(r));

        positions[pid] = LPPosition({
            payrollId: pid,
            provider: msg.sender,
            liquidity: liq,
            usdcDeposited: amt,
            recipients: r,
            depositTime: block.timestamp,
            payrollDate: date,
            payrollStateHash: keccak256(
                abi.encodePacked(
                    pid,
                    msg.sender,
                    amt,
                    date,
                    block.chainid,
                    rHash
                )
            ),
            accumulatedYield: 0,
            sourceChainId: block.chainid,
            currentChainId: block.chainid,
            migrationCount: 0,
            recipientsHash: rHash
        });

        totalLiquidity += liq;
        providerPayrolls[msg.sender].push(pid);
        payrollIdIndex[pid] = activePayrollIds.length;
        activePayrollIds.push(pid);

        emit Deposited(pid, msg.sender, amt, liq);
        return (pid, liq);
    }

    function _withdraw(uint256 pid) internal returns (uint256 amt) {
        LPPosition memory p = positions[pid];
        if (p.liquidity == 0) revert NoPosition();
        if (block.timestamp < p.payrollDate) revert NotReady();
        if (p.currentChainId != chainId) revert WrongChain();

        (uint256 u0, uint256 u1) = _removeLiquidity(p.liquidity);
        if (u1 > 0) u0 += _swap(false, u1);

        uint256 y = 0;
        if (u0 > p.usdcDeposited) {
            y = u0 - p.usdcDeposited;
            amt = p.usdcDeposited;
            providerYield[p.provider] += y;
            usdc.safeTransfer(p.provider, y);
        } else {
            amt = u0;
        }

        totalLiquidity -= p.liquidity;
        delete positions[pid];

        _removePayroll(pid);
        _removeFromProviderPayrolls(p.provider, pid);

        emit Withdrawn(pid, p.provider, amt, y);
    }

    modifier onlyMigration() {
        if (msg.sender != migration) revert NotMigration();
        _;
    }

    function removeLiqFor(
        uint256 pid
    ) external onlyMigration returns (uint256) {
        LPPosition storage p = positions[pid];
        (uint256 u0, uint256 u1) = _removeLiquidity(p.liquidity);
        if (u1 > 0) u0 += _swap(false, u1);
        totalLiquidity -= p.liquidity;
        p.liquidity = 0;
        usdc.safeTransfer(msg.sender, u0);
        return u0;
    }

    function addLiqFor(
        uint256 pid,
        uint256 amt
    ) external onlyMigration returns (uint128) {
        usdc.safeTransferFrom(msg.sender, address(this), amt);
        uint256 half = amt / 2;
        uint128 liq = _addLiquidity(amt - half, _swap(true, half));
        positions[pid].liquidity = liq;
        totalLiquidity += liq;
        return liq;
    }

    function updatePosChain(uint256 pid, uint256 cid) external onlyMigration {
        positions[pid].currentChainId = cid;
        positions[pid].migrationCount++;
    }

    function getPos(uint256 pid) external view returns (LPPosition memory) {
        return positions[pid];
    }

    function getActiveIds() external view returns (uint256[] memory) {
        return activePayrollIds;
    }

    function rescue(address t, uint256 a) external onlyOwner {
        IERC20(t).safeTransfer(owner, a);
    }

    function execute(
        uint256 pid
    ) external onlyAgent returns (uint256 amt) {
        amt = _withdraw(pid);
        usdc.approve(address(gatewayWallet), amt);
        gatewayWallet.deposit(address(usdc), amt);
        emit Executed(pid, amt);
    }

    function cancel(uint256 pid) external returns (uint256 amt) {
        LPPosition storage p = positions[pid];
        if (p.provider != msg.sender) revert NotProvider();
        if (p.liquidity == 0) revert NoPosition();
        if (p.currentChainId != chainId) revert NotOnThisChain();
        if (block.timestamp >= p.payrollDate) revert NotReady();

        uint128 liq = p.liquidity;
        (uint256 u0, uint256 u1) = _removeLiquidity(liq);
        if (u1 > 0) u0 += _swap(false, u1);
        amt = u0;

        totalLiquidity -= liq;
        address provider = p.provider;

        delete positions[pid];
        _removePayroll(pid);
        _removeFromProviderPayrolls(provider, pid);

        usdc.safeTransfer(provider, amt);
        emit Cancelled(pid, provider, amt);
    }

    function getPosData(
        uint256 pid
    ) external view returns (uint128, uint256, uint256) {
        LPPosition storage p = positions[pid];
        return (p.liquidity, p.currentChainId, p.payrollDate);
    }

    function getProviderPayrolls(
        address p
    ) external view returns (uint256[] memory) {
        return providerPayrolls[p];
    }

    function seed(uint256 a0, uint256 a1) external onlyOwner {
        if (totalLiquidity > 0) revert AlreadySeeded();
        usdc.safeTransferFrom(msg.sender, address(this), a0);
        usdt.safeTransferFrom(msg.sender, address(this), a1);
        _addLiquidity(a0, a1);
    }
}
