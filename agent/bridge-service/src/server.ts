import express, { Request, Response } from "express";
import { BridgeKit, BridgeChain } from "@circle-fin/bridge-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Initialize Bridge Kit
const kit = new BridgeKit();

// Chain ID → BridgeChain enum mapping (typed for CCTP cross-chain bridging)
const CHAIN_NAMES: Record<number, BridgeChain> = {
  5042002: BridgeChain.Arc_Testnet,
  84532: BridgeChain.Base_Sepolia,
  11155111: BridgeChain.Ethereum_Sepolia,
  421614: BridgeChain.Arbitrum_Sepolia,
  11155420: BridgeChain.Optimism_Sepolia,
};

interface BridgeRequest {
  amount: string;
  from_chain_id: number;
  to_chain_id: number;
  recipient?: string; // If different from sender
}

interface BridgeResponse {
  success: boolean;
  tx_hash?: string;
  from_chain: string;
  to_chain: string;
  amount: string;
  error?: string;
}

/**
 * POST /bridge
 * Executes a cross-chain USDC transfer via Circle Bridge Kit
 */
app.post("/bridge", async (req: Request<{}, BridgeResponse, BridgeRequest>, res: Response<BridgeResponse>) => {
  const { amount, from_chain_id, to_chain_id, recipient } = req.body;

  // Validate chain support
  const fromChain = CHAIN_NAMES[from_chain_id];
  const toChain = CHAIN_NAMES[to_chain_id];

  if (!fromChain || !toChain) {
    return res.status(400).json({
      success: false,
      from_chain: fromChain || `Unknown(${from_chain_id})`,
      to_chain: toChain || `Unknown(${to_chain_id})`,
      amount,
      error: `Unsupported chain. Supported: ${Object.keys(CHAIN_NAMES).join(", ")}`,
    });
  }

  try {
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("PRIVATE_KEY not configured");
    }

    // Create adapter from private key
    const adapter = createViemAdapterFromPrivateKey({
      privateKey: privateKey as `0x${string}`,
    });

    console.log(`🔄 Bridging ${amount} USDC: ${fromChain} → ${toChain}`);

    // Execute the bridge transfer
    const result = await kit.bridge({
      from: { adapter, chain: fromChain },
      to: { adapter, chain: toChain },
      amount,
      // recipient can be added here if Circle supports it
    });

    console.log(`✅ Bridge complete:`, result);

    // Extract tx hash from the last completed step in the result
    const txHash = result.steps?.find(step => step.txHash)?.txHash;

    res.json({
      success: true,
      tx_hash: txHash,
      from_chain: fromChain,
      to_chain: toChain,
      amount,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Bridge failed:`, errorMessage);

    res.status(500).json({
      success: false,
      from_chain: fromChain,
      to_chain: toChain,
      amount,
      error: errorMessage,
    });
  }
});

/**
 * GET /health
 * Health check endpoint
 */
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "bridge-service" });
});

/**
 * GET /chains
 * Returns supported chains
 */
app.get("/chains", (_req: Request, res: Response) => {
  res.json({
    supported_chains: Object.entries(CHAIN_NAMES).map(([id, name]) => ({
      chain_id: parseInt(id),
      name,
    })),
  });
});

app.listen(PORT, () => {
  console.log(`🌉 Bridge service running on http://localhost:${PORT}`);
  console.log(`   Supported chains: ${Object.values(CHAIN_NAMES).join(", ")}`);
});
