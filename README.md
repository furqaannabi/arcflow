# ArcFlow

Cross-chain payroll management platform with yield optimization. Deposit USDC, earn yield via Uniswap V4, and distribute payments through Yellow Network state channels to Arc Chain.

## How It Works

```
                                    USER FLOW

    [1] DEPOSIT                [2] EARN YIELD              [3] SETTLEMENT              [4] DISTRIBUTION

    Employer deposits     -->  USDC earns yield in   -->  Agent settles via     -->  Recipients receive
    USDC + payroll data        Uniswap V4 LP pool         Yellow Network              USDC on Arc Chain

    Base/Sepolia               Auto-rebalances to         State channel               Circle CCTP Bridge
                               highest APY chain          signatures                  + Distributor
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
                          +----------------v-----------------+
                          |     Yellow Network (Nitrolite)   |
                          |  - State Channels                |
                          |  - EIP-712 Signatures            |
                          |  - ClearNode WebSocket           |
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
| - settle()     |   rebalance   | - settle()      |                +-----------------+
+----------------+               +-----------------+                         ^
| StateManager   |               | StateManager    |                         |
| - APY tracking |               | - APY tracking  |                         |
| - Channel verify|              | - Channel verify|                         |
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
    |   ┌─────────────────────────────────────────┐   |
    |   │  LP Position (Full Range)               │   |
    |   │  - 5,000 USDC                           │   |
    |   │  - 5,000 USDT (swapped)                 │   |
    |   │  - Earns swap fees (~3-5% APY)          │   |
    |   └─────────────────────────────────────────┘   |
    |                                                  |
    |   After 30 days: ~10,041 USDC equivalent         |
    |   Yield: ~$41 (4.1% APY)                         |
    +--------------------------------------------------+
```

**APY Optimization:**
- Agent monitors yields across chains via DefiLlama
- If another chain has >0.5% higher APY, funds migrate automatically
- Migration uses Yellow Network state channels for security

### Step 3: Settlement (Yellow Network)

On payroll date, the agent settles via Yellow Network:

```
    Agent                    Yellow Network                    Blockchain
      |                           |                                |
      |  1. Create Channel        |                                |
      |-------------------------->|                                |
      |                           |                                |
      |  2. Sign State            |                                |
      |  (payrollId, amount)      |                                |
      |-------------------------->|                                |
      |                           |                                |
      |  3. settle(pid, cid, sig) |                                |
      |---------------------------------------------------------->|
      |                           |                                |
      |                           |  4. Verify signature           |
      |                           |  5. Remove LP liquidity        |
      |                           |  6. Swap USDT -> USDC          |
      |                           |  7. Bridge to Arc via CCTP     |
      |                           |<-------------------------------|
```

**Why Yellow Network?**
- Gas-efficient batch settlements
- Cryptographic proof of agent authorization
- Prevents unauthorized withdrawals
- Enables cross-chain state verification

### Step 4: Distribution (Arc Chain)

```
    Circle Gateway                Arc Chain                  Recipients
         |                           |                           |
         |  Mint USDC                |                           |
         |-------------------------->|                           |
         |                           |                           |
         |     distributeFromChannel(channelId, recipients)      |
         |                           |-------------------------->|
         |                           |                           |
         |                           |  0x123: 3,000 USDC        |
         |                           |  0x456: 4,000 USDC        |
         |                           |  0x789: 3,000 USDC        |
         |                           |  + yield share            |
```

## Key Integrations

### Yellow Network (Nitrolite SDK)

All settlement and migration operations require Yellow Network state channel signatures:

| Function | Description |
|----------|-------------|
| `settle(pid, channelId, signature)` | Execute payroll with channel proof |
| `migrateOutViaChannel()` | Migrate to higher-yield chain |
| `migrateInViaChannel()` | Receive migrated funds |
| `distributeFromChannel()` | Distribute on Arc Chain |

