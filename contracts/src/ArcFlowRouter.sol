// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {
    IUnlockCallback
} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {
    ModifyLiquidityParams,
    SwapParams
} from "v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IGatewayWallet, IGatewayMinter} from "./interfaces/ICircleGateway.sol";
import {ArcFlowStateManager} from "./ArcFlowStateManager.sol";
import {PayrollRecipient} from "./structs/ArcPayrollDistributorStructs.sol";

/// @title ArcFlow Router
/// @notice Single-sided USDC deposit into existing USDC-USDT pool
/// @dev User deposits USDC only - 50% swapped to USDT for LP, swapped back on withdrawal
contract ArcFlowRouter is IUnlockCallback {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;

    // ============ Structs ============

    struct CallbackData {
        uint8 action; // 0=addLiquidity, 1=removeLiquidity, 2=swap
        address sender;
        bytes data;
    }

    struct LPPosition {
        uint256 payrollId;
        address provider;
        uint128 liquidity;
        uint256 usdcDeposited;
        uint256 depositTime;
        uint256 payrollDate;
        bytes32 payrollStateHash; // Yellow Network state verification
        // Cross-chain yield tracking
        uint256 accumulatedYield; // Total yield accumulated across chains
        uint256 sourceChainId; // Original deposit chain
        uint256 currentChainId; // Current position chain
        uint256 migrationCount; // Number of cross-chain moves
        bytes32 recipientsHash; // Hash of payroll recipients
    }

    // ============ State ============

    IPoolManager public immutable poolManager;
    IERC20 public immutable usdc;
    IERC20 public immutable usdt;
    IGatewayWallet public gatewayWallet;
    IGatewayMinter public gatewayMinter;
    ArcFlowStateManager public stateManager;

    PoolKey public poolKey;
    PoolId public poolId;

    address public agent;
    address public owner;
    uint256 public immutable chainId;

    // LP positions by payrollId
    mapping(uint256 => LPPosition) public positions;
    // Provider's active payroll IDs
    mapping(address => uint256[]) public providerPayrolls;
    // All active payroll IDs for iteration
    uint256[] public activePayrollIds;
    // Index of payrollId in activePayrollIds array
    mapping(uint256 => uint256) public payrollIdIndex;
    uint256 public totalLiquidity;
    uint256 public nextPayrollId;

    // Full range ticks
    int24 constant TICK_LOWER = -887220;
    int24 constant TICK_UPPER = 887220;

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
    event GatewayDepositInitiated(uint256 amount, address recipient);

    // Yellow Network state verification
    event PayrollStateCreated(
        uint256 indexed payrollId,
        bytes32 stateHash,
        address provider,
        uint256 amount,
        uint256 payrollDate
    );

    // Cross-chain migration events
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

    // ============ Errors ============

    error ZeroAmount();
    error Unauthorized();
    error InsufficientBalance();
    error NoPosition();
    error PayrollNotReady();
    error MigrationWindowTooSmall();
    error InvalidMigrationState();
    error PositionNotOnThisChain();

    // ============ Modifiers ============

    modifier onlyAgent() {
        if (msg.sender != agent && msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    // ============ Constructor ============

    constructor(
        IPoolManager _poolManager,
        PoolKey memory _existingPoolKey,
        address _gatewayWallet,
        address _stateManager
    ) {
        poolManager = _poolManager;
        poolKey = _existingPoolKey;
        poolId = _existingPoolKey.toId();
        owner = msg.sender;
        gatewayWallet = IGatewayWallet(_gatewayWallet);
        stateManager = ArcFlowStateManager(_stateManager);
        chainId = block.chainid;

        // Set token references from pool key
        usdc = IERC20(Currency.unwrap(_existingPoolKey.currency0));
        usdt = IERC20(Currency.unwrap(_existingPoolKey.currency1));
    }

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

    // ============ Single-Sided Deposit ============

    /// @notice Deposit USDC with scheduled payroll date
    /// @param usdcAmount Amount of USDC to deposit
    /// @param payrollDate Scheduled time for withdrawal/bridging
    /// @param recipients List of employees and amounts
    function deposit(
        uint256 usdcAmount,
        uint256 payrollDate,
        PayrollRecipient[] calldata recipients
    ) external returns (uint256 payrollId, uint128 liquidity) {
        if (usdcAmount == 0) revert ZeroAmount();
        if (payrollDate <= block.timestamp) revert ZeroAmount(); // payroll must be in future
        if (recipients.length == 0) revert ZeroAmount(); // Reuse error or create new EmptyRecipients

        // Transfer USDC from user
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);

        // Swap 50% USDC to USDT
        uint256 swapAmount = usdcAmount / 2;
        uint256 usdtReceived = _swap(true, swapAmount); // true = USDC to USDT

        // Add liquidity with both tokens
        uint256 usdcForLp = usdcAmount - swapAmount;
        liquidity = _addLiquidity(usdcForLp, usdtReceived);

        // Generate payroll ID
        payrollId = ++nextPayrollId;

        // Compute recipients hash
        bytes32 recipientsHash = keccak256(abi.encode(recipients));

        // Compute state hash for Yellow Network verification
        bytes32 stateHash = keccak256(
            abi.encodePacked(
                payrollId,
                msg.sender,
                usdcAmount,
                payrollDate,
                block.chainid,
                recipientsHash
            )
        );

        // Track position by payrollId
        positions[payrollId] = LPPosition({
            payrollId: payrollId,
            provider: msg.sender,
            liquidity: liquidity,
            usdcDeposited: usdcAmount,
            depositTime: block.timestamp,
            payrollDate: payrollDate,
            payrollStateHash: stateHash,
            accumulatedYield: 0,
            sourceChainId: block.chainid,
            currentChainId: block.chainid,
            migrationCount: 0,
            recipientsHash: recipientsHash
        });
        totalLiquidity += liquidity;

        // Add to provider's payrolls and active payroll list
        providerPayrolls[msg.sender].push(payrollId);
        payrollIdIndex[payrollId] = activePayrollIds.length;
        activePayrollIds.push(payrollId);

        emit Deposited(
            payrollId,
            msg.sender,
            usdcAmount,
            liquidity,
            payrollDate
        );
        emit PayrollStateCreated(
            payrollId,
            stateHash,
            msg.sender,
            usdcAmount,
            payrollDate
        );
    }

    // ============ Withdrawal to Gateway (Agent Only) ============

    /// @notice Withdraw LP by payrollId, swap USDT back to USDC, deposit to Circle Gateway
    /// @param payrollId The payroll ID to withdraw
    function withdraw(
        uint256 payrollId
    ) external onlyAgent returns (uint256 usdcBridged) {
        LPPosition memory pos = positions[payrollId];
        if (pos.liquidity == 0) revert NoPosition();
        if (block.timestamp < pos.payrollDate) revert PayrollNotReady();
        if (pos.currentChainId != chainId) revert PositionNotOnThisChain();

        // Remove liquidity - get USDC and USDT
        (uint256 usdc0, uint256 usdt0) = _removeLiquidity(pos.liquidity);

        // Swap all USDT back to USDC
        uint256 usdcFromSwap = 0;
        if (usdt0 > 0) {
            usdcFromSwap = _swap(false, usdt0); // false = USDT to USDC
        }

        usdcBridged = usdc0 + usdcFromSwap;

        // Calculate yield (current amount - deposited + previously accumulated)
        uint256 yield = 0;
        if (usdcBridged > pos.usdcDeposited) {
            yield = usdcBridged - pos.usdcDeposited + pos.accumulatedYield;
        } else {
            yield = pos.accumulatedYield;
        }

        // Clear position
        uint128 liq = pos.liquidity;
        address provider = pos.provider;
        delete positions[payrollId];
        totalLiquidity -= liq;

        // Remove from active payrolls
        _removePayroll(payrollId);
        // Remove from provider's payroll list
        _removeFromProviderPayrolls(provider, payrollId);

        // Deposit all USDC to Circle Gateway
        usdc.approve(address(gatewayWallet), usdcBridged);
        gatewayWallet.deposit(address(usdc), usdcBridged);

        emit Withdrawn(payrollId, provider, liq, usdcBridged, yield);
    }

    // ============ Cross-Chain Migration (Agent Only) ============

    /// @notice Migrate position to another chain for better APY
    /// @param payrollId The payroll ID to migrate
    /// @param destinationDomain Circle Gateway domain ID of target chain
    function migrateToChain(
        uint256 payrollId,
        uint32 destinationDomain
    ) external onlyAgent returns (uint256 usdcMigrated) {
        LPPosition storage pos = positions[payrollId];
        if (pos.liquidity == 0) revert NoPosition();
        if (pos.currentChainId != chainId) revert PositionNotOnThisChain();

        // Check migration window (must be at least 24h before payroll date)
        if (!stateManager.isMigrationValid(pos.payrollDate)) {
            revert MigrationWindowTooSmall();
        }

        // Remove liquidity - get USDC and USDT
        (uint256 usdc0, uint256 usdt0) = _removeLiquidity(pos.liquidity);

        // Swap all USDT back to USDC
        uint256 usdcFromSwap = 0;
        if (usdt0 > 0) {
            usdcFromSwap = _swap(false, usdt0);
        }

        usdcMigrated = usdc0 + usdcFromSwap;

        // Calculate and store yield before migration
        uint256 yieldThisPeriod = 0;
        if (usdcMigrated > pos.usdcDeposited) {
            yieldThisPeriod = usdcMigrated - pos.usdcDeposited;
        }
        pos.accumulatedYield += yieldThisPeriod;

        // Update position state for migration
        uint256 fromChainId = pos.currentChainId;
        pos.currentChainId = 0; // In transit
        pos.liquidity = 0; // No longer in LP here
        pos.migrationCount++;

        // Update state hash for Yellow Network verification
        pos.payrollStateHash = keccak256(
            abi.encodePacked(
                payrollId,
                pos.provider,
                usdcMigrated,
                pos.payrollDate,
                fromChainId,
                destinationDomain,
                block.timestamp
            )
        );

        totalLiquidity -= pos.liquidity;

        // Deposit to Circle Gateway unified balance
        // Agent will coordinate minting on destination chain via Yellow Network
        usdc.approve(address(gatewayWallet), usdcMigrated);
        gatewayWallet.deposit(address(usdc), usdcMigrated);

        emit FundsMigrated(
            payrollId,
            fromChainId,
            destinationDomain,
            usdcMigrated,
            pos.accumulatedYield
        );
        emit YieldAccumulated(payrollId, yieldThisPeriod, pos.accumulatedYield);
    }

    /// @notice Receive migrated funds from another chain via Circle Gateway mint
    /// @param attestation Circle Gateway attestation from API
    /// @param signature Circle Gateway signature from API
    /// @param payrollId Original payroll ID
    /// @param fromChainId Source chain ID
    /// @param amount Expected amount being received
    /// @param provider Original provider address
    /// @param payrollDate Original payroll date
    /// @param _accumulatedYield Previously accumulated yield
    /// @param recipientsHash Recipients hash
    /// @param stateSignature Yellow Network state signature
    function receiveFromChain(
        bytes calldata attestation,
        bytes calldata signature,
        uint256 payrollId,
        uint256 fromChainId,
        uint256 amount,
        address provider,
        uint256 payrollDate,
        uint256 _accumulatedYield,
        bytes32 recipientsHash,
        bytes calldata stateSignature
    ) external onlyAgent {
        // Verify state from Yellow Network
        bytes32 stateHash = keccak256(
            abi.encodePacked(
                payrollId,
                provider,
                amount,
                payrollDate,
                fromChainId,
                chainId
            )
        );

        // Verify Yellow Network signature
        if (
            !stateManager.verifyMigrationState(
                payrollId,
                amount,
                fromChainId,
                chainId,
                block.timestamp,
                stateSignature
            )
        ) {
            revert InvalidMigrationState();
        }

        // Mint USDC from Circle Gateway
        uint256 balanceBefore = usdc.balanceOf(address(this));
        gatewayMinter.gatewayMint(attestation, signature);
        uint256 minted = usdc.balanceOf(address(this)) - balanceBefore;

        // Verify minted amount matches expected
        require(minted >= amount, "Minted amount mismatch");

        // Swap 50% USDC to USDT for LP
        uint256 swapAmount = amount / 2;
        uint256 usdtReceived = _swap(true, swapAmount);

        // Add liquidity
        uint256 usdcForLp = amount - swapAmount;
        uint128 liquidity = _addLiquidity(usdcForLp, usdtReceived);

        // Create/update position on this chain
        positions[payrollId] = LPPosition({
            payrollId: payrollId,
            provider: provider,
            liquidity: liquidity,
            usdcDeposited: amount,
            depositTime: block.timestamp,
            payrollDate: payrollDate,
            payrollStateHash: stateHash,
            accumulatedYield: _accumulatedYield,
            sourceChainId: fromChainId,
            currentChainId: chainId,
            migrationCount: positions[payrollId].migrationCount + 1,
            recipientsHash: recipientsHash
        });

        totalLiquidity += liquidity;

        // Track if new position on this chain
        bool isNew = true;
        uint256[] memory existingPayrolls = providerPayrolls[provider];
        for (uint256 i = 0; i < existingPayrolls.length; i++) {
            if (existingPayrolls[i] == payrollId) {
                isNew = false;
                break;
            }
        }
        if (isNew) {
            providerPayrolls[provider].push(payrollId);
            payrollIdIndex[payrollId] = activePayrollIds.length;
            activePayrollIds.push(payrollId);
        }

        emit FundsReceived(payrollId, fromChainId, amount, stateHash);
    }

    // ============ Internal: Swap ============

    function _swap(
        bool zeroForOne,
        uint256 amountIn
    ) internal returns (uint256 amountOut) {
        // Encode swap data
        bytes memory swapData = abi.encode(zeroForOne, amountIn);

        CallbackData memory data = CallbackData({
            action: 2, // swap
            sender: address(this),
            data: swapData
        });

        bytes memory result = poolManager.unlock(abi.encode(data));
        amountOut = abi.decode(result, (uint256));
    }

    // ============ Internal: Add Liquidity ============

    function _addLiquidity(
        uint256 amount0,
        uint256 amount1
    ) internal returns (uint128 liquidity) {
        liquidity = uint128(amount0 < amount1 ? amount0 : amount1);

        ModifyLiquidityParams memory params = ModifyLiquidityParams({
            tickLower: TICK_LOWER,
            tickUpper: TICK_UPPER,
            liquidityDelta: int256(uint256(liquidity)),
            salt: bytes32(0)
        });

        bytes memory lpData = abi.encode(params);

        CallbackData memory data = CallbackData({
            action: 0, // addLiquidity
            sender: address(this),
            data: lpData
        });

        poolManager.unlock(abi.encode(data));
    }

    // ============ Internal: Remove Liquidity ============

    function _removeLiquidity(
        uint128 liquidity
    ) internal returns (uint256 amount0, uint256 amount1) {
        ModifyLiquidityParams memory params = ModifyLiquidityParams({
            tickLower: TICK_LOWER,
            tickUpper: TICK_UPPER,
            liquidityDelta: -int256(uint256(liquidity)),
            salt: bytes32(0)
        });

        bytes memory lpData = abi.encode(params);

        CallbackData memory data = CallbackData({
            action: 1, // removeLiquidity
            sender: address(this),
            data: lpData
        });

        bytes memory result = poolManager.unlock(abi.encode(data));
        (amount0, amount1) = abi.decode(result, (uint256, uint256));
    }

    // ============ Circle Gateway ============

    function depositToGateway(
        uint256 amount,
        address recipient
    ) external onlyAgent {
        if (usdc.balanceOf(address(this)) < amount)
            revert InsufficientBalance();
        usdc.approve(address(gatewayWallet), amount);
        gatewayWallet.deposit(address(usdc), amount);
        emit GatewayDepositInitiated(amount, recipient);
    }

    // ============ Unlock Callback ============

    function unlockCallback(
        bytes calldata rawData
    ) external override returns (bytes memory) {
        require(msg.sender == address(poolManager), "Only PoolManager");

        CallbackData memory data = abi.decode(rawData, (CallbackData));

        if (data.action == 0) {
            // Add Liquidity
            ModifyLiquidityParams memory params = abi.decode(
                data.data,
                (ModifyLiquidityParams)
            );
            (BalanceDelta delta, ) = poolManager.modifyLiquidity(
                poolKey,
                params,
                ""
            );

            // Settle negative deltas (we owe pool)
            if (delta.amount0() < 0) {
                uint256 amt = uint256(uint128(-delta.amount0()));
                poolManager.sync(poolKey.currency0);
                usdc.transfer(address(poolManager), amt);
                poolManager.settle();
            }
            if (delta.amount1() < 0) {
                uint256 amt = uint256(uint128(-delta.amount1()));
                poolManager.sync(poolKey.currency1);
                usdt.transfer(address(poolManager), amt);
                poolManager.settle();
            }
            return "";
        } else if (data.action == 1) {
            // Remove Liquidity
            ModifyLiquidityParams memory params = abi.decode(
                data.data,
                (ModifyLiquidityParams)
            );
            (BalanceDelta delta, ) = poolManager.modifyLiquidity(
                poolKey,
                params,
                ""
            );

            uint256 amt0 = 0;
            uint256 amt1 = 0;

            // Take positive deltas (pool owes us)
            if (delta.amount0() > 0) {
                amt0 = uint256(uint128(delta.amount0()));
                poolManager.take(poolKey.currency0, address(this), amt0);
            }
            if (delta.amount1() > 0) {
                amt1 = uint256(uint128(delta.amount1()));
                poolManager.take(poolKey.currency1, address(this), amt1);
            }
            return abi.encode(amt0, amt1);
        } else if (data.action == 2) {
            // Swap
            (bool zeroForOne, uint256 amountIn) = abi.decode(
                data.data,
                (bool, uint256)
            );

            // Execute swap
            BalanceDelta delta = poolManager.swap(
                poolKey,
                SwapParams({
                    zeroForOne: zeroForOne,
                    amountSpecified: -int256(amountIn), // exact input
                    sqrtPriceLimitX96: zeroForOne
                        ? 4295128740
                        : 1461446703485210103287273052203988822378723970341
                }),
                ""
            );

            uint256 amountOut;

            if (zeroForOne) {
                // Paid USDC, received USDT
                // Use actual delta values, not requested amountIn
                if (delta.amount0() < 0) {
                    uint256 amt = uint256(uint128(-delta.amount0()));
                    poolManager.sync(poolKey.currency0);
                    usdc.transfer(address(poolManager), amt);
                    poolManager.settle();
                }
                if (delta.amount1() > 0) {
                    amountOut = uint256(uint128(delta.amount1()));
                    poolManager.take(poolKey.currency1, address(this), amountOut);
                }
            } else {
                // Paid USDT, received USDC
                // Use actual delta values, not requested amountIn
                if (delta.amount1() < 0) {
                    uint256 amt = uint256(uint128(-delta.amount1()));
                    poolManager.sync(poolKey.currency1);
                    usdt.transfer(address(poolManager), amt);
                    poolManager.settle();
                }
                if (delta.amount0() > 0) {
                    amountOut = uint256(uint128(delta.amount0()));
                    poolManager.take(poolKey.currency0, address(this), amountOut);
                }
            }

            return abi.encode(amountOut);
        }

        return "";
    }

    // ============ Internal Helpers ============

    /// @dev Remove payrollId from activePayrollIds array (swap and pop)
    function _removePayroll(uint256 payrollId) internal {
        uint256 index = payrollIdIndex[payrollId];
        uint256 lastIndex = activePayrollIds.length - 1;

        if (index != lastIndex) {
            // Swap with last element
            uint256 lastPayrollId = activePayrollIds[lastIndex];
            activePayrollIds[index] = lastPayrollId;
            payrollIdIndex[lastPayrollId] = index;
        }

        activePayrollIds.pop();
        delete payrollIdIndex[payrollId];
    }

    /// @dev Remove payrollId from provider's payroll list
    function _removeFromProviderPayrolls(
        address provider,
        uint256 payrollId
    ) internal {
        uint256[] storage payrolls = providerPayrolls[provider];
        for (uint256 i = 0; i < payrolls.length; i++) {
            if (payrolls[i] == payrollId) {
                // Swap with last and pop
                payrolls[i] = payrolls[payrolls.length - 1];
                payrolls.pop();
                break;
            }
        }
    }

    // ============ View Functions ============

    function getPoolKey() external view returns (PoolKey memory) {
        return poolKey;
    }

    function getPoolId() external view returns (PoolId) {
        return poolId;
    }

    /// @notice Get position by payroll ID
    function getPosition(
        uint256 payrollId
    ) external view returns (LPPosition memory) {
        return positions[payrollId];
    }

    /// @notice Get all payroll IDs for a provider
    function getProviderPayrolls(
        address provider
    ) external view returns (uint256[] memory) {
        return providerPayrolls[provider];
    }

    /// @notice Get all positions for a provider
    function getProviderPositions(
        address provider
    ) external view returns (LPPosition[] memory) {
        uint256[] memory payrollIds = providerPayrolls[provider];
        LPPosition[] memory providerPositions = new LPPosition[](
            payrollIds.length
        );

        for (uint256 i = 0; i < payrollIds.length; i++) {
            providerPositions[i] = positions[payrollIds[i]];
        }
        return providerPositions;
    }

    /// @notice Get all payrolls that are ready for execution
    /// @return readyPayrollIds Array of payroll IDs that are ready
    /// @return readyPayrolls Array of LPPosition structs for ready payrolls
    function getPayrollsReadyForExecution()
        external
        view
        returns (
            uint256[] memory readyPayrollIds,
            LPPosition[] memory readyPayrolls
        )
    {
        // First, count ready payrolls
        uint256 readyCount = 0;
        for (uint256 i = 0; i < activePayrollIds.length; i++) {
            LPPosition memory pos = positions[activePayrollIds[i]];
            if (pos.liquidity > 0 && block.timestamp >= pos.payrollDate) {
                readyCount++;
            }
        }

        // Allocate arrays
        readyPayrollIds = new uint256[](readyCount);
        readyPayrolls = new LPPosition[](readyCount);

        // Fill arrays
        uint256 index = 0;
        for (uint256 i = 0; i < activePayrollIds.length; i++) {
            uint256 payrollId = activePayrollIds[i];
            LPPosition memory pos = positions[payrollId];
            if (pos.liquidity > 0 && block.timestamp >= pos.payrollDate) {
                readyPayrollIds[index] = payrollId;
                readyPayrolls[index] = pos;
                index++;
            }
        }
    }

    /// @notice Get count of active payrolls
    function getActivePayrollsCount() external view returns (uint256) {
        return activePayrollIds.length;
    }

    /// @notice Get all active payroll IDs
    function getActivePayrollIds() external view returns (uint256[] memory) {
        return activePayrollIds;
    }

    /// @notice Get all payrolls eligible for migration to another chain
    /// @dev Returns positions that are on this chain, have liquidity, and are outside migration window
    function getPayrollsReadyForMigration()
        external
        view
        returns (
            uint256[] memory migratablePayrollIds,
            LPPosition[] memory migratablePayrolls
        )
    {
        // First, count migratable payrolls
        uint256 migratableCount = 0;
        for (uint256 i = 0; i < activePayrollIds.length; i++) {
            LPPosition memory pos = positions[activePayrollIds[i]];
            // Must be on this chain, have liquidity, and migration window must be valid
            if (
                pos.liquidity > 0 &&
                pos.currentChainId == chainId &&
                stateManager.isMigrationValid(pos.payrollDate)
            ) {
                migratableCount++;
            }
        }

        // Allocate arrays
        migratablePayrollIds = new uint256[](migratableCount);
        migratablePayrolls = new LPPosition[](migratableCount);

        // Fill arrays
        uint256 index = 0;
        for (uint256 i = 0; i < activePayrollIds.length; i++) {
            uint256 payrollId = activePayrollIds[i];
            LPPosition memory pos = positions[payrollId];
            if (
                pos.liquidity > 0 &&
                pos.currentChainId == chainId &&
                stateManager.isMigrationValid(pos.payrollDate)
            ) {
                migratablePayrollIds[index] = payrollId;
                migratablePayrolls[index] = pos;
                index++;
            }
        }
    }

    /// @notice Get chain ID of this router
    function getChainId() external view returns (uint256) {
        return chainId;
    }

    // ============ Emergency ============

    function emergencyWithdraw(
        address token,
        uint256 amount
    ) external onlyOwner {
        IERC20(token).safeTransfer(owner, amount);
    }
}
