# ArcFlow Frontend

React frontend for the ArcFlow cross-chain payroll management platform. Provides a chat-based interface for employers to deposit USDC, manage payroll positions, and interact with the ArcFlow agent.

## Tech Stack

- **React 19** with TypeScript
- **Vite** for build tooling
- **Tailwind CSS v4** for styling
- **Circle Modular Wallets** for wallet authentication
- **viem** for Ethereum interactions
- **react-router-dom** for routing
- **react-markdown** for rendering chat messages
- **recharts** for data visualization
- **lucide-react** for icons

## Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `Landing` | Landing page with product overview |
| `/chat` | `AgentChat` | Main chat interface with the ArcFlow agent |

## Key Components

| Component | Description |
|-----------|-------------|
| `AgentChat` | Full chat page with SSE streaming, tool results, transaction signing |
| `ChatMessage` | Renders individual messages with markdown support |
| `TransactionAction` | Signable transaction button rendered from tool results |
| `CSVUpload` | CSV file upload for employee payroll data |
| `PayrollsPanel` | Side panel showing active payroll positions |
| `Sidebar` | Navigation sidebar |
| `ConnectButton` | Circle wallet connect/disconnect |
| `ChainSwitcher` | Network chain selector |

## Contexts

| Context | Description |
|---------|-------------|
| `AuthContext` | Circle Modular Wallets authentication and wallet state |
| `ThemeContext` | Dark/light theme management |

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Environment

The frontend connects to the ArcFlow agent backend (default: `http://localhost:3001`).

## License

MIT
