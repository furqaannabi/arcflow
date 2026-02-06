# ArcFlow Agent

Autonomous agent service for cross-chain payroll management, APY optimization, and yield-based rebalancing with Yellow Network state channels.

## Features

- **Multi-Chain Payroll Cron** - Monitors and executes ready payrolls across Base Sepolia and Sepolia
- **APY Monitoring** - Fetches yield rates from DefiLlama every 6 hours
- **Cross-Chain Migration** - Automatically rebalances funds to highest-yield chains (>0.5% APY diff)
- **Yellow Network SDK** - Nitrolite SDK integration for state channel execution (mandatory for all payroll operations)
- **MongoDB Persistence** - Chat sessions stored in MongoDB with TTL-based cleanup
- **Conversational AI** - OpenAI-powered chat interface with CSV file upload support

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

# Yellow Network (Nitrolite SDK)
YELLOW_WS_URL=wss://clearnet-sandbox.yellow.com/ws  # ClearNode WebSocket
YELLOW_CUSTODY_ADDRESS=0x019B65A265EB3363822f2752141b3dF16131b262  # Custody contract
YELLOW_ADJUDICATOR_ADDRESS=0x7c7ccbc98469190849BCC6c926307794fDfB11F2  # Adjudicator
YELLOW_TOKEN_ADDRESS=0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238  # USDC token

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
| `/api/chat` | POST | Conversational AI for payroll management (form-data) |
| `/api/session/:sessionId` | GET | Get session payroll state |
| `/api/yields` | GET | Top 10 USDC yields from DefiLlama |

#### POST /api/chat

Accepts `multipart/form-data` with the following fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | string | No* | Text message to send |
| `sessionId` | string | No | Session ID (creates new if not provided) |
| `userAddress` | string | No | User's wallet address |
| `file` | file | No* | CSV file (only accepted if last message allows upload) |

*At least one of `message` or `file` is required.

**Response:**
```json
{
  "response": "Assistant message",
  "sessionId": "uuid-v4",
  "allowFileUpload": true,
  "state": {
    "hasPayrollDate": true,
    "hasRecipients": false,
    "recipientCount": 0,
    "totalAmount": null
  }
}
```

**File Upload Permission:**
- Files are only accepted when the previous assistant message has `allowFileUpload: true`
- This is automatically set when the assistant mentions CSV, upload, file, or employee data
- Check the `allowFileUpload` field in the response to know if the next message can include a file

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
┌─────────────────────────────────────────────────────────────────────┐
│                          ArcFlow Agent                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  ┌───────────┐ │
│  │ PayrollCron  │  │  APY Monitor │  │  Migration  │  │   Chat    │ │
│  │              │  │              │  │   Checker   │  │  Service  │ │
│  │ - Yellow-only│  │ - DefiLlama  │  │             │  │           │ │
│  │ - 60s check  │  │ - 6hr update │  │ - APY diff  │  │ - MongoDB │ │
│  │ - No direct  │  │ - StateMgr   │  │   > 0.5%    │  │ - Multer  │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘  └─────┬─────┘ │
│         │                 │                  │                │      │
│         ▼                 ▼                  ▼                ▼      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Yellow Network SDK                          │  │
│  │                                                                │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐    │  │
│  │  │ NitroliteSDK│  │  WebSocket   │  │   State Channels   │    │  │
│  │  │ - Auth      │  │  - ClearNode │  │   - Create/Fund    │    │  │
│  │  │ - Channels  │  │  - Messages  │  │   - Sign/Settle    │    │  │
│  │  └─────────────┘  └──────────────┘  └────────────────────┘    │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                  │                                   │
│                                  ▼                                   │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Multi-Chain Clients                         │  │
│  │                                                                │  │
│  │  Base Sepolia ◄────────► Sepolia ◄────────► Arc Testnet       │  │
│  │  (Router)                (Router)            (Distributor)     │  │
│  │  (Migration)             (Migration)         (Gateway)         │  │
│  │  (StateManager)          (StateManager)                        │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Chat Sessions

Chat sessions are stored in MongoDB with the following features:

