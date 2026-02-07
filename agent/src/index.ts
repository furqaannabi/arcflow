import express from "express";
import cors from "cors";
import "dotenv/config";
import { chatRouter } from "./routes/chat";
import { PayrollCron } from "./cron";
import { connectDB } from "./db";

const app = express();
const PORT = process.env.PORT || 3001;
const CRON_INTERVAL = parseInt(process.env.CRON_INTERVAL || "60000"); // Default 1 minute

app.use(cors());
app.use(express.json());

// Initialize multi-chain cron
const cron = new PayrollCron(process.env.AGENT_PRIVATE_KEY);

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
