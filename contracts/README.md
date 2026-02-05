# ArcFlow Contracts

Smart contracts for cross-chain payroll fund management with yield optimization.

## Contracts

| Contract | Description |
|----------|-------------|
| `ArcFlowRouter` | Core deposit/withdraw/execute for USDC-USDT LP |
| `ArcFlowBase` | Base contract with Uniswap V4 pool operations |
| `ArcFlowStateManager` | APY tracking and migration state management |
| `ArcFlowMigration` | Cross-chain migration for yield optimization |
| `ArcPayrollDistributor` | Final payroll distribution on Arc chain |

## Supported Chains

| Chain | Chain ID | Type |
|-------|----------|------|
| Base Sepolia | 84532 | Source |
| Sepolia | 11155111 | Source |
| Arc Testnet | 5042002 | Distribution |

## Quick Start

### 1. Install Dependencies

```bash
forge install
```

### 2. Configure Environment

Create `.env` file:

```bash
PRIVATE_KEY=0x...
ALCHEMY_API_KEY=your_alchemy_key
AGENT_ADDRESS=0x...  # optional, defaults to deployer

# For verification
ETHERSCAN_API_KEY=...
BASESCAN_API_KEY=...
```

### 3. Deploy

```bash
# Deploy to Base Sepolia (with verification)
./deploy.sh baseSepolia

# Deploy to Sepolia
./deploy.sh sepolia

# Deploy to Arc Testnet
./deploy.sh arc

# Deploy to all chains
./deploy.sh all

# Deploy without verification
./deploy.sh baseSepolia --no-verify
```

### 4. Merge Deployments

```bash
./deploy.sh merge
```

This merges all deployment files into `../agent/src/addresses.json`.

## Manual Deployment

```bash
# Deploy to Base Sepolia
forge script script/00_DeployAll.s.sol --rpc-url baseSepolia --broadcast --verify

# Deploy Distributor to Arc
forge script script/01_DeployDistributor.s.sol --rpc-url arc --broadcast
```

## Deployment Output

Deployments are saved to:
- `deployments/baseSepolia.json`
- `deployments/sepolia.json`
- `deployments/arcTestnet.json`

## Architecture

```
Source Chains (Base/Sepolia)              Arc Testnet
┌─────────────────────────────┐          ┌──────────────────────┐
│  ArcFlowRouter              │          │  ArcPayrollDistributor│
│  - deposit()                │          │  - distribute()       │
│  - executeReadyPayrolls()   │  ─────►  │  - verify state       │
│                             │          │                       │
│  ArcFlowMigration           │          │                       │
│  - migrateOut()             │          │                       │
│  - migrateIn()              │          │                       │
│                             │          │                       │
│  ArcFlowStateManager        │          │                       │
│  - track APY                │          │                       │
│  - migration state          │          │                       │
└─────────────────────────────┘          └──────────────────────┘
         │                                          │
         │          Circle CCTP Bridge              │
         └──────────────────────────────────────────┘
```

## Circle Gateway Addresses

| Network | GatewayWallet | GatewayMinter |
|---------|---------------|---------------|
| Testnet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` | `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` |
| Mainnet | `0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE` | `0x2222222d7164433c4C09B0b0D809a9b52C04C205` |

## Testing

```bash
forge test
```

## Contract Verification

```bash
forge verify-contract \
    --rpc-url baseSepolia \
    --chain base-sepolia \
    <CONTRACT_ADDRESS> \
    src/ArcFlowRouter.sol:ArcFlowRouter
```

## License

MIT
