// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title Chain Configuration Library
/// @notice Contains addresses and configuration for all supported chains
library ChainConfig {
    // Chain IDs
    uint256 constant SEPOLIA = 11155111;
    uint256 constant BASE_SEPOLIA = 84532;
    uint256 constant ARC_TESTNET = 5042002;

    // Circle CCTP Domains
    uint32 constant CIRCLE_DOMAIN_ETHEREUM = 0;
    uint32 constant CIRCLE_DOMAIN_ARBITRUM = 3;
    uint32 constant CIRCLE_DOMAIN_BASE = 6;
    uint32 constant CIRCLE_DOMAIN_ARC = 9;

    struct Config {
        uint256 chainId;
        string name;
        address poolManager;
        address usdc;
        address usdt;
        address gatewayWallet;
        address gatewayMinter;
        uint32 circleDomain;
    }

    /// @notice Get configuration for Sepolia
    function getSepolia() internal pure returns (Config memory) {
        return Config({
            chainId: SEPOLIA,
            name: "Sepolia",
            poolManager: 0x8C4BcBE6b9eF47855f97E675296FA3F6fafa5F1A,
            usdc: 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238,
            usdt: 0x7169D38820dfd117C3FA1f22a697dBA58d90BA06,
            gatewayWallet: 0x0077777d7EBA4688BDeF3E311b846F25870A19B9,
            gatewayMinter: 0x0022222ABE238Cc2C7Bb1f21003F0a260052475B,
            circleDomain: CIRCLE_DOMAIN_ETHEREUM
        });
    }

    /// @notice Get configuration for Base Sepolia
    function getBaseSepolia() internal pure returns (Config memory) {
        return Config({
            chainId: BASE_SEPOLIA,
            name: "Base Sepolia",
            poolManager: 0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408,
            usdc: 0x036CbD53842c5426634e7929541eC2318f3dCF7e,
            usdt: 0x323e78f944A9a1FcF3a10efcC5319DBb0bB6e673,
            gatewayWallet: 0x0077777d7EBA4688BDeF3E311b846F25870A19B9,
            gatewayMinter: 0x0022222ABE238Cc2C7Bb1f21003F0a260052475B,
            circleDomain: CIRCLE_DOMAIN_BASE
        });
    }

    /// @notice Get configuration for Arc Testnet
    function getArcTestnet() internal pure returns (Config memory) {
        return Config({
            chainId: ARC_TESTNET,
            name: "Arc Testnet",
            poolManager: address(0), // No Uniswap on Arc
            usdc: address(0), // Minted via gateway
            usdt: address(0),
            gatewayWallet: 0x0077777d7EBA4688BDeF3E311b846F25870A19B9,
            gatewayMinter: 0x0022222ABE238Cc2C7Bb1f21003F0a260052475B,
            circleDomain: CIRCLE_DOMAIN_ARC
        });
    }

    /// @notice Get configuration for current chain
    function getConfig() internal view returns (Config memory) {
        if (block.chainid == SEPOLIA) {
            return getSepolia();
        } else if (block.chainid == BASE_SEPOLIA) {
            return getBaseSepolia();
        } else if (block.chainid == ARC_TESTNET) {
            return getArcTestnet();
        } else {
            revert("Unsupported chain");
        }
    }

    /// @notice Check if current chain is a source chain (has router)
    function isSourceChain() internal view returns (bool) {
        return block.chainid == SEPOLIA ||
               block.chainid == BASE_SEPOLIA;
    }

    /// @notice Check if current chain is Arc (distribution chain)
    function isArcChain() internal view returns (bool) {
        return block.chainid == ARC_TESTNET;
    }
}
