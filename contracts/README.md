# ArcFlow Contracts

Smart contracts for cross-chain payroll fund management with yield optimization via Uniswap V4 and Circle CCTP bridging.

## Contracts

| Contract | Description |
|----------|-------------|
| `ArcFlowRouter` | Core deposit, execute, cancel for USDC-USDT LP positions |
| `ArcFlowBase` | Base contract with Uniswap V4 pool operations (add/remove liquidity, swap) |
| `ArcFlowStateManager` | APY tracking across chains, migration validation |
| `ArcFlowMigration` | Cross-chain migration via Circle CCTP bridge |
| `ArcFlowTypes` | Shared structs: `LPPosition`, `PayrollRecipient`, `CallbackData` |
| `ArcPayrollDistributor` | Final payroll distribution on Arc Chain |

## Key Functions

### ArcFlowRouter

| Function | Access | Description |
|----------|--------|-------------|
| `deposit(amt, date, recipients)` | Anyone | Deposit USDC, create LP position with payroll metadata |
| `execute(pid)` | Agent only | Execute ready payroll: remove LP, bridge via Circle Gateway |
| `cancel(pid)` | Provider only | Cancel payroll before date: remove LP, return USDC to provider |
| `getPos(pid)` | View | Get full position data |
| `getPosData(pid)` | View | Get liquidity, currentChainId, payrollDate |
| `getActiveIds()` | View | List all active payroll IDs |
| `getProviderPayrolls(addr)` | View | List payroll IDs for a provider |
| `seed(a0, a1)` | Owner only | Initial pool liquidity seeding |
| `removeLiqFor(pid)` | Migration only | Remove liquidity for cross-chain migration |
| `addLiqFor(pid, amt)` | Migration only | Add liquidity after receiving migration |
| `updatePosChain(pid, cid)` | Migration only | Update position's current chain |

### ArcFlowMigration

| Function | Access | Description |
|----------|--------|-------------|
| `migrateOut(pid, targetChainId)` | Agent only | Remove liquidity, bridge USDC to target chain |
| `migrateIn(pid, fromChainId, amt, attestation, sig)` | Agent only | Receive bridged USDC, re-add liquidity |
| `shouldMigrate(pid)` | View | Check if position should migrate for better APY |

### ArcFlowStateManager

| Function | Access | Description |
|----------|--------|-------------|
| `batchUpdateChainApy(chainIds, apys)` | Agent only | Update APY data for multiple chains |
| `getBestChainForApy()` | View | Get chain with highest APY |
| `getChainApy(chainId)` | View | Get APY, lastUpdated, isStale for a chain |
| `isMigrationValid(payrollDate)` | View | Check if migration timing is valid |

## Supported Chains

| Chain | Chain ID | Type |
|-------|----------|------|
| Base Sepolia | 84532 | Source (deposits, LP) |
| Sepolia | 11155111 | Source (deposits, LP) |
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

### 3. Build

```bash
forge build
```

### 4. Test

```bash
forge test
```

### 5. Deploy

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

### 6. Merge Deployments

```bash
./deploy.sh merge
```

This merges all deployment files into `../agent/src/addresses.json`.

## Manual Deployment

```bash
# Deploy to Base Sepolia
forge script script/00_DeployAll.s.sol:DeployAllScript --rpc-url baseSepolia --broadcast --verify --verifier etherscan -vvvv

# Deploy to Sepolia
forge script script/00_DeployAll.s.sol:DeployAllScript --rpc-url sepolia --broadcast --verify --verifier etherscan -vvvv

# Deploy Distributor to Arc Testnet
forge script script/01_DeployDistributor.s.sol:DeployDistributorScript --rpc-url arc --broadcast --verify --verifier blockscout --verifier-url https://testnet.arcscan.app/api -vvvv

# Merge all deployments
./deploy.sh merge
```

## Deployed Addresses

### Base Sepolia (84532)

| Contract | Address |
|----------|---------|
| PoolManager | `0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408` |
| Router | `0x941800436155Aad7c028f91A6E228935424C1D2d` |
| StateManager | `0xe09a64D36A357b775EFA500266199E4eBb40d124` |
| Migration | `0xcFc45554F7097D42f0991031C15F9EB8f956673B` |

### Sepolia (11155111)

| Contract | Address |
|----------|---------|
| PoolManager | `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543` |
| Router | `0x45A1dCff7146E9e77E9c5D48b74dfb9950cA5B08` |
| StateManager | `0xf59B9e400C63E7e8d5B6D6fc0Caff09256Fd23ba` |
| Migration | `0xeAA7B3747e0d35B1e4850c6046fD18F699F51FB6` |

### Arc Testnet (5042002)

| Contract | Address |
|----------|---------|
| Distributor | `0xD5851fB58A875cEBabf6828F93416A062D737907` |

## Deployment Output

Deployments are saved to:
- `deployments/baseSepolia.json`
- `deployments/sepolia.json`
- `deployments/arcTestnet.json`

## Architecture

```
Source Chains (Base Sepolia / Sepolia)              Arc Testnet
+--------------------------------------------+     +----------------------------+
|  ArcFlowRouter                             |     |  ArcPayrollDistributor     |
|  - deposit(amt, date, recipients)          |     |  - mintVerifyAndDistribute()|
|  - execute(pid)  [agent-only]              |     |                            |
|  - cancel(pid)   [provider-only]           |     +----------------------------+
|  - seed(a0, a1)  [owner-only]             |                  ^
|                                            |                  |
|  ArcFlowBase                               |     Circle CCTP Bridge
|  - _addLiquidity() / _removeLiquidity()    |     (burn on source, mint on Arc)
|  - _swap()                                 |                  |
|                                            |------------------+
|  ArcFlowMigration                          |
|  - migrateOut(pid, targetChainId)          |
|  - migrateIn(pid, fromChainId, amt, ...)   |
|                                            |
|  ArcFlowStateManager                       |
|  - batchUpdateChainApy()                   |
|  - getBestChainForApy()                    |
|  - isMigrationValid()                      |
+--------------------------------------------+
```

## Execution Flow

1. **Deposit**: User deposits USDC via `deposit()` — creates LP position
2. **Yield**: Position earns swap fees in Uniswap V4 USDC/USDT pool
3. **APY Rebalance** (optional): Agent migrates to higher-yield chain if >0.5% diff
4. **Execute**: On payroll date, agent calls `execute()` — removes LP, bridges via Circle Gateway
5. **Distribution**: `mintVerifyAndDistribute()` on Arc Chain sends USDC to recipients

## Cancel Flow

1. **Same chain**: Provider calls `cancel(pid)` — removes LP, returns USDC directly
2. **Migrated**: Agent first migrates position back to source chain, then provider cancels
3. Reverts if: wrong provider, past payroll date, position on different chain, zero liquidity

## Circle Gateway Addresses

| Network | GatewayWallet | GatewayMinter |
|---------|---------------|---------------|
| Testnet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` | `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` |

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
