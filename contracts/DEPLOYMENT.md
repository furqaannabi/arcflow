# ArcFlow Multi-Chain Deployment Guide

This guide explains how to deploy ArcFlow contracts across multiple chains.

## Supported Chains

| Chain | Chain ID | Type | Contracts |
|-------|----------|------|-----------|
| Base Sepolia | 84532 | Source | Router, StateManager |
| Sepolia | 11155111 | Source | Router, StateManager |
| Arc Testnet | 5042002 | Distribution | Distributor |

## Prerequisites

### Environment Variables

Create a `.env` file:

```bash
# Required
PRIVATE_KEY=0x...                    # Deployer private key
ALCHEMY_API_KEY=your_alchemy_key     # For Alchemy RPC

# Optional - for contract verification
ETHERSCAN_API_KEY=...                # Etherscan

# Optional
AGENT_ADDRESS=0x...                  # Agent address (defaults to deployer)
```

### Install Dependencies

```bash
forge install
```

## Deployment Scripts

### ChainConfig.sol

Central configuration library containing addresses for all chains:
- Pool Manager addresses
- USDC/USDT addresses
- Gateway addresses
- Circle CCTP domains

### 00_DeployAll.s.sol

Deploys to **source chains** (Base Sepolia, Sepolia)S
- Initializes USDC-USDT pool (if needed)
- Deploys ArcFlowStateManager
- Deploys ArcFlowRouter
- Configures agent authorization

### 01_DeployDistributor.s.sol

Deploys to **Arc Testnet**:
- Deploys ArcPayrollDistributor
- Configures gateway minter
- Authorizes agent

### 02_MergeDeployments.s.sol

Merges all deployment files into `../agent/src/addresses.json`

## Quick Deploy

### Using Shell Script

```bash
# Make script executable
chmod +x deploy.sh

# Deploy to a specific chain
./deploy.sh baseSepolia
./deploy.sh sepolia
./deploy.sh arbitrumSepolia
./deploy.sh arc

# Deploy to all chains and merge
./deploy.sh all

# Merge existing deployments
./deploy.sh merge

# With verification
./deploy.sh baseSepolia --verify
```

### Using Forge Directly

```bash
# Deploy to Base Sepolia
forge script script/00_DeployAll.s.sol \
    --rpc-url baseSepolia \
    --broadcast

# Deploy to Sepolia
forge script script/00_DeployAll.s.sol \
    --rpc-url sepolia \
    --broadcast

# Deploy to Arbitrum Sepolia
forge script script/00_DeployAll.s.sol \
    --rpc-url arbitrumSepolia \
    --broadcast

# Deploy Distributor to Arc
forge script script/01_DeployDistributor.s.sol \
    --rpc-url arc \
    --broadcast

# Merge deployments
forge script script/02_MergeDeployments.s.sol
```

## Deployment Output

Deployments are saved to:
- `deployments/baseSepolia.json`
- `deployments/sepolia.json`
- `deployments/arbitrumSepolia.json`
- `deployments/arcTestnet.json`

After merging, combined output is written to:
- `../agent/src/addresses.json`

## Verify Contracts

```bash
# Verify on Base Sepolia
forge verify-contract \
    --rpc-url baseSepolia \
    --chain base-sepolia \
    <CONTRACT_ADDRESS> \
    src/ArcFlowRouter.sol:ArcFlowRouter

# Verify on Arc (Blockscout)
forge verify-contract \
    --rpc-url arc \
    --verifier blockscout \
    --verifier-url https://explorer.testnet.arc.network/api \
    <CONTRACT_ADDRESS> \
    src/ArcPayrollDistributor.sol:ArcPayrollDistributor
```

## Adding a New Chain

1. Add chain config to `ChainConfig.sol`:

```solidity
uint256 constant NEW_CHAIN = 12345;

function getNewChain() internal pure returns (Config memory) {
    return Config({
        chainId: NEW_CHAIN,
        name: "New Chain",
        poolManager: 0x...,
        usdc: 0x...,
        usdt: 0x...,
        gatewayWallet: 0x...,
        gatewayMinter: address(0),
        circleDomain: X
    });
}
```

2. Update `getConfig()` to include the new chain

3. Add RPC endpoint to `foundry.toml`:

```toml
[rpc_endpoints]
newChain = "https://rpc.newchain.io"
```

4. Deploy:

```bash
forge script script/00_DeployAll.s.sol --rpc-url newChain --broadcast
```

## Architecture

```
Source Chains (Base/Sepolia/Arbitrum)     Arc Testnet
┌─────────────────────────────────┐       ┌──────────────────────┐
│  ArcFlowRouter                  │       │  ArcPayrollDistributor│
│  - deposit()                    │       │  - distribute()       │
│  - executeReadyPayrolls()       │ ────► │  - verify state       │
│                                 │       │                       │
│  ArcFlowStateManager            │       │                       │
│  - track APY                    │       │                       │
│  - migration state              │       │                       │
└─────────────────────────────────┘       └──────────────────────┘
         │                                          │
         │          Circle CCTP Bridge              │
         └──────────────────────────────────────────┘
```

## Troubleshooting

### "Not a source chain" Error
You're trying to run `00_DeployAll.s.sol` on Arc. Use `01_DeployDistributor.s.sol` instead.

### "Not Arc chain" Error
You're trying to run `01_DeployDistributor.s.sol` on a source chain. Use `00_DeployAll.s.sol` instead.

### Pool Already Initialized
This is normal - the script continues if the USDC-USDT pool already exists.

### Missing RPC URL
Ensure `ALCHEMY_API_KEY` is set in your environment or `.env` file.