- **Automatic Session Creation**: New UUID generated if no sessionId provided
- **Message History**: Full conversation stored with timestamps
- **Pending Payroll State**: Payroll date, recipients, amounts persisted
- **File Upload Permission**: Tracked per message for security
- **TTL Cleanup**: Sessions expire after 7 days of inactivity

## Conversation Examples

### 1. Greeting & Introduction

**Request:**
```bash
curl -X POST http://localhost:3001/api/chat \
  -F "message=Hello"
```

**Response:**
```json
{
  "response": "Hello! I'm ArcFlow, your AI assistant for DeFi payroll management. I can help you:\n\n1. Set up scheduled payroll distributions\n2. Deposit USDC to earn yield until payday\n3. Track your existing payroll positions\n4. Check expected returns based on current DeFi yields\n\nHow can I help you today?",
  "sessionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "allowFileUpload": false,
  "state": null
}
```

### 2. Setting Up Payroll Date

**Request:**
```bash
curl -X POST http://localhost:3001/api/chat \
  -F "message=I want to set up payroll for February 28th" \
  -F "sessionId=a1b2c3d4-e5f6-7890-abcd-ef1234567890"
```

**Response:**
```json
{
  "response": "I've set the payroll date to Friday, February 28, 2025.\n\nNow I need the employee payment data. Please upload a CSV file with two columns:\n- `address` - Employee wallet address\n- `amount` - Payment amount in USDC\n\nExample format:\n```\naddress,amount\n0x1234...abcd,1000\n0x5678...efgh,1500\n```",
  "sessionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "allowFileUpload": true,
  "state": {
    "hasPayrollDate": true,
    "hasRecipients": false,
    "recipientCount": 0,
    "totalAmount": null
  }
}
```

### 3. Uploading Employee CSV

**Request:**
```bash
curl -X POST http://localhost:3001/api/chat \
  -F "sessionId=a1b2c3d4-e5f6-7890-abcd-ef1234567890" \
  -F "file=@employees.csv"
```

**employees.csv:**
```csv
address,amount
0x742d35Cc6634C0532925a3b844Bc9e7595f8fE00,2500
0x8ba1f109551bD432803012645Ac136ddd64DBA72,3000
0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec,1500
```

**Response:**
```json
{
  "response": "I've parsed your employee data:\n\n| Wallet | Amount |\n|--------|--------|\n| 0x742d...fE00 | 2,500 USDC |\n| 0x8ba1...BA72 | 3,000 USDC |\n| 0x1CBd...C9Ec | 1,500 USDC |\n\n**Total: 7,000 USDC** for 3 recipients\n\nBased on current yields (~4.2% APY), you could earn approximately **$16.50** by the payroll date.\n\nTo proceed, I'll need your wallet address to generate the approval and deposit transactions.",
  "sessionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "allowFileUpload": false,
  "state": {
    "hasPayrollDate": true,
    "hasRecipients": true,
    "recipientCount": 3,
    "totalAmount": "7000.00"
  }
}
```

### 4. Providing Wallet Address & Getting Transactions

**Request:**
```bash
curl -X POST http://localhost:3001/api/chat \
  -F "message=My wallet is 0xYourWalletAddress123..." \
  -F "sessionId=a1b2c3d4-e5f6-7890-abcd-ef1234567890"
```

**Response:**
```json
{
  "response": "Here are your transactions:\n\n**Step 1: Approve USDC**\n```json\n{\n  \"to\": \"0x036CbD53842c5426634e7929541eC2318f3dCF7e\",\n  \"data\": \"0x095ea7b3000000...\"\n}\n```\n\n**Step 2: Deposit & Create Payroll**\n```json\n{\n  \"to\": \"0xA07C9A5C26adefB97F99E6926b5812c2089A156D\",\n  \"data\": \"0x47e7ef24000000...\"\n}\n```\n\nSign and send these transactions from your wallet. Your USDC will be deposited into a yield-generating LP position until February 28th, when the agent will automatically distribute payments to your employees via Yellow Network.",
  "sessionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "allowFileUpload": false,
  "state": {
    "hasPayrollDate": true,
    "hasRecipients": true,
    "recipientCount": 3,
    "totalAmount": "7000.00"
  }
}
```

### 5. Checking Positions

**Request:**
```bash
curl -X POST http://localhost:3001/api/chat \
  -F "message=Show my positions" \
  -F "userAddress=0xYourWalletAddress123..."
