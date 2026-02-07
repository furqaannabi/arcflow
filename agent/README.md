# ArcFlow Agent

Autonomous agent service for cross-chain payroll management, APY optimization, and yield-based rebalancing.

## Features

- **Multi-Chain Payroll Cron** - Monitors and executes ready payrolls across Base Sepolia and Sepolia
- **APY Monitoring** - Fetches yield rates from DefiLlama every 6 hours
- **Cross-Chain Migration** - Automatically rebalances funds to highest-yield chains (>0.5% APY diff)
- **MongoDB Persistence** - Chat sessions stored in MongoDB with TTL-based cleanup
- **Conversational AI** - OpenAI-powered chat interface with SSE streaming and CSV file upload support
- **Cancel Flow** - Employers can cancel payrolls before execution date via chat

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
MONGO_URI=mongodb://localhost:27017/arcflow  # MongoDB connection string

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
| PoolManager | `0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408` |
| ArcFlowRouter | `0x941800436155Aad7c028f91A6E228935424C1D2d` |
| ArcFlowStateManager | `0xe09a64D36A357b775EFA500266199E4eBb40d124` |
| ArcFlowMigration | `0xcFc45554F7097D42f0991031C15F9EB8f956673B` |
| USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| USDT | `0x97078835e54862f808e9D77c3BD50019700ac952` |

### Sepolia

| Contract | Address |
|----------|---------|
| PoolManager | `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543` |
| ArcFlowRouter | `0x45A1dCff7146E9e77E9c5D48b74dfb9950cA5B08` |
| ArcFlowStateManager | `0xf59B9e400C63E7e8d5B6D6fc0Caff09256Fd23ba` |
| ArcFlowMigration | `0xeAA7B3747e0d35B1e4850c6046fD18F699F51FB6` |
| USDC | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| USDT | `0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0` |

### Arc Testnet

| Contract | Address |
|----------|---------|
| ArcPayrollDistributor | `0xD5851fB58A875cEBabf6828F93416A062D737907` |
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
| `/api/chat` | POST | Conversational AI for payroll management (SSE streaming) |
| `/api/session/:sessionId` | GET | Get session payroll state |
| `/api/yields` | GET | Top 10 USDC yields from DefiLlama |
| `/api/payrolls/:wallet` | GET | Get all payroll positions for a wallet |

#### POST /api/chat

Accepts `multipart/form-data` with the following fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | string | No* | Text message to send |
| `sessionId` | string | No | Session ID (creates new if not provided) |
| `userAddress` | string | No | User's wallet address |
| `file` | file | No* | CSV file (only accepted if last message allows upload) |

*At least one of `message` or `file` is required.

**Response:** Server-Sent Events (SSE) stream with event types:

| Event | Description |
|-------|-------------|
| `session` | Session ID |
| `status` | Processing status updates |
| `tool_start` | Tool call initiated |
| `tool_done` | Tool call result (transactions rendered as signable buttons) |
| `token` | Streamed response token |
| `done` | Stream complete |
| `error` | Error message |

