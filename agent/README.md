# ArcFlow Agent

Autonomous agent service for cross-chain payroll management, APY optimization, and yield-based rebalancing.

## Features

- **Multi-Chain Payroll Cron** - Monitors and executes ready payrolls across Base Sepolia and Sepolia
- **APY Monitoring** - Fetches yield rates from DefiLlama every 6 hours
- **Cross-Chain Migration** - Automatically rebalances funds to highest-yield chains (>0.5% APY diff)
- **Yellow Network Integration** - Batch chunking and state signing for distribution
- **Conversational AI** - OpenAI-powered chat interface for payroll management

## Quick Start

```bash
# Install dependencies
npm install

# Set environment variables
cp .env.example .env

# Run development server
npm run dev

# Build and run production
npm run build
npm start
```

## Environment Variables

```env
# Required
AGENT_PRIVATE_KEY=0x...        # Agent wallet private key
OPENAI_API_KEY=sk-...          # OpenAI API key for chat
ALCHEMY_API_KEY=...            # Alchemy API key for multi-chain RPC

# Optional
PORT=3001                       # Server port (default: 3001)
CRON_INTERVAL=60000            # Payroll check interval in ms (default: 60s)
```

## Supported Chains

| Chain | Chain ID | Role |
|-------|----------|------|
| Base Sepolia | 84532 | Source chain (deposits, LP) |
| Sepolia | 11155111 | Source chain (deposits, LP) |
| Arc Testnet | 5042002 | Distribution chain |

## Contract Addresses

### Base Sepolia

| Contract | Address |
|----------|---------|
| ArcFlowRouter | `0xA07C9A5C26adefB97F99E6926b5812c2089A156D` |
| ArcFlowStateManager | `0x50900c76101d5Fd11117417c32942aD246D5A166` |
| ArcFlowMigration | `0xD155f706759A3d55ec70a8945370bd1fD8799870` |
| USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| USDT | `0x323e78f944A9a1FcF3a10efcC5319DBb0bB6e673` |

### Sepolia

| Contract | Address |
|----------|---------|
| ArcFlowRouter | `0x4542a2498877554789C9560DcAFb43e1e4839Dcd` |
| ArcFlowStateManager | `0xe02F4213D6Bd17ECC1E911fb58fAf3dF97af4159` |
| ArcFlowMigration | `0xA9e73a7b4b4314e12377D9EA2D567DdFa11BBc15` |
| USDC | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| USDT | `0x7169D38820dfd117C3FA1f22a697dBA58d90BA06` |

### Arc Testnet

| Contract | Address |
|----------|---------|
| ArcPayrollDistributor | `0x3E1318E75b4192f16941786992c94B12FFc2e85C` |
| Gateway Minter | `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` |

### Circle Gateway (Testnet)

| Contract | Address |
|----------|---------|
| Gateway Wallet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` |
| Gateway Minter | `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` |

## API Endpoints

### Health & Status

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Service status, cron results, APY data |

### Chat

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Conversational AI for payroll management |
| `/api/session/:sessionId` | GET | Get session payroll state |
| `/api/yields` | GET | Top 10 USDC yields from DefiLlama |

### APY & Rebalancing

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/apy/latest` | GET | Latest APY data across all chains |
| `/api/apy/history` | GET | APY update history |
| `/api/apy/update` | POST | Force immediate APY update |
| `/api/rebalance/history` | GET | Rebalancing operation history |

