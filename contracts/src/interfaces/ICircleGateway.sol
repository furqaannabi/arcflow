// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Circle Gateway Minter Interface
/// @notice Interface for calling gatewayMint to receive cross-chain USDC
interface IGatewayMinter {
    /// @notice Mint USDC on this chain using attestation from Gateway API
    /// @param attestationPayload The attestation bytes from Gateway API
    /// @param signature The signature from Gateway API
    function gatewayMint(bytes calldata attestationPayload, bytes calldata signature) external;
}

/// @title Circle Gateway Wallet Interface
/// @notice Interface for depositing USDC into Gateway Wallet
interface IGatewayWallet {
    /// @notice Deposit tokens into the Gateway Wallet
    /// @param token The token address to deposit
    /// @param value The amount to deposit
    function deposit(address token, uint256 value) external;
}
