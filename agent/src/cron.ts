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
  parseUnits,
} from "viem";
import { privateKeyToAccount, signMessage } from "viem/accounts";
import { baseSepolia, sepolia } from "viem/chains";
import { DefiLlamaService } from "./defillama.js";
import addressesJson from "./addresses.json" with { type: "json" };

// Contract addresses from config
const ROUTER_ADDRESS = addressesJson.baseSepolia.router as Address;
const STATE_MANAGER_ADDRESS = addressesJson.baseSepolia.stateManager as Address;
const MIGRATION_ADDRESS = addressesJson.baseSepolia.migration as Address;
const DISTRIBUTOR_ADDRESS = "0x0000000000000000000000000000000000000000" as Address; // Set after deployment on Arc

// Supported chains for APY monitoring
const SUPPORTED_CHAINS = [
  { id: 84532, name: "Base", defiLlamaName: "Base" },
  { id: 11155111, name: "Sepolia", defiLlamaName: "Ethereum" },
] as const;

// Arc Chain config (placeholder - update with actual Arc Chain)
const ARC_CHAIN = {
  id: 5042002,
  name: "Arc Testnet",
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
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
    name: "getActivePayrollIds",
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

const STATE_MANAGER_ABI = [
  {
    name: "batchUpdateChainApy",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "chainIds", type: "uint256[]" },
      { name: "apys", type: "uint256[]" },
    ],
    outputs: [],
  },
  {
    name: "getBestChainForApy",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "bestChainId", type: "uint256" },
      { name: "bestApy", type: "uint256" },
    ],
  },
  {
    name: "getChainApy",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_chainId", type: "uint256" }],
    outputs: [
      { name: "apy", type: "uint256" },
      { name: "lastUpdated", type: "uint256" },
      { name: "isStale", type: "bool" },
    ],
  },
  {
    name: "updateMigrationState",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "payrollId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "fromChainId", type: "uint256" },
      { name: "toChainId", type: "uint256" },
      { name: "status", type: "uint8" },
    ],
    outputs: [],
  },
  {
    name: "isMigrationValid",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "payrollDate", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const MIGRATION_ABI = [
  {
    name: "shouldMigrate",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "payrollId", type: "uint256" }],
    outputs: [
      { name: "migrate", type: "bool" },
      { name: "targetChain", type: "uint256" },
      { name: "apyDiff", type: "uint256" },
    ],
  },
  {
    name: "migrateOut",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "payrollId", type: "uint256" },
      { name: "targetChainId", type: "uint256" },
    ],
    outputs: [{ name: "amount", type: "uint256" }],
  },
  {
    name: "migrateIn",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "payrollId", type: "uint256" },
      { name: "fromChainId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "attestation", type: "bytes" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "newLiquidity", type: "uint128" }],
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

export interface ApyUpdateResult {
  timestamp: Date;
  chainsUpdated: number;
  apyData: { chainId: number; chainName: string; apy: number }[];
  txHash?: string;
  error?: string;
}

export interface RebalanceResult {
  timestamp: Date;
  payrollId: bigint;
  fromChain: number;
  toChain: number;
  amount: bigint;
  apyDiff: number;
  txHash?: string;
  error?: string;
}

/**
 * Autonomous Payroll Cron - runs every minute, checks and executes ready payrolls
 * Also monitors APY across chains every 6 hours and handles rebalancing
 */
export class PayrollCron {
  private rpcUrl: string;
  private privateKey: string | undefined;
  private intervalId: NodeJS.Timeout | null = null;
  private apyIntervalId: NodeJS.Timeout | null = null;
  private results: CronResult[] = [];
  private apyResults: ApyUpdateResult[] = [];
  private rebalanceResults: RebalanceResult[] = [];
  private defiLlamaService: DefiLlamaService;

  // Minimum APY difference to trigger rebalance (0.5% = 50 basis points)
  private readonly MIN_APY_DIFF_FOR_REBALANCE = 0.5;

  constructor(rpcUrl?: string, privateKey?: string) {
    this.rpcUrl = rpcUrl || "https://sepolia.drpc.org";
    this.privateKey = privateKey;
    this.defiLlamaService = new DefiLlamaService();
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
   * Fetch APY rates from DefiLlama and update StateManager
   */
  async updateApyRates(): Promise<ApyUpdateResult> {
    const result: ApyUpdateResult = {
      timestamp: new Date(),
      chainsUpdated: 0,
      apyData: [],
    };

    try {
      console.log("[APY] Fetching APY rates from DefiLlama...");

      const chainNames = SUPPORTED_CHAINS.map((c) => c.defiLlamaName);
      const apyMap = await this.defiLlamaService.getApyForChains(chainNames);

      const chainIds: bigint[] = [];
      const apys: bigint[] = [];

      for (const chain of SUPPORTED_CHAINS) {
        const yieldData = apyMap.get(chain.defiLlamaName);
        if (yieldData) {
          // Convert APY percentage to basis points (e.g., 5.5% -> 550)
          const apyBps = Math.floor(yieldData.apy * 100);
          chainIds.push(BigInt(chain.id));
          apys.push(BigInt(apyBps));

          result.apyData.push({
            chainId: chain.id,
            chainName: chain.name,
            apy: yieldData.apy,
          });

          console.log(`[APY] ${chain.name}: ${yieldData.apy.toFixed(2)}% (${yieldData.project})`);
        }
      }

      if (chainIds.length > 0 && this.privateKey) {
        const account = privateKeyToAccount(this.privateKey as `0x${string}`);
        const walletClient = createWalletClient({
          account,
          chain: baseSepolia,
          transport: http(this.rpcUrl),
        });

        const hash = await walletClient.writeContract({
          address: STATE_MANAGER_ADDRESS,
          abi: STATE_MANAGER_ABI,
          functionName: "batchUpdateChainApy",
          args: [chainIds, apys],
        });

        result.txHash = hash;
        result.chainsUpdated = chainIds.length;
        console.log(`[APY] Updated ${chainIds.length} chains on-chain. TX: ${hash}`);
      } else if (!this.privateKey) {
        console.log("[APY] No private key - skipping on-chain update");
        result.chainsUpdated = chainIds.length;
      }
    } catch (error) {
      result.error = (error as Error).message;
      console.error("[APY] Error updating APY:", result.error);
    }

    this.apyResults.push(result);
    if (this.apyResults.length > 50) {
      this.apyResults.shift();
    }

    return result;
  }

  /**
   * Get best chain for APY from StateManager
   */
  async getBestChainForApy(): Promise<{ chainId: bigint; apy: bigint } | null> {
    try {
      const client = createPublicClient({
        chain: baseSepolia,
        transport: http(this.rpcUrl),
      });

      const [bestChainId, bestApy] = await client.readContract({
        address: STATE_MANAGER_ADDRESS,
        abi: STATE_MANAGER_ABI,
        functionName: "getBestChainForApy",
      });

      return { chainId: bestChainId, apy: bestApy };
    } catch (error) {
      console.error("[APY] Error getting best chain:", error);
      return null;
    }
  }

  /**
   * Check if a payroll can be migrated (not too close to payroll date)
   */
  async canMigratePayroll(payrollDate: bigint): Promise<boolean> {
    try {
      const client = createPublicClient({
        chain: baseSepolia,
        transport: http(this.rpcUrl),
      });

      const canMigrate = await client.readContract({
        address: STATE_MANAGER_ADDRESS,
        abi: STATE_MANAGER_ABI,
        functionName: "isMigrationValid",
        args: [payrollDate],
      });

      return canMigrate as boolean;
    } catch (error) {
      console.error("[REBALANCE] Error checking migration validity:", error);
      return false;
    }
  }

  /**
   * Check if a payroll should migrate using the migration contract
   */
  async shouldMigrate(payrollId: bigint): Promise<{ migrate: boolean; targetChain: bigint; apyDiff: bigint }> {
    const client = createPublicClient({
      chain: baseSepolia,
      transport: http(this.rpcUrl),
    });

    const [migrate, targetChain, apyDiff] = await client.readContract({
      address: MIGRATION_ADDRESS,
      abi: MIGRATION_ABI,
      functionName: "shouldMigrate",
      args: [payrollId],
    });

    return { migrate, targetChain, apyDiff };
  }

  /**
   * Execute migration out to target chain
   */
  async executeMigrateOut(payrollId: bigint, targetChainId: bigint): Promise<Hash> {
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
      address: MIGRATION_ADDRESS,
      abi: MIGRATION_ABI,
      functionName: "migrateOut",
      args: [payrollId, targetChainId],
    });

    return hash;
  }

  /**
   * Check active payrolls for rebalancing opportunities
   */
  async checkRebalancingOpportunities(): Promise<void> {
    console.log("[REBALANCE] Checking for rebalancing opportunities...");

    try {
      const client = createPublicClient({
        chain: baseSepolia,
        transport: http(this.rpcUrl),
      });

      // Get best chain for APY
      const bestChain = await this.getBestChainForApy();
      if (!bestChain || bestChain.chainId === BigInt(0)) {
        console.log("[REBALANCE] No valid APY data available");
        return;
      }

      const bestApyPercent = Number(bestChain.apy) / 100;
      console.log(`[REBALANCE] Best APY: ${bestApyPercent.toFixed(2)}% on chain ${bestChain.chainId}`);

      // Check if migration contract is deployed
      if (MIGRATION_ADDRESS === "0x0000000000000000000000000000000000000000") {
        console.log("[REBALANCE] Migration contract not deployed yet");
        return;
      }

      // Get all active payroll IDs from router
      const activePayrollIds = await client.readContract({
        address: ROUTER_ADDRESS,
        abi: ROUTER_ABI,
        functionName: "getActivePayrollIds",
      }) as bigint[];

      if (activePayrollIds.length === 0) {
        console.log("[REBALANCE] No active payrolls to check");
        return;
      }

      console.log(`[REBALANCE] Checking ${activePayrollIds.length} active payroll(s)...`);

      // For each active payroll, check if it should migrate
      for (const payrollId of activePayrollIds) {
        try {
          const result = await this.shouldMigrate(payrollId);
          if (result.migrate) {
            const apyDiffPercent = Number(result.apyDiff) / 100;
            console.log(`[REBALANCE] Payroll #${payrollId} should migrate to chain ${result.targetChain} (APY diff: +${apyDiffPercent.toFixed(2)}%)`);

            if (this.privateKey) {
              const txHash = await this.executeMigrateOut(payrollId, result.targetChain);
              console.log(`[REBALANCE] Migration initiated! TX: ${txHash}`);

              this.rebalanceResults.push({
                timestamp: new Date(),
                payrollId,
                fromChain: 84532, // Base Sepolia
                toChain: Number(result.targetChain),
                amount: BigInt(0), // Amount is returned in TX receipt
                apyDiff: apyDiffPercent,
                txHash,
              });
            }
          }
        } catch (error) {
          // Position can't migrate or other error, skip
          console.log(`[REBALANCE] Payroll #${payrollId} check failed: ${(error as Error).message}`);
          continue;
        }
      }

      console.log("[REBALANCE] Check complete");

    } catch (error) {
      console.error("[REBALANCE] Error:", error);
    }
  }

  /**
   * APY monitoring tick - runs every 6 hours
   */
  async apyTick(): Promise<ApyUpdateResult> {
    const result = await this.updateApyRates();

    // Check rebalancing opportunities after APY update
    if (result.chainsUpdated > 0) {
      await this.checkRebalancingOpportunities();
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
    console.log(`[CRON] State Manager: ${STATE_MANAGER_ADDRESS}`);
    console.log(`[CRON] Auto-execute: ${this.privateKey ? "enabled" : "disabled (no private key)"}`);

    // Run immediately
    this.tick();

    // Then run on interval
    this.intervalId = setInterval(() => this.tick(), intervalMs);

    // Start APY monitoring (every 6 hours = 21600000ms)
    const APY_INTERVAL = 6 * 60 * 60 * 1000;
    console.log(`[APY] Starting APY monitoring (interval: ${APY_INTERVAL / 1000 / 60} minutes)`);

    // Run APY update immediately
    this.apyTick();

    // Then run on 6-hour interval
    this.apyIntervalId = setInterval(() => this.apyTick(), APY_INTERVAL);
  }

  /**
   * Stop the cron
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[CRON] Payroll cron stopped");
    }
    if (this.apyIntervalId) {
      clearInterval(this.apyIntervalId);
      this.apyIntervalId = null;
      console.log("[CRON] APY monitoring stopped");
    }
  }

  /**
   * Get recent payroll results
   */
  getResults(): CronResult[] {
    return this.results;
  }

  /**
   * Get last payroll result
   */
  getLastResult(): CronResult | null {
    return this.results[this.results.length - 1] || null;
  }

  /**
   * Get recent APY update results
   */
  getApyResults(): ApyUpdateResult[] {
    return this.apyResults;
  }

  /**
   * Get last APY update result
   */
  getLastApyResult(): ApyUpdateResult | null {
    return this.apyResults[this.apyResults.length - 1] || null;
  }

  /**
   * Get rebalance results
   */
  getRebalanceResults(): RebalanceResult[] {
    return this.rebalanceResults;
  }

  /**
   * Force APY update (for testing)
   */
  async forceApyUpdate(): Promise<ApyUpdateResult> {
    return this.apyTick();
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
