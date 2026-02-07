# ArcFlow

Cross-chain payroll management platform with yield optimization. Deposit USDC, earn yield via Uniswap V4 LP positions, and distribute payments through Circle CCTP Bridge to Arc Chain.

## How It Works

```
                                    USER FLOW

    [1] DEPOSIT                [2] EARN YIELD              [3] EXECUTE                 [4] DISTRIBUTION

    Employer deposits     -->  USDC earns yield in   -->  Agent executes on     -->  Recipients receive
    USDC + payroll data        Uniswap V4 LP pool         payroll date                USDC on Arc Chain

    Base/Sepolia               Auto-rebalances to         Remove LP + swap            Circle CCTP Bridge
                               highest APY chain          back to USDC                + Distributor
```

## Architecture

```
                          +----------------------------------+
                          |        ArcFlow Agent             |
                          |  - Payroll Cron (60s)            |
                          |  - APY Monitor (6hr)             |
                          |  - Chat Interface (OpenAI)       |
                          +----------------+-----------------+
                                           |
        +----------------------------------+----------------------------------+
        |                                  |                                  |
        v                                  v                                  v
+-------+--------+               +---------+-------+                +---------+-------+
|  Base Sepolia  |               |     Sepolia     |                |   Arc Testnet   |
|  (Chain 84532) |               | (Chain 11155111)|                | (Chain 5042002) |
+----------------+               +-----------------+                +-----------------+
| ArcFlowRouter  |               | ArcFlowRouter   |                | PayrollDistrib. |
| - deposit()    |<--- APY --->  | - deposit()     |                | - distribute()  |
| - execute()    |   rebalance   | - execute()     |                +-----------------+
| - cancel()     |               | - cancel()      |                         ^
+----------------+               +-----------------+                         |
| StateManager   |               | StateManager    |                         |
| - APY tracking |               | - APY tracking  |                         |
+----------------+               +-----------------+                         |
| Migration      |               | Migration       |                         |
| - migrateOut() |<------------>| - migrateIn()   |                         |
+----------------+               +-----------------+                         |
        |                                  |                                  |
        +----------------------------------+----------------------------------+
                                           |
                          +----------------v-----------------+
                          |      Circle CCTP Bridge          |
                          |  - Burn USDC on source chain     |
                          |  - Mint USDC on Arc Chain        |
                          +----------------------------------+
```

## User Flow

### Step 1: Deposit USDC

Employer deposits USDC and specifies payroll details:

```solidity
// ArcFlowRouter.deposit()
router.deposit(
    10000e6,                    // 10,000 USDC
    1740787200,                 // Payroll date (Unix timestamp)
    [
        { wallet: 0x123..., amount: 3000e6 },
        { wallet: 0x456..., amount: 4000e6 },
        { wallet: 0x789..., amount: 3000e6 }
    ]
);
```

**What happens:**
1. USDC transferred from employer to Router
2. Half swapped to USDT via Uniswap V4
3. Full-range LP position created (USDC/USDT)
4. Position tracked with payroll metadata
5. Recipient data hashed for later verification

### Step 2: Earn Yield (Uniswap V4)

```
                    Uniswap V4 Pool (USDC/USDT)

    +--------------------------------------------------+
    |                                                  |
    |   Deposited: 10,000 USDC                         |
    |   +---------------------------------------------+|
    |   |  LP Position (Full Range)                   ||
    |   |  - 5,000 USDC                               ||
    |   |  - 5,000 USDT (swapped)                     ||
    |   |  - Earns swap fees (~3-5% APY)              ||
    |   +---------------------------------------------+|
    |                                                  |
    |   After 30 days: ~10,041 USDC equivalent         |
    |   Yield: ~$41 (4.1% APY)                         |
    +--------------------------------------------------+
```

**APY Optimization:**
- Agent monitors yields across chains via DefiLlama
- If another chain has >0.5% higher APY, funds migrate automatically
- Migration uses Circle CCTP Bridge for cross-chain USDC transfers

### Step 3: Execute Payroll

On payroll date, the agent executes:

```
    Agent                                             Blockchain
      |                                                    |
      |  1. getReadyPayrolls()                             |
      |--------------------------------------------------->|
      |                                                    |
      |  2. execute(payrollId)                             |
      |--------------------------------------------------->|
      |                                                    |
      |     3. Remove LP liquidity                         |
      |     4. Swap USDT -> USDC                           |
      |     5. Send yield to provider                      |
      |     6. Bridge deposit to Circle Gateway            |
      |                                                    |
```

### Step 4: Cancel Payroll (Optional)

Employers can cancel a payroll before its scheduled date:

