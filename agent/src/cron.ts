import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hash,
  encodeFunctionData,
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
} from "viem";
import { privateKeyToAccount, signMessage } from "viem/accounts";
import { baseSepolia } from "viem/chains";

// Contract addresses
const ROUTER_ADDRESS = "0x3734E5E2Ac678c513C9Ed47A040a9E7Fd83b64C7" as Address;
const DISTRIBUTOR_ADDRESS = "0x0000000000000000000000000000000000000000" as Address; // Set after deployment on Arc

// Arc Chain config (placeholder - update with actual Arc Chain)
const ARC_CHAIN = {
  id: 5042002,
  name: "Arc Testnet",
  rpcUrls: { default: { http: ["https://rpc.arc.dev"] } },
} as const;

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
  {
    name: "getPosition",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "payrollId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "payrollId", type: "uint256" },
          { name: "provider", type: "address" },
          { name: "liquidity", type: "uint128" },
          { name: "usdcDeposited", type: "uint256" },
          { name: "depositTime", type: "uint256" },
          { name: "payrollDate", type: "uint256" },
          { name: "payrollStateHash", type: "bytes32" },
          { name: "accumulatedYield", type: "uint256" },
          { name: "sourceChainId", type: "uint256" },
          { name: "currentChainId", type: "uint256" },
          { name: "migrationCount", type: "uint256" },
          { name: "recipientsHash", type: "bytes32" },
        ],
      },
    ],
  },
] as const;

const DISTRIBUTOR_ABI = [
  {
    name: "mintVerifyAndDistribute",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "attestation", type: "bytes" },
      { name: "signature", type: "bytes" },
      { name: "payrollId", type: "uint256" },
      { name: "provider", type: "address" },
      { name: "totalAmount", type: "uint256" },
      { name: "payrollDate", type: "uint256" },
      { name: "stateSignature", type: "bytes" },
      {
        name: "recipients",
        type: "tuple[]",
        components: [
          { name: "wallet", type: "address" },
          { name: "amount", type: "uint256" },
        ],
      },
    ],
    outputs: [{ name: "batchId", type: "uint256" }],
  },
] as const;

interface PendingDistribution {
  payrollId: bigint;
  provider: Address;
  totalAmount: bigint;
  payrollDate: bigint;
  stateHash: string;
  bridgeTxHash: string;
  recipients: { wallet: Address; amount: bigint }[];
}

export interface CronResult {
  timestamp: Date;
  readyCount: number;
  executed: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Autonomous Payroll Cron - runs every minute, checks and executes ready payrolls
 */
export class PayrollCron {
  private rpcUrl: string;
  private privateKey: string | undefined;
  private intervalId: NodeJS.Timeout | null = null;
  private results: CronResult[] = [];

  constructor(rpcUrl?: string, privateKey?: string) {
    this.rpcUrl = rpcUrl || "https://sepolia.drpc.org";
    this.privateKey = privateKey;
  }

  /**
   * Check for ready payrolls
   */
  async checkReadyPayrolls(): Promise<bigint[]> {
    const client = createPublicClient({
      chain: baseSepolia,
      transport: http(this.rpcUrl),
    });

    const readyIds = await client.readContract({
      address: ROUTER_ADDRESS,
      abi: ROUTER_ABI,
      functionName: "getReadyPayrolls",
    });

    return readyIds as bigint[];
  }

  /**
   * Execute all ready payrolls
   */
  async executeReadyPayrolls(): Promise<Hash> {
    if (!this.privateKey) {
      throw new Error("Private key not configured");
    }

    const account = privateKeyToAccount(this.privateKey as `0x${string}`);

    const walletClient = createWalletClient({
      account,
      chain: baseSepolia,
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
  async tick(): Promise<CronResult> {
    const result: CronResult = {
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
        } else {
          console.log("[CRON] No private key configured - skipping execution");
        }
      }
    } catch (error) {
      result.error = (error as Error).message;
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
  start(intervalMs: number = 60000) {
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
  getResults(): CronResult[] {
    return this.results;
  }

  /**
   * Get last result
   */
  getLastResult(): CronResult | null {
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
