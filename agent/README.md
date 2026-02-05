# ArcFlow Agent API

AI-powered payroll distribution agent that helps companies manage DeFi-based payroll.

## Setup

```bash
npm install
cp .env.example .env  # Configure environment variables
npm run dev           # Start with watch mode
```

## Environment Variables

```
PORT=3001
RPC_URL=https://sepolia.base.org
OPENAI_API_KEY=your_key
AGENT_PRIVATE_KEY=your_private_key  # For cron execution
CRON_INTERVAL=60000                  # Polling interval in ms
```

## API Endpoints

### Health Check

```
GET /health
```

Returns service status and last cron execution result.

### Chat

```
POST /api/chat
Content-Type: application/json

{
  "message": "I want to set up a payroll for January 31st",
  "sessionId": "user-123",      // Optional, defaults to "default"
  "userAddress": "0x..."        // Optional, user's wallet address
}
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

### Upload CSV

```
POST /api/upload-csv
Content-Type: application/json

{
  "csvData": "address,amount\n0x123...,1000\n0x456...,2000",
  "sessionId": "user-123"
}
```

**Response:**
```json
{
  "success": true,
  "recipientCount": 2,
  "totalAmountUsdc": "3000.00",
  "recipients": [
    { "wallet": "0x123...", "amountUsdc": "1000.00" },
    { "wallet": "0x456...", "amountUsdc": "2000.00" }
  ]
}
```

### Get Yields

```
GET /api/yields
```

Returns top 10 USDC yield opportunities from DeFi protocols.

### Get Session State

```
GET /api/session/:sessionId
```

Returns current payroll configuration state for a session.

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

## Contracts (Base Sepolia)

- Router: `0x3734E5E2Ac678c513C9Ed47A040a9E7Fd83b64C7`
- State Manager: `0x8B0ED3534D5eaa9D19F48C01b9c401eb2635C164`
- USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- USDT: `0x323e78f944A9a1FcF3a10efcC5319DBb0bB6e673`