```
    Employer                                          Blockchain
      |                                                    |
      |  1. cancel(payrollId)                              |
      |--------------------------------------------------->|
      |                                                    |
      |     2. Verify provider == msg.sender               |
      |     3. Verify block.timestamp < payrollDate        |
      |     4. Remove LP liquidity                         |
      |     5. Swap USDT -> USDC                           |
      |     6. Return all USDC to provider                 |
      |                                                    |
```

If the position was migrated to another chain, the agent first migrates it back before the employer can cancel.

### Step 5: Distribution (Arc Chain)

```
    Circle Gateway                Arc Chain                  Recipients
         |                           |                           |
         |  Mint USDC                |                           |
         |-------------------------->|                           |
         |                           |                           |
         |     distribute(recipients)                            |
         |                           |-------------------------->|
         |                           |                           |
         |                           |  0x123: 3,000 USDC        |
         |                           |  0x456: 4,000 USDC        |
         |                           |  0x789: 3,000 USDC        |
```

## Key Integrations

### Uniswap V4

USDC deposits earn yield through concentrated liquidity:

| Feature | Implementation |
|---------|----------------|
| Pool | USDC/USDT with 500 fee tier |
| Position | Full-range (-887220 to 887220 ticks) |
| Yield | Swap fees from stablecoin trades |
| APY | ~3-5% (varies with volume) |

### Circle CCTP Bridge

Cross-chain USDC transfers via native burn/mint:

| Network | Gateway Wallet | Gateway Minter |
|---------|----------------|----------------|
| Testnet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` | `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` |

## Deployed Contracts

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

## Quick Start

### 1. Deploy Contracts

```bash
cd contracts
cp .env.example .env
# Edit .env with your keys

# Deploy to all chains
./deploy.sh all

# Merge addresses for agent
./deploy.sh merge
```

### 2. Run Agent

```bash
cd agent
cp .env.example .env
# Edit .env with your keys

npm install
npm run dev
```

### 3. Run Frontend

```bash
cd frontend
npm install
npm run dev
```

### 4. Create Payroll (via Chat)

```bash
# Set payroll date
curl -X POST http://localhost:3001/api/chat \
  -F "message=Set up payroll for March 1st"

# Upload recipients CSV
curl -X POST http://localhost:3001/api/chat \
  -F "sessionId=<session-id>" \
  -F "file=@employees.csv"

# Get deposit transaction
curl -X POST http://localhost:3001/api/chat \
  -F "sessionId=<session-id>" \
  -F "message=My wallet is 0x..."
```

## Project Structure

```
arcflow/
├── contracts/           # Solidity smart contracts (Foundry)
│   ├── src/
│   │   ├── ArcFlowRouter.sol       # Main deposit, execute, cancel
│   │   ├── ArcFlowBase.sol         # Uniswap V4 LP operations
│   │   ├── ArcFlowStateManager.sol # APY tracking, migration validation
│   │   ├── ArcFlowMigration.sol    # Cross-chain migration
│   │   ├── ArcFlowTypes.sol        # Shared structs (LPPosition, PayrollRecipient)
│   │   └── ArcPayrollDistributor.sol # Arc chain distribution
│   ├── script/          # Deployment scripts
│   └── test/            # Integration tests
│
├── agent/               # TypeScript backend service
│   ├── src/
│   │   ├── index.ts     # Express server
│   │   ├── cron.ts      # Payroll execution & APY monitoring cron
│   │   ├── contracts.ts # Contract interaction service
│   │   ├── defillama.ts # DefiLlama yield API
│   │   └── routes/
│   │       └── chat.ts  # OpenAI chat with function calling + SSE
│   └── README.md
│
├── frontend/            # React + Vite frontend
│   ├── src/
│   │   ├── pages/       # Landing, AgentChat
│   │   ├── components/  # Chat, Sidebar, Payrolls, Connect
│   │   └── contexts/    # Auth (Circle Wallets), Theme
│   └── README.md
│
└── README.md            # This file
```

## Security

### Access Control

| Role | Permissions |
|------|-------------|
| Employer | Deposit USDC, cancel payrolls, view positions |
| Agent | Execute ready payrolls, trigger migrations |
| Owner | Set agent address, rescue tokens, seed pool |
| Migration | Remove/add liquidity for cross-chain transfers |

### Safety Features

- Only the position's provider (employer) can cancel
- Cancellation blocked after payroll date
- Cancellation blocked if position is on another chain (must migrate back first)
- Only the registered agent can execute payrolls
- Recipient data hashed at deposit time for verification at distribution

## Documentation

- [Agent README](./agent/README.md) - API endpoints, chat examples, cron jobs
- [Contracts README](./contracts/README.md) - Deployment, testing, contract details
- [Frontend README](./frontend/README.md) - Setup, tech stack, pages

## License

MIT
