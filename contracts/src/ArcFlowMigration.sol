// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ArcFlowStateManager} from "./ArcFlowStateManager.sol";
import {IGatewayWallet, IGatewayMinter} from "./interfaces/ICircleGateway.sol";
import {MigrationStatus} from "./structs/CrossChainStructs.sol";

interface IArcFlowRouter {
    function removeLiqFor(uint256 pid) external returns (uint256);
    function addLiqFor(uint256 pid, uint256 amt) external returns (uint128);
    function updatePosChain(uint256 pid, uint256 cid) external;
    function getPosData(uint256 pid) external view returns (uint128, uint256, uint256);
}

contract ArcFlowMigration {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    error Unauthorized();
    error NoPosition();
    error WrongChain();
    error SameChain();
    error TooCloseToPayroll();
    error HasLiquidity();
    error InvalidChannelSignature();
    error InsufficientMint();

    event MigrationOut(
        uint256 indexed payrollId,
        uint256 toChainId,
        uint256 amount,
        bytes32 channelId
    );

    event MigrationIn(
        uint256 indexed payrollId,
        uint256 fromChainId,
        uint256 amount,
        bytes32 channelId
    );

    IArcFlowRouter public immutable router;
    ArcFlowStateManager public immutable stateManager;
    IGatewayWallet public immutable gatewayWallet;
    IGatewayMinter public gatewayMinter;
    IERC20 public immutable usdc;
    uint256 public immutable chainId;
    address public owner;
    address public agent;

    constructor(
        address _router,
        address _stateManager,
        address _gatewayWallet,
        address _usdc
    ) {
        router = IArcFlowRouter(_router);
        stateManager = ArcFlowStateManager(_stateManager);
        gatewayWallet = IGatewayWallet(_gatewayWallet);
        usdc = IERC20(_usdc);
        chainId = block.chainid;
        owner = msg.sender;
    }

    modifier onlyAgent() {
        if (msg.sender != agent && msg.sender != owner) revert Unauthorized();
        _;
    }

    function setAgent(address _agent) external {
        if (msg.sender != owner) revert Unauthorized();
        agent = _agent;
    }

    function setGatewayMinter(address _minter) external {
        if (msg.sender != owner) revert Unauthorized();
        gatewayMinter = IGatewayMinter(_minter);
    }

    // =============================================================
    // MIGRATE OUT
    // =============================================================

    function migrateOutViaChannel(
        uint256 payrollId,
        uint256 targetChainId,
        bytes32 channelId,
        bytes calldata channelSignature
    ) external onlyAgent returns (uint256 amount) {
        (
            uint128 liquidity,
            uint256 currentChain,
            uint256 payrollDate
        ) = router.getPosData(payrollId);

        if (liquidity == 0) revert NoPosition();
        if (currentChain != chainId) revert WrongChain();
        if (targetChainId == chainId) revert SameChain();
        if (!stateManager.isMigrationValid(payrollDate))
            revert TooCloseToPayroll();

        // 1. Remove liquidity
        amount = router.removeLiqFor(payrollId);

        // 2. Verify Yellow channel signature using REAL amount
        bytes32 stateHash = keccak256(
            abi.encodePacked(channelId, payrollId, amount)
        );

        bytes32 ethSignedHash = stateHash.toEthSignedMessageHash();
        address signer = ethSignedHash.recover(channelSignature);

        if (signer != agent && signer != owner)
            revert InvalidChannelSignature();

        // 3. Update router state
        router.updatePosChain(payrollId, targetChainId);

        // 4. Record migration state
        stateManager.recordChannelSettlement(channelId, payrollId, amount);
        stateManager.updateMigrationState(
            payrollId,
            amount,
            chainId,
            targetChainId,
            MigrationStatus.PENDING
        );

        // 5. Bridge via Circle Gateway
        usdc.approve(address(gatewayWallet), amount);
        gatewayWallet.deposit(address(usdc), amount);

        emit MigrationOut(payrollId, targetChainId, amount, channelId);
    }

    // =============================================================
    // MIGRATE IN
    // =============================================================

    function migrateInViaChannel(
        uint256 payrollId,
        uint256 fromChainId,
        uint256 amount,
        bytes32 channelId,
        bytes calldata channelSignature,
        bytes calldata attestation,
        bytes calldata gatewaySignature
    ) external onlyAgent returns (uint128 newLiquidity) {
        (
            uint128 liquidity,
            uint256 currentChain,
        ) = router.getPosData(payrollId);

        if (currentChain != chainId) revert WrongChain();
        if (liquidity != 0) revert HasLiquidity();

        // 1. Verify channel signature
        bytes32 stateHash = keccak256(
            abi.encodePacked(channelId, payrollId, amount)
        );

        bytes32 ethSignedHash = stateHash.toEthSignedMessageHash();
        address signer = ethSignedHash.recover(channelSignature);

        if (signer != agent && signer != owner)
            revert InvalidChannelSignature();

        // 2. Mint via Circle Gateway
        uint256 beforeBal = usdc.balanceOf(address(this));
        gatewayMinter.gatewayMint(attestation, gatewaySignature);
        uint256 minted = usdc.balanceOf(address(this)) - beforeBal;

        if (minted < amount) revert InsufficientMint();

        // 3. Add liquidity back
        usdc.safeTransfer(address(router), amount);
        newLiquidity = router.addLiqFor(payrollId, amount);

        // 4. Record migration completion
        stateManager.recordChannelSettlement(channelId, payrollId, amount);
        stateManager.updateMigrationState(
            payrollId,
            amount,
            fromChainId,
            chainId,
            MigrationStatus.COMPLETED
        );

        emit MigrationIn(payrollId, fromChainId, amount, channelId);
    }

    // =============================================================
    // VIEW: SHOULD MIGRATE
    // =============================================================

    function shouldMigrate(
        uint256 payrollId
    )
        external
        view
        returns (bool migrate, uint256 targetChain, uint256 apyDiff)
    {
        (
            uint128 liquidity,
            uint256 currentChain,
            uint256 payrollDate
        ) = router.getPosData(payrollId);

        if (
            currentChain != chainId ||
            liquidity == 0 ||
            !stateManager.isMigrationValid(payrollDate)
        ) {
            return (false, 0, 0);
        }

        (uint256 currentApy, , ) = stateManager.getChainApy(chainId);
        (uint256 bestChain, uint256 bestApy) = stateManager.getBestChainForApy();

        if (bestChain != chainId && bestApy > currentApy) {
            apyDiff = bestApy - currentApy;
            if (apyDiff >= 50) {
                return (true, bestChain, apyDiff);
            }
        }

        return (false, 0, 0);
    }
}
