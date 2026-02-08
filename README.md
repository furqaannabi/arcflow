# ArcFlow

Cross-chain payroll management platform with yield optimization. Deposit USDC, earn yield via Uniswap V4 LP positions, and distribute payments through Circle Gateway Bridge to Arc Chain.

## How It Works

```
Employer                    Uniswap V4               Circle Gateway              Arc Chain
   |                           |                           |                        |
   |  1. deposit(USDC, date,   |                           |                        |
   |     recipients[])         |                           |                        |
   |-------------------------->|                           |                        |
   |   transferFrom(USDC)      |                           |                        |
   |   swap(USDC -> USDT, 50%) |                           |                        |
   |   addLiquidity(USDC,USDT) |                           |                        |
   |   Store LPPosition        |                           |                        |
   |                           |                           |                        |
   |        ~~~~ Earn Uniswap V4 swap fees (3-48% APY) ~~~~                         |
   |                           |                           |                        |
   |  2. Agent cron detects payrollDate reached            |                        |
   |     execute(payrollId)    |                           |                        |
   |-------------------------->|                           |                        |
   |   removeLiquidity()       |                           |                        |
   |   swap(USDT -> USDC)      |                           |                        |
   |   yield -> employer       |                           |                        |
   |   principal -> Gateway    |  depositFor(agent, amt)   |                        |
   |                           |-------------------------->|                        |
   |   position.executed=true  |                           |                        |
   |                           |                           |                        |
   |  3. Distribution cron picks up executed payroll       |                        |
   |     Query Gateway balance |                           |                        |
   |     Sign EIP-712 burn     |                           |                        |
   |     POST /v1/transfer     |                           |                        |
   |---------------------------|-------------------------->|                        |
   |                           |  <-- attestation + sig    |                        |
   |                           |                           |                        |
   |  4. mintVerifyAndDistribute(attestation, sig, ...)    |                        |
   |------------------------------------------------------------------>|
   |                           |                           |  gatewayMint()         |
   |                           |                           |----------------------->|
   |                           |                           |  Verify state hash     |
   |                           |                           |  Pro-rata distribute:  |
   |                           |                           |  Employee A: 3000 USDC |
   |                           |                           |  Employee B: 4000 USDC |
   |                           |                           |  Employee C: 3000 USDC |
   |                           |                           |                        |
   |  5. markDistributed(pid)  |                           |                        |
   |-------------------------->|                           |                        |
   |   position.distributed=true                           |                        |
```

## Architecture

```
                          +----------------------------------+
                          |        ArcFlow Agent             |
                          |  - Execute Cron (60s)            |
                          |  - Distribution Cron (15min)     |
                          |  - APY Monitor (6hr)             |
                          |  - Rebalance (after APY update)  |
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
| - deposit()    |<--- APY --->  | - deposit()     |                | - mintVerify    |
| - execute()    |   rebalance   | - execute()     |                |   AndDistribute |
| - cancel()     |               | - cancel()      |                | - emergencyWith |
| - markDistrib()|               | - markDistrib() |                +-----------------+
+----------------+               +-----------------+                         ^
| StateManager   |               | StateManager    |                         |
| - APY tracking |               | - APY tracking  |                         |
| - batchUpdate  |               | - batchUpdate   |                         |
+----------------+               +-----------------+                         |
| Migration      |               | Migration       |                         |
| - migrateOut() |<------------>| - migrateIn()   |                         |
+----------------+               +-----------------+                         |
        |                                  |                                  |
        +----------------------------------+----------------------------------+
                                           |
                          +----------------v-----------------+
                          |      Circle Gateway Bridge       |
                          |  GatewayWallet: depositFor()     |
                          |  EIP-712 burn intent signing     |
                          |  Gateway API: /v1/transfer       |
                          |  GatewayMinter: gatewayMint()    |
                          +----------------------------------+
```

## Contract Flow

### 1. Deposit

```solidity
// ArcFlowRouter.deposit()
function deposit(
    uint256 amt,       // USDC amount (6 decimals)
    uint256 date,      // Payroll date (unix timestamp, must be future)
    PayrollRecipient[] memory r  // [{wallet, amount}, ...]
) external returns (uint256 pid, uint128 liq)
```

