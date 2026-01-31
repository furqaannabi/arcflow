# ArcFlow Payroll - Complete Money Flow

## Architecture Overview

```mermaid
flowchart TD
    subgraph "1. Employer Deposit"
        E[Employer] -->|Deposit USDC| ESC[Employer's Escrow Contract]
        ESC -->|Add Liquidity| LP[Uniswap V4 LP Pool]
    end
    
    subgraph "2. Yield Earning"
        LP -->|LP Fees Accumulate| LP
        ESC -.->|Owns LP Position| LP
    end
    
    subgraph "3. Protocol Agent"
        P[Protocol Wallet] -->|Has Permission| ESC
        AI[Quaestor AI Agent] -->|Controls| P
    end
    
    subgraph "4. Payroll Execution"
        AI -->|Triggers| P
        P -->|executePayroll| ESC
        ESC -->|Withdraw from LP| LP
        ESC -->|Transfer USDC| BRIDGE[Circle Bridge Kit]
    end
    
    subgraph "5. Cross-Chain Distribution"
        BRIDGE -->|Burn on Source| CCTP[Circle CCTP]
        CCTP -->|Mint on Dest| EMP[Employee Wallets]
    end
    
    subgraph "6. Employer Control"
        E -->|Can Withdraw| ESC
    end
```

## Key Components

| Component | Owner | Role |
|-----------|-------|------|
| **Escrow Contract** | Employer (1 per employer) | Holds LP position, enforces permissions |
| **Uniswap V4 LP** | Escrow Contract | Earns yield on deposited USDC |
| **Protocol Wallet** | ArcFlow Protocol | Authorized to call `executePayroll()` |
| **Quaestor Agent** | ArcFlow Protocol | AI that decides when/how to pay |
| **Bridge Service** | ArcFlow Protocol | Node.js service for cross-chain transfers |

---

## Flow 1: Employer Deposit

```mermaid
sequenceDiagram
    participant Employer
    participant Escrow as Employer's Escrow Contract
    participant Pool as Uniswap V4 Pool

    Employer->>Escrow: deposit(amount)
    Note over Escrow: Escrow receives USDC
    Escrow->>Pool: addLiquidity(amount)
    Pool-->>Escrow: LP Position NFT
    Note over Escrow: Escrow owns LP position<br/>Earning yield for employer
```

---

## Flow 2: Payroll Execution

```mermaid
sequenceDiagram
    participant Agent as Quaestor AI
    participant Protocol as Protocol Wallet
    participant Escrow as Employer's Escrow
    participant Pool as Uniswap V4 Pool
    participant Bridge as Bridge Service
    participant CCTP as Circle CCTP
    participant Emp as Employee Wallets

    Note over Agent: Scheduled payroll trigger
    Agent->>Agent: Check gas prices
    Agent->>Agent: Get payroll recipients
    
    Agent->>Protocol: Sign transaction
    Protocol->>Escrow: executePayroll(recipients[])
    
    Escrow->>Pool: removeLiquidity(required_amount)
    Pool-->>Escrow: USDC + yield
    
    Note over Escrow: Deduct 5% protocol fee from yield
    
    loop For each recipient
        Escrow->>Bridge: bridge(amount, recipient, dest_chain)
        Bridge->>CCTP: Burn USDC on source chain
        CCTP-->>CCTP: Cross-chain attestation (~2min)
        CCTP->>Emp: Mint USDC on destination chain
    end
    
    Escrow-->>Protocol: PayrollExecuted event
    Agent->>Agent: Send CEO completion email
```

---

## Flow 3: Employer Withdrawal

```mermaid
sequenceDiagram
    participant Employer
    participant Escrow as Employer's Escrow Contract
    participant Pool as Uniswap V4 Pool

    Employer->>Escrow: withdraw(amount)
    Note over Escrow: Verify msg.sender == employer
    Escrow->>Pool: removeLiquidity(amount)
    Pool-->>Escrow: USDC
    Escrow-->>Employer: Transfer USDC
    Note over Employer: Employer retains full control
```

---

## Smart Contract Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     ESCROW FACTORY                               │
│  - Deploys new escrow per employer                              │
│  - Tracks all escrows                                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ creates
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   PAYROLL ESCROW (per employer)                  │
├─────────────────────────────────────────────────────────────────┤
│  State:                                                          │
│    - employer: address (owner)                                  │
│    - protocol: address (ArcFlow)                                │
│    - lpPositionId: uint256                                      │
│    - payrollConfig: Recipients[], amounts[], chains[]           │
├─────────────────────────────────────────────────────────────────┤
│  Employer Functions:                                             │
│    - deposit(amount) → adds to LP                               │
│    - withdraw(amount) → removes from LP                         │
│    - setPayrollConfig(...) → update recipients                  │
│    - pause() → emergency stop                                   │
├─────────────────────────────────────────────────────────────────┤
│  Protocol Functions:                                             │
│    - executePayroll() → withdraw + bridge to recipients         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ interacts with
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      UNISWAP V4 POOL                            │
│  - Holds USDC liquidity                                         │
│  - Earns LP fees for escrow                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Fee Structure

```
Source: Uniswap V4 LP Yield
        │
        ▼
┌───────────────────────────┐
│   Yield Earned: $150.00   │
│   Protocol Fee (5%): $7.50│
│   ─────────────────────── │
│   Net to Employees: $142.50│
└───────────────────────────┘
        │
        ▼
Principal ($50,000) + Net Yield ($142.50) = Total Distribution
```

---

## Permissions Matrix

| Action | Employer | Protocol | Anyone |
|--------|----------|----------|--------|
| `deposit()` | ✅ | ❌ | ❌ |
| `withdraw()` | ✅ | ❌ | ❌ |
| `setPayrollConfig()` | ✅ | ❌ | ❌ |
| `executePayroll()` | ❌ | ✅ | ❌ |
| `pause()` | ✅ | ❌ | ❌ |
| `getBalance()` | ✅ | ✅ | ✅ |

---

## Supported Chains

| Chain | Chain ID | Role |
|-------|----------|------|
| Arc Testnet | 5042002 | Source (LP Pool) |
| Ethereum Sepolia | 11155111 | Source/Destination |
| Base Sepolia | 84532 | Destination |
| Arbitrum Sepolia | 421614 | Destination |
| Optimism Sepolia | 11155420 | Destination |

---

## Environment Variables

### bridge-service/.env
```bash
PORT=3001
PRIVATE_KEY=0x...  # Protocol wallet private key
```

### agent/.env
```bash
USE_BRIDGE_KIT=true
BRIDGE_SERVICE_URL=http://localhost:3001
```

---

## Running the System

```bash
# 1. Start Bridge Service
cd agent/bridge-service
bun run dev

# 2. Start Agent API
cd agent
python -m uvicorn quaestor.api.main:app --reload

# 3. Trigger payroll
curl -X POST http://localhost:8000/trigger-payroll \
  -H "Content-Type: application/json" \
  -d '{"payroll_id": "PAY-2026-001"}'
```

---

## Security Considerations

| Risk | Mitigation |
|------|------------|
| Protocol key compromise | Use multisig wallet (Gnosis Safe) |
| Large unauthorized withdrawal | Add timelock (24-48hr) for amounts > threshold |
| Smart contract bug | Professional audit before mainnet |
| Employer lockout | Emergency `pause()` function |
| Front-running | Use private mempool (Flashbots) |