### Yellow Network

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/yellow/chains` | GET | List all supported chains |
| `/api/yellow/balance/:address` | GET | USDC balance (`?chainId=X` for specific) |
| `/api/yellow/register-batch` | POST | Register incoming bridged funds |
| `/api/yellow/cache-recipients` | POST | Cache recipient data for payroll |
| `/api/yellow/chunk-batch` | POST | Chunk batch into individual payments |
| `/api/yellow/pending-batches` | GET | Get pending batches |
| `/api/yellow/cross-chain-transfer` | POST | Generate cross-chain transfer params |

## Cron Jobs

### Payroll Execution (every 60s)

Runs on all configured chains:
1. Calls `getReadyPayrolls()` on each chain's router
2. Executes `executeReadyPayrolls()` for matured payrolls
3. Bridges funds to Circle Gateway for distribution

### APY Monitoring (every 6 hours)

1. Fetches USDC yields from DefiLlama API
2. Updates all chains' StateManagers via `batchUpdateChainApy()`
3. Checks migration opportunities on each chain
4. Triggers `migrateOut()` when APY diff > 0.5%

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        ArcFlow Agent                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │   PayrollCron    │  │   APY Monitor    │  │   Migration   │  │
│  │                  │  │                  │  │   Checker     │  │
│  │ - Multi-chain    │  │ - DefiLlama API  │  │               │  │
│  │ - 60s interval   │  │ - 6hr interval   │  │ - APY diff    │  │
│  │ - Auto-execute   │  │ - Update all     │  │   > 0.5%      │  │
│  │                  │  │   StateManagers  │  │ - migrateOut  │  │
│  └────────┬─────────┘  └────────┬─────────┘  └───────┬───────┘  │
│           │                     │                     │          │
│           ▼                     ▼                     ▼          │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │                    Multi-Chain Clients                       ││
│  │                                                              ││
│  │  Base Sepolia ◄──► Sepolia ◄──► Arc Testnet                 ││
│  │  (Router)          (Router)      (Distributor)              ││
│  │  (Migration)       (Migration)   (Gateway)                  ││
│  │  (StateManager)    (StateManager)                           ││
│  └──────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## File Structure

```
agent/
├── src/
│   ├── index.ts          # Express server entry point
│   ├── config.ts         # Multi-chain RPC configuration
│   ├── cron.ts           # Multi-chain PayrollCron
│   ├── contracts.ts      # Contract interaction service
│   ├── defillama.ts      # DefiLlama yield API
│   ├── yellow.ts         # Yellow Network service
│   ├── addresses.json    # Deployed contract addresses
│   ├── abis.json         # Contract ABIs
│   └── routes/
│       └── chat.ts       # OpenAI chat router
├── package.json
├── tsconfig.json
└── README.md
```

## Configuration Files

### addresses.json

Contains deployed contract addresses for all chains:
- `baseSepolia` - Router, StateManager, Migration, USDC, USDT
- `sepolia` - Router, StateManager, Migration, USDC, USDT
- `arcTestnet` - Distributor, Gateway Minter

### abis.json

Contract ABI definitions:
- `router` - ArcFlowRouter functions
- `stateManager` - ArcFlowStateManager functions
- `migration` - ArcFlowMigration functions
- `distributor` - ArcPayrollDistributor functions
- `erc20` - Standard ERC20 functions

### config.ts

RPC URL configuration with Alchemy support:
- Automatic Alchemy URL generation with API key
- Public RPC fallbacks for each chain
- Chain ID constants

## API Examples

### Chat with Agent

```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Set up payroll for January 31st",
    "sessionId": "user-123",
    "userAddress": "0x..."
  }'
```

### Force APY Update

```bash
curl -X POST http://localhost:3001/api/apy/update
```

### Get Multi-Chain Balance

```bash
# All chains
curl http://localhost:3001/api/yellow/balance/0x1234...

# Specific chain
curl "http://localhost:3001/api/yellow/balance/0x1234...?chainId=84532"
```

## Migration Flow

When APY difference between chains exceeds 0.5%:

1. **Detection**: Cron detects better yield on another chain
2. **Validation**: Checks payroll isn't too close to execution date
3. **Migration Out**: Calls `migration.migrateOut(payrollId, targetChainId)`
   - Removes liquidity from current chain
   - Bridges USDC via Circle Gateway
4. **Migration In**: On target chain, `migration.migrateIn()` receives funds
   - Re-adds liquidity on higher-yield chain
   - Updates position tracking

## Development

```bash
# Type check
npm run typecheck

# Build
npm run build

# Run with auto-reload
npm run dev
```

## License

MIT