### APY & Rebalancing

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/apy/latest` | GET | Latest APY data across all chains |
| `/api/apy/history` | GET | APY update history |
| `/api/apy/update` | POST | Force immediate APY update |
| `/api/rebalance/history` | GET | Rebalancing operation history |

## Chat Tools

The agent exposes these tools via OpenAI function calling:

| Tool | Description |
|------|-------------|
| `set_payroll_date` | Set payroll distribution date |
| `get_current_time` | Get current UTC time |
| `get_deposit_transaction` | Generate USDC approval + deposit calldata |
| `get_positions` | View all active payroll positions |
| `get_pool_liquidity` | Check Uniswap V4 pool liquidity |
| `get_yields` | Fetch current DeFi yields from DefiLlama |
| `get_execute_payrolls_transaction` | Generate execute calldata for ready payrolls |
| `get_cancellable_payrolls` | List payrolls that can be cancelled |
| `get_cancel_transaction` | Generate cancel calldata for a payroll |
| `get_user_address` | Retrieve connected wallet address |

Transaction tools (`get_deposit_transaction`, `get_execute_payrolls_transaction`, `get_cancel_transaction`) return `{to, data, description}` objects that the frontend renders as signable transaction buttons.

## Cron Jobs

### Payroll Execution (every 60s)

Runs on all configured chains:
1. Calls `getReadyPayrolls()` on each chain's router
2. Calls `execute(payrollId)` for matured payrolls
3. Bridges funds to Circle Gateway for distribution

### APY Monitoring (every 6 hours)

1. Fetches USDC yields from DefiLlama API
2. Updates all chains' StateManagers via `batchUpdateChainApy()`
3. Checks migration opportunities on each chain
4. Triggers `migrateOut()` when APY diff > 0.5%

## Architecture

```
+-------------------------------------------------------------------+
|                          ArcFlow Agent                             |
+-------------------------------------------------------------------+
|                                                                    |
|  +--------------+  +--------------+  +-------------+  +---------+ |
|  | PayrollCron  |  |  APY Monitor |  |  Migration  |  |  Chat   | |
|  |              |  |              |  |   Checker   |  | Service | |
|  | - 60s check  |  | - DefiLlama  |  |             |  |         | |
|  | - execute()  |  | - 6hr update |  | - APY diff  |  | - SSE   | |
|  | - direct tx  |  | - StateMgr   |  |   > 0.5%    |  | - Tools | |
|  +------+-------+  +------+-------+  +------+------+  +----+----+ |
|         |                 |                  |              |      |
|         v                 v                  v              v      |
|  +---------------------------------------------------------------+ |
|  |                  Multi-Chain Clients (viem)                    | |
|  |                                                                | |
|  |  Base Sepolia <--------> Sepolia <--------> Arc Testnet       | |
|  |  (Router)                (Router)            (Distributor)    | |
|  |  (Migration)             (Migration)         (Gateway)        | |
|  |  (StateManager)          (StateManager)                       | |
|  +---------------------------------------------------------------+ |
+-------------------------------------------------------------------+
```

## Chat Sessions

Chat sessions are stored in MongoDB with the following features:

- **Automatic Session Creation**: New UUID generated if no sessionId provided
- **Message History**: Full conversation stored with timestamps
- **Pending Payroll State**: Payroll date, recipients, amounts persisted
- **File Upload Permission**: Tracked per message for security
- **TTL Cleanup**: Sessions expire after 7 days of inactivity

## File Structure

```
agent/
├── src/
│   ├── index.ts          # Express server entry point
│   ├── config.ts         # Multi-chain RPC configuration
│   ├── cron.ts           # PayrollCron: execute payrolls, APY monitoring, migrations
│   ├── contracts.ts      # ContractService: calldata generation, position queries
│   ├── defillama.ts      # DefiLlama yield API
│   ├── db.ts             # MongoDB connection
│   ├── addresses.json    # Deployed contract addresses
│   ├── abis.json         # Contract ABIs (router, stateManager, migration, erc20)
│   ├── models/
│   │   ├── ChatSession.ts  # MongoDB chat session model
│   │   └── Payroll.ts      # MongoDB payroll model
│   └── routes/
│       └── chat.ts       # OpenAI chat router (SSE streaming + function calling)
├── package.json
├── tsconfig.json
└── README.md
```

## Configuration Files

### addresses.json

Contains deployed contract addresses for all chains:
- `baseSepolia` - PoolManager, Router, StateManager, Migration, USDC, USDT
- `sepolia` - PoolManager, Router, StateManager, Migration, USDC, USDT
- `arcTestnet` - Distributor, Gateway Minter

### abis.json

Contract ABI definitions:
- `router` - ArcFlowRouter functions (deposit, execute, cancel, getPos, etc.)
- `stateManager` - ArcFlowStateManager functions
- `migration` - ArcFlowMigration functions
- `distributor` - ArcPayrollDistributor functions
- `erc20` - Standard ERC20 functions (approve, allowance, balanceOf)

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
