# ArcFlow Agent

Autonomous agent service for cross-chain payroll management, APY optimization, and Yellow Network integration.

## Features

- **Payroll Execution Cron** - Automatically executes ready payrolls every 60 seconds
- **APY Monitoring** - Scans yield rates across chains every 6 hours via DefiLlama
- **Multi-Chain Support** - Sepolia, Base Sepolia, Arc Testnet
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
RPC_URL=https://...            # Custom RPC URL (overrides Alchemy for primary chain)
CRON_INTERVAL=60000            # Payroll check interval in ms (default: 60s)
```

### Alchemy RPC URLs

With `ALCHEMY_API_KEY` set, the agent automatically uses:

| Chain | Alchemy URL |
|-------|-------------|
| Sepolia | `https://eth-sepolia.g.alchemy.com/v2/{key}` |
| Base Sepolia | `https://base-sepolia.g.alchemy.com/v2/{key}` |

Without an API key, public RPCs are used as fallback.

## Supported Chains

| Chain | Chain ID | USDC Address | Circle Domain |
|-------|----------|--------------|---------------|
| Sepolia | 11155111 | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | 0 |
| Base Sepolia | 84532 | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | 6 |
| Arc Testnet | 5042002 | Minted via Gateway | 9 |

## API Endpoints

### Health & Status

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Service status, last cron result, last APY update |

### Chat

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Conversational AI for payroll management |
| `/api/session/:sessionId` | GET | Get session payroll state |
| `/api/yields` | GET | Top 10 USDC yields from DefiLlama |

### APY Monitoring

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/apy/latest` | GET | Latest APY data across all chains |
| `/api/apy/history` | GET | APY update history |
| `/api/apy/update` | POST | Force immediate APY update |
| `/api/rebalance/history` | GET | Rebalancing operation history |

### Yellow Network (Multi-Chain)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/yellow/chains` | GET | List all supported chains |
| `/api/yellow/balance/:address` | GET | Get USDC balance (add `?chainId=X` for specific chain) |
| `/api/yellow/register-batch` | POST | Register incoming bridged funds |
| `/api/yellow/cache-recipients` | POST | Cache recipient data for payroll |
| `/api/yellow/chunk-batch` | POST | Chunk batch into individual payments |
| `/api/yellow/pending-batches` | GET | Get pending batches (add `?chainId=X` to filter) |
| `/api/yellow/cross-chain-transfer` | POST | Generate cross-chain transfer params |

## Cron Jobs

### Payroll Execution (every 60s)
- Checks for ready payrolls via `getReadyPayrolls()`
- Executes batch withdrawal via `executeReadyPayrolls()`
- Bridges funds to Circle Gateway for distribution

### APY Monitoring (every 6 hours)
- Fetches USDC yields from DefiLlama API
- Updates on-chain StateManager via `batchUpdateChainApy()`
- Checks rebalancing opportunities (APY diff > 0.5%)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      ArcFlow Agent                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ PayrollCron │  │ APY Monitor │  │ Yellow Chunking     │ │
│  │             │  │             │  │                     │ │
│  │ - 60s tick  │  │ - 6hr tick  │  │ - Register batches  │ │
│  │ - Execute   │  │ - DefiLlama │  │ - Cache recipients  │ │
│  │   payrolls  │  │ - Update    │  │ - Chunk & sign      │ │
│  │             │  │   on-chain  │  │ - Multi-chain       │ │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘ │
│         │                │                     │            │
│         ▼                ▼                     ▼            │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                   Contract Service                      ││
│  │  - ArcFlowRouter interaction                           ││
│  │  - StateManager updates                                ││
│  │  - Multi-chain RPC clients                             ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## API Examples

### Chat with Agent

```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I want to set up a payroll for January 31st",
    "sessionId": "user-123",
    "userAddress": "0x..."
  }'
```

**Response:**
```json
{
  "response": "I've set the payroll date to January 31st, 2025...",
  "sessionId": "user-123",
  "state": {
    "hasPayrollDate": true,
    "hasRecipients": false,
    "recipientCount": 0,
    "totalAmount": null
  }
}
```

### Register Batch Funds

```bash
curl -X POST http://localhost:3001/api/yellow/register-batch \
  -H "Content-Type: application/json" \
  -d '{
    "payrollId": "1",
    "provider": "0x...",
    "totalAmount": "100000000000",
    "payrollDate": "1735689600",
    "sourceChainId": "84532",
    "targetChainId": "11155111",
    "bridgeTxHash": "0x..."
  }'
```

