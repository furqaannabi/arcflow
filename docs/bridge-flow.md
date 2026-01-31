# ArcFlow Payroll - Money Flow

## End-to-End Flow

```mermaid
flowchart TD
    subgraph "1. Treasury (Uniswap V4 Pool)"
        LP[LP Position<br/>Principal + Yield]
    end
    
    subgraph "2. AI Agent (Quaestor)"
        A[Market Optimizer] -->|Check gas prices| B{Gas OK?}
        B -->|No| C[Schedule Retry]
        B -->|Yes| D[Treasury Analyst]
        D -->|Pull position| LP
        D -->|Calculate distribution| E[Distribution Calculator]
        E -->|Deduct 5% protocol fee| F[Net Amount]
    end
    
    subgraph "3. Payroll Execution"
        F --> G[PayrollExecutionTool]
        G -->|For each recipient| H{Same chain?}
        H -->|Yes| I[Direct Transfer]
        H -->|No| J[Circle Bridge Kit]
    end
    
    subgraph "4. Circle CCTP"
        J -->|Burn USDC| K[Source Chain]
        K -->|Attestation| L[Circle Network]
        L -->|Mint USDC| M[Destination Chain]
    end
    
    subgraph "5. Recipients"
        I --> N[Employee Wallets]
        M --> N
    end
    
    subgraph "6. Notifications"
        G -->|Success| O[Compliance Officer]
        O -->|Email| P[CEO Notification]
    end
```

## Step-by-Step Money Flow

### Step 1: Check Treasury Position
```
Uniswap V4 Pool
├── Principal: $50,000 USDC
├── Yield (LP Fees): $150 USDC
└── Total: $50,150 USDC
```

### Step 2: Calculate Distribution
```
Yield Earned:        $150.00
Protocol Fee (5%):   -  $7.50
─────────────────────────────
Net Yield:           $142.50
Principal:         $50,000.00
─────────────────────────────
Total to Distribute: $50,142.50
```

### Step 3: Get Payroll Recipients
```
Recipients (from smart contract):
├── Employee 1: $1,000 → Base Sepolia
├── Employee 2: $1,500 → Arbitrum Sepolia  
└── Employee 3: $1,200 → Ethereum Sepolia
─────────────────────────────────────────
Total Required: $3,700
```

### Step 4: Execute Payments

```mermaid
sequenceDiagram
    participant Agent as Quaestor Agent
    participant Treasury as Uniswap V4 Pool
    participant Bridge as Bridge Service
    participant CCTP as Circle CCTP
    participant Emp as Employee Wallets

    Note over Agent: Payroll triggered (scheduled or manual)
    
    Agent->>Treasury: Get LP position (principal + yield)
    Treasury-->>Agent: $50,150 USDC available
    
    Agent->>Agent: Calculate distribution<br/>(deduct 5% protocol fee)
    
    loop For each recipient
        Agent->>Bridge: transfer_cross_chain(amount, recipient, dest_chain)
        Bridge->>CCTP: Burn USDC on source chain
        CCTP-->>CCTP: Cross-chain attestation (~2 min)
        CCTP->>Emp: Mint USDC on destination chain
        Bridge-->>Agent: tx_hash
    end
    
    Agent->>Agent: Send CEO completion email
```

## Architecture Components

| Component | Role | Location |
|-----------|------|----------|
| **Quaestor Agent** | AI orchestrator | `agent/src/quaestor/` |
| **TreasuryPositionTool** | Reads Uniswap V4 LP position | `tools/treasury_tools.py` |
| **DistributionCalculatorTool** | Calculates payouts & fees | `tools/treasury_tools.py` |
| **PayrollExecutionTool** | Loops through recipients, calls bridge | `tools/treasury_tools.py` |
| **CircleGatewayService** | Calls bridge service or mocks | `services/circle_gateway.py` |
| **Bridge Service** | Node.js microservice for Circle Bridge Kit | `bridge-service/` |

## Supported Chains

| Chain | Chain ID | Status |
|-------|----------|--------|
| Arc Testnet | 5042002 | ✅ Source |
| Ethereum Sepolia | 11155111 | ✅ Source/Dest |
| Base Sepolia | 84532 | ✅ Dest |
| Arbitrum Sepolia | 421614 | ✅ Dest |
| Optimism Sepolia | 11155420 | ✅ Dest |

## Fee Structure

```
Source: Uniswap V4 LP Yield Fees
        ↓
Protocol Fee: 5% of yield (collected before distribution)
        ↓
Net Amount: Distributed to employees via CCTP
        ↓
Gas Fees: Paid by treasury wallet (optimized by agent)
```

## Running the System

```bash
# 1. Start Bridge Service
cd agent/bridge-service
bun run dev

# 2. Start Agent API
cd agent
python -m uvicorn quaestor.api.main:app --reload

# 3. Trigger payroll (or wait for scheduler)
curl -X POST http://localhost:8000/trigger-payroll \
  -H "Content-Type: application/json" \
  -d '{"payroll_id": "PAY-2026-001"}'
```