```
Employer                         Router                          Uniswap V4
   |                               |                                |
   |  USDC.approve(router, amt)    |                                |
   |------------------------------>|                                |
   |  deposit(amt, date, recipients)                                |
   |------------------------------>|                                |
   |                               |  transferFrom(employer, amt)   |
   |                               |  swap(USDC -> USDT, amt/2)    |
   |                               |------------------------------->|
   |                               |  addLiquidity(USDC, USDT)     |
   |                               |------------------------------->|
   |                               |                                |
   |                               |  Store LPPosition {           |
   |                               |    payrollId, provider,       |
   |                               |    liquidity, usdcDeposited,  |
   |                               |    payrollDate, recipients,   |
   |                               |    payrollStateHash,          |
   |                               |    sourceChainId, currentChain|
   |                               |    executed: false,           |
   |                               |    distributed: false         |
   |                               |  }                            |
   |                               |  Push to activePayrollIds     |
   |                               |  Push to providerPayrolls     |
   |  <-- returns (payrollId, liq) |                                |
```

### 2. Execute (Agent Cron - every 60s)

The agent cron fetches `getActiveIds()` then `getPos()` for each, filters for payrolls where `payrollDate <= now && liquidity > 0 && !executed`.

```solidity
// ArcFlowRouter.execute()
function execute(uint256 pid) external onlyAgent returns (uint256 amt)
```

```
Agent                            Router                     Gateway Wallet
  |                                |                              |
  |  getActiveIds()                |                              |
  |------------------------------->|                              |
  |  <-- [1, 2, 3]                |                              |
  |                                |                              |
  |  getPos(pid) for each          |                              |
  |------------------------------->|                              |
  |  <-- LPPosition (check ready) |                              |
  |                                |                              |
  |  execute(payrollId)            |                              |
  |------------------------------->|                              |
  |                                |  _withdraw():                |
  |                                |    removeLiquidity(liq)      |
  |                                |    swap(USDT -> USDC)        |
  |                                |    if yield > 0:             |
  |                                |      transfer yield -> employer
  |                                |                              |
  |                                |  USDC.approve(gateway, amt)  |
  |                                |  depositFor(USDC, agent, amt)|
  |                                |----------------------------->|
  |                                |                              |
  |                                |  position.liquidity = 0     |
  |                                |  position.executed = true    |
  |  <-- returns amt               |                              |
  |                                |                              |
  |  Update MongoDB: status=executed                              |
```

### 3. Distribute (Distribution Cron - every 15min)

The distribution cron fetches all positions and filters for `executed && !distributed`. It bridges funds from source chain to Arc via Circle Gateway, then distributes on Arc.

```
Agent                  Source Chain        Gateway API          Arc Chain
  |                        |                    |                    |
  |  getActiveIds()        |                    |                    |
  |----------------------->|                    |                    |
  |  getPos() filter       |                    |                    |
  |  executed && !distributed                   |                    |
  |                        |                    |                    |
  |  POST /v1/balances     |                    |                    |
  |  {depositor, domain}   |                    |                    |
  |------------------------------------------->|                    |
  |  <-- balance: "1.21"   |                    |                    |
  |                        |                    |                    |
  |  Sign EIP-712 BurnIntent {                  |                    |
  |    maxFee: 0.02 USDC,                       |                    |
  |    spec: {                                  |                    |
  |      sourceDomain -> destDomain (26),       |                    |
  |      value: balance - fee,                  |                    |
  |      destinationRecipient: distributor      |                    |
  |    }                                        |                    |
  |  }                                          |                    |
  |                        |                    |                    |
  |  POST /v1/transfer     |                    |                    |
  |------------------------------------------->|                    |
  |  <-- attestation + sig |                    |                    |
  |                        |                    |                    |
  |  Sign payroll state hash (EIP-191)          |                    |
  |  keccak256(pid, provider, amt, date, chainId, recipientsHash)   |
  |                        |                    |                    |
  |  mintVerifyAndDistribute(                   |                    |
  |    attestation, sig,                        |                    |
  |    pid, provider, amt, date,                |                    |
  |    stateSignature, recipients)              |                    |
  |------------------------------------------------------------>|
  |                        |                    |  gatewayMint() |
  |                        |                    |--------------->|
  |                        |                    |  USDC minted   |
  |                        |                    |                |
  |                        |                    |  Verify state: |
  |                        |                    |  - recompute   |
  |                        |                    |    stateHash   |
  |                        |                    |  - recover     |
  |                        |                    |    signer      |
  |                        |                    |  - check       |
  |                        |                    |    authorized  |
  |                        |                    |                |
  |                        |                    |  Pro-rata dist:|
  |                        |                    |  payout[i] =   |
  |                        |                    |  minted *      |
  |                        |                    |  r[i].amount / |
  |                        |                    |  totalAmount   |
  |                        |                    |                |
  |                        |                    |  safeTransfer  |
  |                        |                    |  to each wallet|
  |                        |                    |                    |
  |  markDistributed(pid)  |                    |                    |
  |----------------------->|                    |                    |
  |  position.distributed = true                |                    |
  |                        |                    |                    |
  |  Update MongoDB: status=settled, distributed=true               |
```

