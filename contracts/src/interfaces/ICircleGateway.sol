// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Circle Gateway Wallet Interface
/// @notice Interface for depositing USDC into Circle Gateway unified balance
/// @dev See: https://developers.circle.com/gateway/howtos/create-unified-usdc-balance
interface IGatewayWallet {
    /// @notice Deposit tokens into Gateway unified balance (balance belongs to caller)
    /// @param token The token address (USDC)
    /// @param value The amount to deposit
    function deposit(address token, uint256 value) external;

    /// @notice Deposit tokens on behalf of another address (balance belongs to depositor param)
    /// @param token The token address (USDC)
    /// @param depositor The address that owns the resulting balance
    /// @param value The amount to deposit
    function depositFor(address token, address depositor, uint256 value) external;

    /// @notice Returns the available balance for a depositor
    /// @param token The token address
    /// @param depositor The depositor address
    function availableBalance(address token, address depositor) external view returns (uint256);
}

/// @title Circle Gateway Minter Interface
/// @notice Interface for minting USDC on destination chain after bridge
/// @dev See: https://developers.circle.com/gateway/howtos/transfer-unified-usdc-balance
interface IGatewayMinter {
    /// @notice Mint USDC using attestation from Circle Gateway API
    /// @param attestationPayload The attestation bytes from Circle API
    /// @param signature The signature bytes from Circle API
    function gatewayMint(
        bytes calldata attestationPayload,
        bytes calldata signature
    ) external;
}
