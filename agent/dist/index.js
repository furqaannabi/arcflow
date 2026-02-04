import express from "express";
import cors from "cors";
import { config } from "dotenv";
import { chatRouter } from "./routes/chat.js";
import { PayrollCron } from "./cron.js";
config();
const app = express();
const PORT = process.env.PORT || 3001;
const CRON_INTERVAL = parseInt(process.env.CRON_INTERVAL || "60000"); // Default 1 minute
app.use(cors());
app.use(express.json());
// Initialize cron
const cron = new PayrollCron(process.env.RPC_URL, process.env.AGENT_PRIVATE_KEY);
// Health check
app.get("/health", (_req, res) => {
    res.json({
        status: "ok",
        service: "arcflow-agent",
        lastCronResult: cron.getLastResult(),
    });
});
// Chat endpoint
app.use("/api", chatRouter);
app.listen(PORT, () => {
    console.log(`ArcFlow Agent running on http://localhost:${PORT}`);
    console.log(`Chat endpoint: POST /api/chat`);
    // Start cron automatically
    cron.start(CRON_INTERVAL);
});
