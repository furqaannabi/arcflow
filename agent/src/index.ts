import express from "express";
import cors from "cors";
import "dotenv/config";
import { chatRouter } from "./routes/chat";
import { PayrollCron } from "./cron";
import { YellowChunkingService, CHAIN_CONFIGS, type PayrollRecipient } from "./yellow";
import { connectDB } from "./db";

const app = express();
const PORT = process.env.PORT || 3001;
const CRON_INTERVAL = parseInt(process.env.CRON_INTERVAL || "60000"); // Default 1 minute
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;

app.use(cors());
app.use(express.json());

// Log configuration
if (ALCHEMY_API_KEY) {
  console.log(`[CONFIG] Using Alchemy API key: ${ALCHEMY_API_KEY.substring(0, 8)}...`);
} else {
  console.log("[CONFIG] No ALCHEMY_API_KEY found, using public RPCs");
}

// Initialize multi-chain cron
const cron = new PayrollCron(process.env.AGENT_PRIVATE_KEY);

// Initialize Yellow chunking service with Alchemy
const yellowChunking = new YellowChunkingService(
  process.env.AGENT_PRIVATE_KEY,
  ALCHEMY_API_KEY
);

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "arcflow-agent",
    lastCronResult: cron.getLastResult(),
    lastApyResult: cron.getLastApyResult(),
  });
});

// APY endpoints
app.get("/api/apy/latest", (_req, res) => {
  const result = cron.getLastApyResult();
  if (result) {
    res.json(result);
  } else {
    res.json({ message: "No APY data yet" });
  }
});

app.get("/api/apy/history", (_req, res) => {
  res.json(cron.getApyResults());
});

app.post("/api/apy/update", async (_req, res) => {
  try {
    const result = await cron.forceApyUpdate();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get("/api/rebalance/history", (_req, res) => {
  res.json(cron.getRebalanceResults());
});

app.get("/api/rebalance/opportunities", async (_req, res) => {
  try {
    const opportunities = await cron.checkRebalancingOpportunities();
    res.json({
      count: opportunities.length,
      opportunities: opportunities.map(o => ({
        payrollId: o.payrollId.toString(),
        currentChain: o.currentChain,
        targetChain: o.targetChain.toString(),
        apyDiff: Number(o.apyDiff) / 100,
        shouldMigrate: o.shouldMigrate,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Yellow Network multi-chain endpoints
app.get("/api/yellow/chains", (_req, res) => {
  res.json(yellowChunking.getSupportedChains());
});

app.get("/api/yellow/balance/:address", async (req, res) => {
  try {
    const address = req.params.address as `0x${string}`;
    const chainId = req.query.chainId ? parseInt(req.query.chainId as string) : undefined;

    const yellowService = yellowChunking.getYellowService();

    if (chainId) {
      const balance = await yellowService.getWithdrawableBalance(address, chainId);
      res.json(balance);
    } else {
      const multiChainBalance = await yellowService.getMultiChainBalances(address);
      res.json(multiChainBalance);
    }
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/api/yellow/register-batch", (req, res) => {
  try {
    const { payrollId, provider, totalAmount, payrollDate, sourceChainId, targetChainId, bridgeTxHash } = req.body;
    yellowChunking.registerBatchFunds({
      payrollId: BigInt(payrollId),
      provider,
      totalAmount: BigInt(totalAmount),
      payrollDate: BigInt(payrollDate),
      sourceChainId: BigInt(sourceChainId),
      targetChainId: BigInt(targetChainId || sourceChainId),
      bridgeTxHash,
    });
    const targetChainName = CHAIN_CONFIGS[Number(targetChainId || sourceChainId)]?.name || "Unknown";
    res.json({ success: true, message: `Batch registered for payroll ${payrollId} on ${targetChainName}` });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/api/yellow/cache-recipients", (req, res) => {
  try {
    const { payrollId, recipients } = req.body;
    const formattedRecipients: PayrollRecipient[] = recipients.map((r: { wallet: string; amount: string }) => ({
      wallet: r.wallet as `0x${string}`,
      amount: BigInt(r.amount),
    }));
    yellowChunking.cacheRecipients(BigInt(payrollId), formattedRecipients);
    res.json({ success: true, message: `Cached ${recipients.length} recipients for payroll ${payrollId}` });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.post("/api/yellow/chunk-batch", async (req, res) => {
  try {
    const { payrollId, targetChainId } = req.body;
    const chunked = await yellowChunking.chunkBatch(
      BigInt(payrollId),
      targetChainId ? parseInt(targetChainId) : undefined
    );
    if (chunked) {
      const chainName = CHAIN_CONFIGS[chunked.targetChainId]?.name || "Unknown";
      res.json({
        success: true,
        chunked: {
          payrollId: chunked.payrollId.toString(),
          provider: chunked.provider,
          totalAmount: chunked.totalAmount.toString(),
          payrollDate: chunked.payrollDate.toString(),
          targetChainId: chunked.targetChainId,
          targetChainName: chainName,
          recipients: chunked.recipients.map(r => ({
            wallet: r.wallet,
            amount: r.amount.toString(),
          })),
          stateHash: chunked.stateHash,
          stateSignature: chunked.stateSignature,
        },
      });
    } else {
      res.status(400).json({ error: "Failed to chunk batch - missing data" });
    }
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get("/api/yellow/pending-batches", (req, res) => {
  const chainId = req.query.chainId ? parseInt(req.query.chainId as string) : undefined;
  const batches = chainId
    ? yellowChunking.getPendingBatchesForChain(chainId)
    : yellowChunking.getPendingBatches();

  res.json(
    batches.map(b => ({
      payrollId: b.payrollId.toString(),
      provider: b.provider,
      totalAmount: b.totalAmount.toString(),
      payrollDate: b.payrollDate.toString(),
      sourceChainId: b.sourceChainId.toString(),
      targetChainId: b.targetChainId.toString(),
      targetChainName: CHAIN_CONFIGS[Number(b.targetChainId)]?.name || "Unknown",
      bridgeTxHash: b.bridgeTxHash,
    }))
  );
});

app.post("/api/yellow/cross-chain-transfer", (req, res) => {
  try {
    const { fromChainId, toChainId, amount, recipient, payrollId } = req.body;
    const yellowService = yellowChunking.getYellowService();

    const transfer = yellowService.generateCrossChainTransfer({
      fromChainId: parseInt(fromChainId),
      toChainId: parseInt(toChainId),
      amount: BigInt(amount),
      recipient: recipient as `0x${string}`,
      payrollId: payrollId ? BigInt(payrollId) : undefined,
    });

    res.json({
      success: true,
      transfer: {
        fromChain: transfer.fromChain.name,
        toChain: transfer.toChain.name,
        amount: transfer.amount,
        circleDomains: transfer.circleDomains,
      },
    });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Chat endpoint
app.use("/api", chatRouter);

// Connect to MongoDB and start server
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`ArcFlow Agent running on http://localhost:${PORT}`);
      console.log(`Chat endpoint: POST /api/chat`);

      // Start cron automatically
      cron.start(CRON_INTERVAL);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1);
  });