### Cache Recipients

```bash
curl -X POST http://localhost:3001/api/yellow/cache-recipients \
  -H "Content-Type: application/json" \
  -d '{
    "payrollId": "1",
    "recipients": [
      { "wallet": "0x1234...", "amount": "5000000000" },
      { "wallet": "0x5678...", "amount": "4500000000" }
    ]
  }'
```

### Chunk Batch

```bash
curl -X POST http://localhost:3001/api/yellow/chunk-batch \
  -H "Content-Type: application/json" \
  -d '{
    "payrollId": "1",
    "targetChainId": "11155111"
  }'
```

### Get Multi-Chain Balance

```bash
# All chains
curl http://localhost:3001/api/yellow/balance/0x1234...

# Specific chain
curl "http://localhost:3001/api/yellow/balance/0x1234...?chainId=84532"
```

### Force APY Update

```bash
curl -X POST http://localhost:3001/api/apy/update
```

### Cross-Chain Transfer

```bash
curl -X POST http://localhost:3001/api/yellow/cross-chain-transfer \
  -H "Content-Type: application/json" \
  -d '{
    "fromChainId": "84532",
    "toChainId": "11155111",
    "amount": "1000000000",
    "recipient": "0x..."
  }'
```

## Conversation Workflows

### 1. Create New Payroll

```
User: "I want to set up payroll for January 31st"
Agent: Sets payroll date

User: "Here are my employees:
address,amount
0xABC...,5000
0xDEF...,3000"
Agent: Parses CSV, shows totals and expected yield

User: "Generate the transactions"
Agent: Returns approval + deposit transaction data
```

### 2. Execute Ready Payrolls

```
User: "Check if any payrolls are ready"
Agent: Checks on-chain for matured payrolls

User: "Execute them"
Agent: Returns transaction to execute and bridge funds
```

### 3. Withdraw After Distribution

```
User: "Check my withdrawable balance"
Agent: Queries Yellow Network Custody Contract

User: "Withdraw 1000 USDC"
Agent: Returns withdrawal transaction data
```

## AI Tool Functions

The agent can execute these functions automatically based on conversation:

| Function | Description |
|----------|-------------|
| `set_payroll_date` | Set distribution date |
| `parse_csv_recipients` | Parse employee wallet/amount CSV |
| `get_expected_yield` | Fetch DeFi yields from DefiLlama |
| `calculate_expected_return` | Estimate returns for deposit period |
| `get_approval_transaction` | Generate USDC approval tx |
| `get_deposit_transaction` | Generate deposit tx |
| `get_user_positions` | Fetch user's LP positions |
| `get_usdc_balance` | Check wallet USDC balance |
| `get_ready_payrolls` | List payrolls ready to execute |
| `get_execute_payrolls_transaction` | Generate execution tx |
| `get_withdrawable_balance` | Check Yellow Network balance |
| `get_withdrawal_transaction` | Generate withdrawal tx |

## Contract Addresses

### Base Sepolia

| Contract | Address |
|----------|---------|
| ArcFlowRouter | `0x3734E5E2Ac678c513C9Ed47A040a9E7Fd83b64C7` |
| ArcFlowStateManager | `0x8B0ED3534D5eaa9D19F48C01b9c401eb2635C164` |
| USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| USDT | `0x323e78f944A9a1FcF3a10efcC5319DBb0bB6e673` |
| Gateway Wallet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` |

### Arc Testnet

| Contract | Address |
|----------|---------|
| ArcPayrollDistributor | `0x4c3526d71365064e24a755aab161e00cfa243649` |
| Gateway Minter | `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` |

## File Structure

```
agent/
├── src/
│   ├── index.ts          # Express server entry point
│   ├── config.ts         # Alchemy RPC configuration
│   ├── cron.ts           # PayrollCron with APY monitoring
│   ├── contracts.ts      # Contract interaction service
│   ├── defillama.ts      # DefiLlama yield API
│   ├── yellow.ts         # Multi-chain Yellow Network service
│   ├── addresses.json    # Deployed contract addresses
│   └── routes/
│       └── chat.ts       # OpenAI chat router
├── package.json
├── tsconfig.json
└── README.md
```

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