### 4. Cancel (Before Payroll Date)

```solidity
// ArcFlowRouter.cancel() — only provider, only before payrollDate
function cancel(uint256 pid) external returns (uint256 amt)
```

```
Employer                         Router                          Uniswap V4
   |                               |                                |
   |  cancel(payrollId)            |                                |
   |------------------------------>|                                |
   |                               |  require(provider == sender)   |
   |                               |  require(now < payrollDate)    |
   |                               |  removeLiquidity(liq)          |
   |                               |------------------------------->|
   |                               |  swap(USDT -> USDC)            |
   |                               |------------------------------->|
   |                               |                                |
   |                               |  delete positions[pid]         |
   |                               |  remove from activePayrollIds  |
   |                               |  remove from providerPayrolls  |
   |                               |                                |
   |  <-- USDC returned to wallet  |                                |
```

### 5. Cross-Chain Migration (APY Optimization)

When APY is higher on another chain (>0.5% diff), the agent migrates positions.

```
Agent                   Source Chain              Gateway              Target Chain
  |                         |                        |                      |
  |  getBestChainForApy()   |                        |                      |
  |------------------------>|                        |                      |
  |  <-- chainId, apy       |                        |                      |
  |                         |                        |                      |
  |  shouldMigrate(pid)     |                        |                      |
  |------------------------>|                        |                      |
  |  <-- true, targetChain, apyDiff                  |                      |
  |                         |                        |                      |
  |  migrateOut(pid, target)|                        |                      |
  |------------------------>|                        |                      |
  |   removeLiquidity()     |                        |                      |
  |   depositFor(agent,amt) |                        |                      |
  |                         |----------------------->|                      |
  |   updatePosChain(target)|                        |                      |
  |                         |                        |                      |
  |  Sign EIP-712 burn intent                        |                      |
  |  POST /v1/transfer      |                        |                      |
  |  <-- attestation + sig  |                        |                      |
  |                         |                        |                      |
  |  migrateIn(pid, sourceChain, amt, attestation, sig)                     |
  |-------------------------------------------------------------------->|
  |                         |                        |  gatewayMint()    |
  |                         |                        |----------------->|
  |                         |                        |  addLiquidity()  |
  |                         |                        |  updatePosChain()|
  |                         |                        |                  |
```

## Position Lifecycle

```
  DEPOSITED                EXECUTED                  DISTRIBUTED
 +-------------+         +-------------+           +-------------+
 | liquidity>0 | execute | liquidity=0 | distribute| liquidity=0 |
 | executed: F |-------->| executed: T |---------->| executed: T |
 | distrib.: F |  (cron) | distrib.: F |   (cron)  | distrib.: T |
 +-------------+  60s    +-------------+   15min   +-------------+
       |                                                  |
       | cancel (provider,                                |
       | before payrollDate)                              |
       v                                           MongoDB status:
   CANCELLED                                        "settled"
 +-------------+
 | deleted from|
 | storage     |
 | USDC back   |
 | to employer |
 +-------------+
```

## Live Transactions