**State Channel Flow:**
```typescript
// 1. Connect to ClearNode
const client = await NitroliteClient.connect(wsUrl, privateKey);

// 2. Create channel for payroll
const channel = await client.createChannel({
  participants: [agentAddress, routerAddress],
  amount: payrollAmount
});

// 3. Sign settlement state
const signature = await client.signState({
  channelId: channel.id,
  payrollId: payrollId,
  amount: totalAmount
});

// 4. Settle on-chain
await router.settle(payrollId, channel.id, signature);
```

### Uniswap V4

USDC deposits earn yield through concentrated liquidity:

| Feature | Implementation |
|---------|----------------|
| Pool | USDC/USDT with 0.01% fee |
| Position | Full-range (-887220 to 887220 ticks) |
| Yield | Swap fees from stablecoin trades |
| APY | ~3-5% (varies with volume) |

**Pool Operations:**
```solidity
// Deposit: Swap half to USDT, add liquidity
poolManager.swap(...)     // USDC -> USDT
poolManager.modifyLiquidity(...)  // Add LP

// Withdraw: Remove liquidity, swap back
poolManager.modifyLiquidity(...)  // Remove LP
poolManager.swap(...)     // USDT -> USDC
```

### Circle CCTP Bridge

Cross-chain USDC transfers via native burn/mint:

| Network | Gateway Wallet | Gateway Minter |
|---------|----------------|----------------|
| Testnet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` | `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` |
| Mainnet | `0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE` | `0x2222222d7164433c4C09B0b0D809a9b52C04C205` |

## Deployed Contracts

### Base Sepolia (84532)

| Contract | Address |
|----------|---------|
| Router | `0x5a17ADC65211839f9ba2aE818902758F7C7F8Aa7` |
| StateManager | `0xf9973fb417EC0c6479ce48428c609d8ec9e5faA3` |
| Migration | `0x89f905bE3C7852971965353A8D0E565207A7AA3f` |

### Sepolia (11155111)

| Contract | Address |
|----------|---------|
| Router | `0x3d3131bA11363596423A6c77B21EB1F174752547` |
| StateManager | `0xc563847a746b8bd1B19d62e2b7377b4e9AA4D574` |
| Migration | `0x6bee4505Ff82f6647932F93a157eA0E67b565D00` |

### Arc Testnet (5042002)

| Contract | Address |
|----------|---------|
| Distributor | `0x559B75C59DB2ec1753f02F4a6BD50303DA76cfe8` |

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

### 3. Create Payroll (via Chat API)

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
├── contracts/           # Solidity smart contracts
│   ├── src/
│   │   ├── ArcFlowRouter.sol       # Main deposit + settlement
│   │   ├── ArcFlowStateManager.sol # APY + channel verification
│   │   ├── ArcFlowMigration.sol    # Cross-chain migration
│   │   └── ArcPayrollDistributor.sol # Arc chain distribution
│   ├── script/          # Deployment scripts
│   └── test/            # Integration tests
│
├── agent/               # Node.js backend service
│   ├── src/
│   │   ├── index.ts     # Express server
│   │   ├── cron.ts      # Payroll execution cron
│   │   ├── yellow.ts    # Yellow Network SDK
│   │   ├── contracts.ts # Contract interactions
│   │   └── routes/      # API endpoints
│   └── README.md
│
└── README.md            # This file
```

## Security

### Yellow Network Requirement

All value-moving operations require Yellow Network signatures:

- **No direct withdrawals**: `withdraw()` removed from Router
- **Channel verification**: StateManager verifies all signatures
- **Agent authorization**: Only registered agents can settle
- **Recipient hash**: Payroll recipients verified at distribution

### Access Control

| Role | Permissions |
|------|-------------|
| Employer | Deposit USDC, view positions |
| Agent | Settle payrolls, trigger migrations |
| StateManager | Verify signatures, track APY |
| Migration | Cross-chain fund transfers |

## Documentation

- [Agent README](./agent/README.md) - API endpoints, chat examples, cron jobs
- [Contracts README](./contracts/README.md) - Deployment, testing, contract details

## License

MIT
