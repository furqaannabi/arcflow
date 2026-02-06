# ArcFlow Contracts

Smart contracts for cross-chain payroll fund management with yield optimization and Yellow Network state channel verification.

## Contracts

| Contract | Description |
|----------|-------------|
| `ArcFlowRouter` | Core deposit + Yellow channel settlement for USDC-USDT LP |
| `ArcFlowBase` | Base contract with Uniswap V4 pool operations |
| `ArcFlowStateManager` | APY tracking, migration state, and Nitrolite channel verification |
| `ArcFlowMigration` | Cross-chain migration via Yellow Network channels |
| `ArcPayrollDistributor` | Final payroll distribution with channel verification |

## Yellow Network Integration

All payroll executions and migrations **require** Yellow Network state channel verification. Direct execution methods are disabled.

### Key Functions

| Contract | Function | Description |
|----------|----------|-------------|
| `ArcFlowRouter` | `settle()` | Execute payroll via verified channel state |
| `ArcFlowMigration` | `migrateOutViaChannel()` | Migrate with channel signature |
| `ArcFlowMigration` | `migrateInViaChannel()` | Receive migration with channel verification |
| `ArcPayrollDistributor` | `distributeFromChannel()` | Distribute with channel verification |
| `ArcFlowStateManager` | `verifyChannelState()` | Verify Yellow Network channel signatures |
| `ArcFlowStateManager` | `recordChannelSettlement()` | Record channel settlement on-chain |

## Supported Chains

| Chain | Chain ID | Type |
|-------|----------|------|
| Base Sepolia | 84532 | Source |
| Sepolia | 11155111 | Source |
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

### 3. Deploy

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

### 4. Merge Deployments

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

## Deployment Output

Deployments are saved to:
- `deployments/baseSepolia.json`
- `deployments/sepolia.json`
- `deployments/arcTestnet.json`

## Architecture

```
                          Yellow Network
                    ┌─────────────────────┐
                    │  Nitrolite SDK      │
                    │  - State Channels   │
                    │  - Signatures       │
                    └──────────┬──────────┘
                               │
       ┌───────────────────────┼───────────────────────┐
       │                       │                       │
       ▼                       ▼                       ▼
Source Chains (Base/Sepolia)              Arc Testnet
┌─────────────────────────────┐          ┌──────────────────────────┐
│  ArcFlowRouter              │          │  ArcPayrollDistributor   │
│  - deposit()                │          │  - distributeFromChannel()│
│  - settle()                 │  ─────►  │  - verifyChannelState()  │
│                             │          │                          │
│  ArcFlowMigration           │          │                          │
│  - migrateOutViaChannel()   │          │                          │
│  - migrateInViaChannel()    │          │                          │
│                             │          │                          │
│  ArcFlowStateManager        │          │                          │
│  - verifyChannelState()     │          │                          │
│  - recordChannelSettlement()│          │                          │
│  - track APY                │          │                          │
└─────────────────────────────┘          └──────────────────────────┘
         │                                          │
         │          Circle CCTP Bridge              │
         └──────────────────────────────────────────┘
```

## Execution Flow

1. **Deposit**: User deposits USDC via `deposit()` - creates LP position
2. **Channel Creation**: Agent creates Yellow Network state channel
3. **Settlement**: Agent calls `settle()` with channel signature
4. **Verification**: StateManager verifies channel state via `verifyChannelState()`
5. **Withdrawal**: Liquidity removed, yield calculated
6. **Bridge**: USDC bridged to Arc via Circle Gateway
7. **Distribution**: `distributeFromChannel()` sends to recipients

## Circle Gateway Addresses

| Network | GatewayWallet | GatewayMinter |
|---------|---------------|---------------|
| Testnet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` | `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` |
| Mainnet | `0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE` | `0x2222222d7164433c4C09B0b0D809a9b52C04C205` |

## Yellow Network (Nitrolite) Addresses

| Network | Contract | Address |
|---------|----------|---------|
| Sepolia | Custody | `0x019B65A265EB3363822f2752141b3dF16131b262` |
| Sepolia | Adjudicator | `0x7c7ccbc98469190849BCC6c926307794fDfB11F2` |
| Sepolia | USDC Token | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |

### Nitrolite Interfaces

The contracts include interfaces for Yellow Network's Nitrolite protocol:

```solidity
// src/interfaces/INitrolite.sol
interface IChannel {
    function createChannel(ChannelParams calldata params) external returns (bytes32);
    function closeChannel(bytes32 channelId, ChannelState calldata state) external;
    function challenge(bytes32 channelId, ChannelState calldata state) external;
}

interface IDeposit {
    function deposit(address token, uint256 amount) external;
    function withdraw(address token, uint256 amount, address recipient) external;
    function getBalance(address account, address token) external view returns (uint256);
}

interface IAdjudicator {
    function validateTransition(ChannelState calldata prev, ChannelState calldata next) external view returns (bool);
}
```

## State Manager Channel Functions

The `ArcFlowStateManager` contract tracks Yellow Network channel settlements:

```solidity
struct ChannelSettlement {
    bytes32 channelId;
    uint256 payrollId;
    uint256 totalAmount;
    uint256 settledAt;
    bool distributed;
}

// Verify a channel state signature
function verifyChannelState(
    bytes32 channelId,
    bytes32 stateHash,
    bytes calldata signature
) external view returns (bool);

// Record a channel settlement (called by Router/Migration)
function recordChannelSettlement(
    bytes32 channelId,
    uint256 payrollId,
    uint256 totalAmount
) external;

// Get channel settlement details
function getChannelSettlement(bytes32 channelId) external view returns (ChannelSettlement memory);

// Get channel associated with a payroll
function getPayrollChannel(uint256 payrollId) external view returns (bytes32);
```

## Testing

```bash
forge test
```

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