| Step | Transaction |
|------|-------------|
| Deposit | [`0x3ab00524...`](https://sepolia.basescan.org/tx/0x3ab005247ab96b08717a681b3b9168a070199818bea9a478ad6fd92f2a8e7eff) |
| Execute | [`0xfef3b605...`](https://sepolia.basescan.org/tx/0xfef3b605ce929f9df1a2f24a90c957c7ae56aeb94dac9906ec60048bdeb6aa36) |

## Deployed Contracts

### Base Sepolia (Chain 84532)

| Contract | Address |
|----------|---------|
| PoolManager | [`0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408`](https://sepolia.basescan.org/address/0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408) |
| Router | [`0x5a73E232fA6c3E3a1d4Cfa64775b0cfE284AaE77`](https://sepolia.basescan.org/address/0x5a73E232fA6c3E3a1d4Cfa64775b0cfE284AaE77) |
| StateManager | [`0x92bc6404233CD678f59768b65d8C060239Ac4A61`](https://sepolia.basescan.org/address/0x92bc6404233CD678f59768b65d8C060239Ac4A61) |
| Migration | [`0x68216805173074b1F9D6D28c642aBf269F42B233`](https://sepolia.basescan.org/address/0x68216805173074b1F9D6D28c642aBf269F42B233) |
| USDC | [`0x036CbD53842c5426634e7929541eC2318f3dCF7e`](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e) |
| USDT | [`0x97078835e54862f808e9D77c3BD50019700ac952`](https://sepolia.basescan.org/address/0x97078835e54862f808e9D77c3BD50019700ac952) |

### Sepolia (Chain 11155111)

| Contract | Address |
|----------|---------|
| PoolManager | [`0xE03A1074c86CFeDd5C142C4F04F1a1536e203543`](https://sepolia.etherscan.io/address/0xE03A1074c86CFeDd5C142C4F04F1a1536e203543) |
| Router | [`0x44664E955Ec0BCf74d69B1a66Ae327da6a5BC4D5`](https://sepolia.etherscan.io/address/0x44664E955Ec0BCf74d69B1a66Ae327da6a5BC4D5) |
| StateManager | [`0x4290244fc9E9542e9c905C3C735A7912841E9757`](https://sepolia.etherscan.io/address/0x4290244fc9E9542e9c905C3C735A7912841E9757) |
| Migration | [`0x2b44A66E84920Ef71f59Fd78B7a450121455D00f`](https://sepolia.etherscan.io/address/0x2b44A66E84920Ef71f59Fd78B7a450121455D00f) |
| USDC | [`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`](https://sepolia.etherscan.io/address/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238) |
| USDT | [`0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0`](https://sepolia.etherscan.io/address/0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0) |

### Arc Testnet (Chain 5042002)

| Contract | Address |
|----------|---------|
| Distributor | [`0xb44e184AB697a5dE2DBfa00EC02a125f64563D1f`](https://testnet.arcscan.app/address/0xb44e184AB697a5dE2DBfa00EC02a125f64563D1f) |
| GatewayMinter | [`0x0022222ABE238Cc2C7Bb1f21003F0a260052475B`](https://testnet.arcscan.app/address/0x0022222ABE238Cc2C7Bb1f21003F0a260052475B) |
| USDC (ERC20) | [`0x3600000000000000000000000000000000000000`](https://testnet.arcscan.app/token/0x3600000000000000000000000000000000000000) |

### Circle Gateway (All Chains)

| Contract | Address |
|----------|---------|
| GatewayWallet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` |
| GatewayMinter | `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` |

| Chain | Gateway Domain |
|-------|---------------|
| Ethereum Sepolia | 0 |
| Base Sepolia | 6 |
| Arc Testnet | 26 |

## Agent Cron Jobs

| Cron | Interval | What It Does |
|------|----------|--------------|
| **Execute** | 60s | Fetches `getActiveIds()` + `getPos()`, filters `payrollDate <= now && !executed`, calls `execute(pid)` |
| **Distribute** | 15min | Filters `executed && !distributed`, bridges via Gateway burn intent, calls `mintVerifyAndDistribute` on Arc, then `markDistributed` on source chain |
| **APY Monitor** | 6hr | Fetches USDC/USDT yields from DefiLlama, calls `StateManager.batchUpdateChainApy()` on all chains |
| **Rebalance** | After APY | Calls `shouldMigrate(pid)` for each active payroll, executes `migrateOut/In` if APY diff > 0.5% |

## Key Integrations

### Uniswap V4

USDC deposits earn yield through full-range LP positions:

| Feature | Detail |
|---------|--------|
| Pool | USDC/USDT, 500 fee tier (0.05%) |
| Position | Full-range ticks (-887220 to 887220) |
| Yield | Swap fees from stablecoin trades |
| APY Source | DefiLlama API, updated every 6 hours |
| Deposit | 50% swapped to USDT, both added as LP |
| Withdraw | Remove LP, swap USDT back to USDC |

### Circle Gateway Bridge

Cross-chain USDC transfers via EIP-712 signed burn intents:

```
1. Router.execute() calls gatewayWallet.depositFor(USDC, agent, amt)
2. Agent queries Gateway API for available balance
3. Agent signs EIP-712 BurnIntent { maxFee: 0.02 USDC, TransferSpec }
4. POST /v1/transfer -> returns attestation + signature
5. gatewayMinter.gatewayMint(attestation, signature) on Arc Chain
6. Distributor verifies state hash + distributes pro-rata
```

### ArcPayrollDistributor (Arc Chain)

Receives bridged USDC and distributes to employees:

| Feature | Detail |
|---------|--------|
| State verification | Recomputes `keccak256(pid, provider, amt, date, chainId, recipientsHash)` |
| Signature check | Recovers signer from EIP-191 signed state hash, must be authorized agent |
| Replay protection | `processedPayrolls[stateHash]` mapping prevents double-distribution |
| Pro-rata payout | `payout[i] = minted * recipients[i].amount / totalAmount` handles bridge fee deductions |
| Token | ERC20 USDC at `0x3600...` (not native) |

## Quick Start

### 1. Deploy Contracts

```bash
cd contracts
cp .env.example .env
# Edit .env with PRIVATE_KEY and ALCHEMY_API_KEY

# Deploy to all chains + merge addresses
./deploy.sh all

# Or deploy individually (auto-merges)
./deploy.sh baseSepolia
./deploy.sh sepolia
./deploy.sh arc
```

### 2. Run Agent

```bash
cd agent
cp .env.example .env
# Edit .env with OPENAI_API_KEY, MONGODB_URI, AGENT_PRIVATE_KEY, ALCHEMY_API_KEY

npm install
npm run dev
# Starts Express server + all cron jobs
```

### 3. Run Frontend

```bash
cd frontend
npm install
npm run dev
```

### 4. Create Payroll (via Chat)

```
User: "Set up payroll for March 1st"
Agent: Sets payroll date, asks for recipients

User: uploads employees.csv
Agent: Parses CSV, shows recipients + amounts

User: "My wallet is 0x50A1..."
Agent: Returns approve() + deposit() transactions to sign
```

## Project Structure

```
arcflow/
├── contracts/               # Solidity (Foundry, ^0.8.24)
│   ├── src/
│   │   ├── ArcFlowRouter.sol         # deposit, execute, cancel, markDistributed
│   │   ├── ArcFlowBase.sol           # Uniswap V4 LP: add/remove/swap, unlock callbacks
│   │   ├── ArcFlowStateManager.sol   # APY tracking, migration validation
│   │   ├── ArcFlowMigration.sol      # migrateOut/migrateIn via Circle Gateway
│   │   ├── ArcFlowTypes.sol          # LPPosition, PayrollRecipient, CallbackData
│   │   ├── ArcPayrollDistributor.sol # Arc chain: mint + verify + distribute (ERC20)
│   │   └── interfaces/
│   │       └── ICircleGateway.sol     # IGatewayWallet, IGatewayMinter
│   ├── script/                # Deploy scripts (00_DeployAll, 01_Distributor, 02_Merge)
│   └── deploy.sh              # Multi-chain deployment CLI
│
├── agent/                     # TypeScript (Express, OpenAI, MongoDB)
│   ├── src/
│   │   ├── index.ts           # Express server entry
│   │   ├── cron.ts            # PayrollCron: execute, distribute, APY, rebalance
│   │   ├── contracts.ts       # ContractService: read/write calldata generation
│   │   ├── config.ts          # Chain IDs, Gateway domains, RPC URLs
│   │   ├── defillama.ts       # DefiLlama yield API
│   │   ├── abis.json          # Contract ABIs
│   │   ├── addresses.json     # Deployed contract addresses (auto-generated)
│   │   ├── models/
│   │   │   └── Payroll.ts     # MongoDB schema (payrollId, recipients, status, distributed)
│   │   └── routes/
│   │       └── chat.ts        # OpenAI function calling + SSE streaming
│   └── package.json
│
├── frontend/                  # React + Vite
│   ├── src/
│   │   ├── pages/             # Landing, AgentChat
│   │   ├── components/        # Chat, Sidebar, Payrolls, Connect
│   │   └── contexts/          # Auth (Circle Wallets), Theme
│   └── package.json
│
└── README.md
```

## Security

### Access Control

| Role | Permissions |
|------|-------------|
| Employer | `deposit()`, `cancel()` (own payrolls only, before date) |
| Agent | `execute()`, `markDistributed()`, `migrateOut/In()`, `batchUpdateChainApy()` |
| Owner | `setAgent()`, `setMigration()`, `setGateway()`, `rescue()`, `seed()` |

### Position Data Preservation

Executed payrolls are **not deleted** from storage. Instead:
- `executed = true` after LP removal + Gateway deposit
- `distributed = true` after Arc chain distribution + `markDistributed()`
- `liquidity = 0` prevents re-execution (reverts with `NoPosition`)
- Full position data (provider, amount, date, recipients hash) remains queryable
- Cancel **does** delete position data and returns USDC to employer

### Distribution Safety

- State hash verified on-chain: `keccak256(pid, provider, amt, date, chainId, recipientsHash)`
- Agent signature verified via ECDSA recover + authorized agent check
- Replay protection via `processedPayrolls[stateHash]` mapping
- Pro-rata distribution handles bridge fee deductions fairly

## License

MIT