```

**Response:**
```json
{
  "response": "Here are your active payroll positions:\n\n| Payroll ID | Deposited | Yield | Payroll Date |\n|------------|-----------|-------|-------------|\n| #1 | 7,000 USDC | +$12.35 | Feb 28, 2025 |\n| #2 | 5,000 USDC | +$8.20 | Mar 15, 2025 |\n\n**Total Deposited:** 12,000 USDC\n**Total Yield Earned:** $20.55",
  "sessionId": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
  "allowFileUpload": false,
  "state": null
}
```

### 6. Checking Withdrawable Balance

**Request:**
```bash
curl -X POST http://localhost:3001/api/chat \
  -F "message=Check my withdrawable balance from Yellow Network" \
  -F "userAddress=0xYourWalletAddress123..."
```

**Response:**
```json
{
  "response": "Your Yellow Network Custody balance:\n\n**Withdrawable:** 5,250.00 USDC\n**Custody Contract:** 0x019B65A265EB3363822f2752141b3dF16131b262\n\nWould you like me to generate a withdrawal transaction?",
  "sessionId": "c3d4e5f6-a7b8-9012-cdef-345678901234",
  "allowFileUpload": false,
  "state": null
}
```

## File Structure

```
agent/
├── src/
│   ├── index.ts          # Express server entry point
│   ├── config.ts         # Multi-chain RPC configuration
│   ├── cron.ts           # Multi-chain PayrollCron (Yellow-only execution)
│   ├── contracts.ts      # Contract interaction service
│   ├── defillama.ts      # DefiLlama yield API
│   ├── yellow.ts         # Yellow Network service + Nitrolite SDK
│   ├── yellowClient.ts   # Nitrolite SDK wrapper
│   ├── db.ts             # MongoDB connection
│   ├── addresses.json    # Deployed contract addresses
│   ├── abis.json         # Contract ABIs
│   ├── models/
│   │   └── ChatSession.ts  # MongoDB chat session model
│   └── routes/
│       └── chat.ts       # OpenAI chat router (form-data + MongoDB)
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

### Chat with Agent (Text Only)

```bash
curl -X POST http://localhost:3001/api/chat \
  -F "message=Set up payroll for January 31st" \
  -F "userAddress=0x..."
```

### Chat with CSV Upload

```bash
# First, send a message that triggers file upload permission
curl -X POST http://localhost:3001/api/chat \
  -F "message=I want to set up payroll" \
  -F "sessionId=my-session"

# Response will include allowFileUpload: true
# Then upload the CSV file
curl -X POST http://localhost:3001/api/chat \
  -F "sessionId=my-session" \
  -F "file=@employees.csv"
```

### Continue Existing Session

```bash
curl -X POST http://localhost:3001/api/chat \
  -F "message=What's the expected yield?" \
  -F "sessionId=existing-session-uuid"
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

## Yellow Network Integration

All payroll executions and migrations **must** go through Yellow Network state channels. Direct execution is disabled.

### Execution Flow

1. **SDK Connection**: Agent connects to ClearNode via WebSocket
2. **Authentication**: EIP-712 session key authentication
3. **Channel Creation**: Creates state channel for payroll
4. **Fund Channel**: Allocates USDC to channel (`allocate_amount`)
5. **Execute**: Settles channel on-chain via `settleFromChannel()`
6. **Distribution**: Funds bridge to Arc Chain for distribution

### Migration Flow

When APY difference between chains exceeds 0.5%:

1. **Detection**: Cron detects better yield on another chain
2. **Validation**: Checks payroll isn't too close to execution date
3. **Channel Signature**: Agent signs Yellow Network channel state
4. **Migration Out**: Calls `migration.migrateOutViaChannel()`
   - Verifies channel signature
   - Removes liquidity from current chain
   - Bridges USDC via Circle Gateway
5. **Migration In**: On target chain, `migration.migrateInViaChannel()` receives funds
   - Verifies channel signature
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