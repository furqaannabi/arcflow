import { createPublicClient, createWalletClient, http, } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
// Contract address
const ROUTER_ADDRESS = "0x466cb61cda7e16f3e66c45762b825808cd689feb";
const ROUTER_ABI = [
    {
        name: "getReadyPayrolls",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "uint256[]" }],
    },
    {
        name: "executeReadyPayrolls",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [],
        outputs: [
            { name: "executed", type: "uint256" },
            { name: "totalBridged", type: "uint256" },
        ],
    },
];
/**
 * Autonomous Payroll Cron - runs every minute, checks and executes ready payrolls
 */
export class PayrollCron {
    rpcUrl;
    privateKey;
    intervalId = null;
    results = [];
    constructor(rpcUrl, privateKey) {
        this.rpcUrl = rpcUrl || "https://sepolia.drpc.org";
        this.privateKey = privateKey;
    }
    /**
     * Check for ready payrolls
     */
    async checkReadyPayrolls() {
        const client = createPublicClient({
            chain: sepolia,
            transport: http(this.rpcUrl),
        });
        const readyIds = await client.readContract({
            address: ROUTER_ADDRESS,
            abi: ROUTER_ABI,
            functionName: "getReadyPayrolls",
        });
        return readyIds;
    }
    /**
     * Execute all ready payrolls
     */
    async executeReadyPayrolls() {
        if (!this.privateKey) {
            throw new Error("Private key not configured");
        }
        const account = privateKeyToAccount(this.privateKey);
        const walletClient = createWalletClient({
            account,
            chain: sepolia,
            transport: http(this.rpcUrl),
        });
        const hash = await walletClient.writeContract({
            address: ROUTER_ADDRESS,
            abi: ROUTER_ABI,
            functionName: "executeReadyPayrolls",
        });
        return hash;
    }
    /**
     * Single cron tick - check and execute
     */
    async tick() {
        const result = {
            timestamp: new Date(),
            readyCount: 0,
            executed: false,
        };
        try {
            const readyIds = await this.checkReadyPayrolls();
            result.readyCount = readyIds.length;
            if (readyIds.length > 0) {
                console.log(`[CRON] Found ${readyIds.length} ready payroll(s): ${readyIds.map(id => id.toString()).join(", ")}`);
                if (this.privateKey) {
                    console.log("[CRON] Executing ready payrolls...");
                    const txHash = await this.executeReadyPayrolls();
                    result.executed = true;
                    result.txHash = txHash;
                    console.log(`[CRON] Executed! TX: ${txHash}`);
                }
                else {
                    console.log("[CRON] No private key configured - skipping execution");
                }
            }
        }
        catch (error) {
            result.error = error.message;
            console.error("[CRON] Error:", result.error);
        }
        this.results.push(result);
        if (this.results.length > 100) {
            this.results.shift(); // Keep last 100 results
        }
        return result;
    }
    /**
     * Start the cron (runs every minute by default)
     */
    start(intervalMs = 60000) {
        if (this.intervalId) {
            console.log("[CRON] Already running");
            return;
        }
        console.log(`[CRON] Starting payroll cron (interval: ${intervalMs}ms)`);
        console.log(`[CRON] Router: ${ROUTER_ADDRESS}`);
        console.log(`[CRON] Auto-execute: ${this.privateKey ? "enabled" : "disabled (no private key)"}`);
        // Run immediately
        this.tick();
        // Then run on interval
        this.intervalId = setInterval(() => this.tick(), intervalMs);
    }
    /**
     * Stop the cron
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log("[CRON] Stopped");
        }
    }
    /**
     * Get recent results
     */
    getResults() {
        return this.results;
    }
    /**
     * Get last result
     */
    getLastResult() {
        return this.results[this.results.length - 1] || null;
    }
}
/**
 * Start standalone cron (for running as separate process)
 */
export function startStandaloneCron() {
    const rpcUrl = process.env.RPC_URL;
    const privateKey = process.env.AGENT_PRIVATE_KEY;
    const interval = parseInt(process.env.CRON_INTERVAL || "60000");
    const cron = new PayrollCron(rpcUrl, privateKey);
    cron.start(interval);
    // Graceful shutdown
    process.on("SIGINT", () => {
        console.log("\n[CRON] Shutting down...");
        cron.stop();
        process.exit(0);
    });
    process.on("SIGTERM", () => {
        cron.stop();
        process.exit(0);
    });
    return cron;
}
// Run if this file is executed directly
const isMainModule = process.argv[1]?.includes("cron");
if (isMainModule) {
    startStandaloneCron();
}
