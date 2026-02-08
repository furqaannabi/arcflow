import { randomBytes } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  http,
  maxUint256,
  zeroAddress,
  pad,
  encodePacked,
  keccak256,
  encodeAbiParameters,
  type Address,
  type Chain,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet, baseSepolia, sepolia } from "viem/chains";
import { DefiLlamaService } from "./defillama";
import { getRpcUrl, CHAIN_IDS, GATEWAY_DOMAINS, GATEWAY_WALLET } from "./config";
import addressesJson from "./addresses.json" with { type: "json" };
import abis from "./abis.json" with { type: "json" };
import { ContractService } from "./contracts";
import { Payroll } from "./models/Payroll";

const contractService = new ContractService();

const ROUTER_ABI = abis.router;
const STATE_MANAGER_ABI = abis.stateManager;
const MIGRATION_ABI = abis.migration;
const DISTRIBUTOR_ABI = abis.distributor;
const GATEWAY_WALLET_ABI = abis.gatewayWallet;
const ERC20_ABI = abis.erc20;

// Circle Gateway constants
const GATEWAY_MINTER_ADDRESS = "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B" as Address;
const GATEWAY_API_URL = "https://gateway-api-testnet.circle.com/v1/transfer";
const MAX_FEE = 20_000n; // 0.02 USDC max fee

// EIP-712 types for Gateway burn intent
const EIP712_DOMAIN = { name: "GatewayWallet", version: "1" } as const;

const EIP712Domain = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
] as const;

const TransferSpec = [
  { name: "version", type: "uint32" },
  { name: "sourceDomain", type: "uint32" },
  { name: "destinationDomain", type: "uint32" },
  { name: "sourceContract", type: "bytes32" },
  { name: "destinationContract", type: "bytes32" },
  { name: "sourceToken", type: "bytes32" },
  { name: "destinationToken", type: "bytes32" },
  { name: "sourceDepositor", type: "bytes32" },
  { name: "destinationRecipient", type: "bytes32" },
  { name: "sourceSigner", type: "bytes32" },
  { name: "destinationCaller", type: "bytes32" },
  { name: "value", type: "uint256" },
  { name: "salt", type: "bytes32" },
  { name: "hookData", type: "bytes" },
] as const;

const BurnIntent = [
  { name: "maxBlockHeight", type: "uint256" },
  { name: "maxFee", type: "uint256" },
  { name: "spec", type: "TransferSpec" },
] as const;

// Multi-chain configuration
interface ChainConfig {
  id: number;
  name: string;
  chain: Chain;
  router: Address;
  stateManager: Address;
  migration: Address;
  distributor: Address;
  usdc: Address;
  defiLlamaName: string;
}

const CHAIN_CONFIGS: ChainConfig[] = [
  {
    id: CHAIN_IDS.BASE_SEPOLIA,
    name: "Base Sepolia",
    chain: baseSepolia,
    router: addressesJson.baseSepolia.router as Address,
    stateManager: addressesJson.baseSepolia.stateManager as Address,
    migration: addressesJson.baseSepolia.migration as Address,
    distributor: addressesJson.arcTestnet.distributor as Address,
    usdc: addressesJson.baseSepolia.usdc as Address,
    defiLlamaName: "Base",
  },
  {
    id: CHAIN_IDS.SEPOLIA,
    name: "Sepolia",
    chain: sepolia,
    router: addressesJson.sepolia.router as Address,
    stateManager: addressesJson.sepolia.stateManager as Address,
    migration: addressesJson.sepolia.migration as Address,
    distributor: addressesJson.arcTestnet.distributor as Address,
    usdc: addressesJson.sepolia.usdc as Address,
    defiLlamaName: "Ethereum",
  },
];

// Arc Chain config for distribution
const ARC_CHAIN = {
  id: CHAIN_IDS.ARC_TESTNET,
  name: "Arc Testnet",
  distributor: addressesJson.arcTestnet.distributor as Address,
} as const;

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

export interface RebalancingOpportunity {
  payrollId: bigint;
  currentChain: string;
  targetChain: bigint;
  apyDiff: bigint;
  shouldMigrate: boolean;
}

/**
 * Autonomous Payroll Cron - runs every minute, checks and executes ready payrolls
 * Also monitors APY across chains every 6 hours and handles rebalancing
 * Supports multiple chains (Base Sepolia, Sepolia)
 */
export class PayrollCron {
  private privateKey: string | undefined;
  private intervalId: NodeJS.Timeout | null = null;
  private apyIntervalId: NodeJS.Timeout | null = null;
  private distIntervalId: NodeJS.Timeout | null = null;
  private results: CronResult[] = [];
  private apyResults: ApyUpdateResult[] = [];
  private rebalanceResults: RebalanceResult[] = [];
  private defiLlamaService: DefiLlamaService;

  constructor(privateKey?: string) {
    this.privateKey = privateKey;
    this.defiLlamaService = new DefiLlamaService();
  }

  /**
   * Get public client for a specific chain
   */
  private getClient(chainConfig: ChainConfig, isArc: boolean = false) {
    if (isArc) {
      return createPublicClient({
        chain: arcTestnet,
        transport: http(getRpcUrl(CHAIN_IDS.ARC_TESTNET)),
      });
    }
    return createPublicClient({
      chain: chainConfig.chain,
      transport: http(getRpcUrl(chainConfig.id)),
    });
  }

  /**
   * Get wallet client for a specific chain
   */
  private getWalletClient(chainConfig: ChainConfig) {
    if (!this.privateKey) {
      throw new Error("Private key not configured");
    }
    const account = privateKeyToAccount(this.privateKey as `0x${string}`);
    return createWalletClient({
      account,
      chain: chainConfig.chain,
      transport: http(getRpcUrl(chainConfig.id)),
    });
  }

  /**
   * Get all active IDs then filter off-chain for ready payrolls
   */
  async checkReadyPayrollsOnChain(chainConfig: ChainConfig): Promise<bigint[]> {
    const client = this.getClient(chainConfig);
    const allIds = await client.readContract({
      address: chainConfig.router,
      abi: ROUTER_ABI,
      functionName: "getActiveIds",
    }) as bigint[];

    const now = BigInt(Math.floor(Date.now() / 1000));
    const chainBigInt = BigInt(chainConfig.id);
    const ready: bigint[] = [];

    for (const pid of allIds) {
      const pos = await client.readContract({
        address: chainConfig.router,
        abi: ROUTER_ABI,
        functionName: "getPos",
        args: [pid],
      }) as any;
      if (pos.liquidity > 0n && pos.payrollDate <= now && pos.currentChainId === chainBigInt && !pos.executed) {
        ready.push(pid);
      }
    }
    return ready;
  }

  /**
   * Check for ready payrolls across all chains
   */
  async checkReadyPayrolls(): Promise<{ chainId: number; chainName: string; readyIds: bigint[] }[]> {
    const results: { chainId: number; chainName: string; readyIds: bigint[] }[] = [];

    for (const chainConfig of CHAIN_CONFIGS) {
      try {
        const readyIds = await this.checkReadyPayrollsOnChain(chainConfig);
        results.push({
          chainId: chainConfig.id,
          chainName: chainConfig.name,
          readyIds,
        });
      } catch (error) {
        console.error(`[CRON] Error checking ${chainConfig.name}:`, (error as Error).message);
      }
    }

    return results;
  }

  /**
   * Get wallet client for Arc Testnet
   */
  private getArcWalletClient() {
    if (!this.privateKey) {
      throw new Error("Private key not configured");
    }
    const account = privateKeyToAccount(this.privateKey as `0x${string}`);
    return createWalletClient({
      account,
      chain: arcTestnet,
      transport: http(getRpcUrl(CHAIN_IDS.ARC_TESTNET)),
    });
  }

  /**
   * Execute a ready payroll and distribute to recipients via Circle Gateway
   * Flow: execute() → Gateway depositFor(agent) → sign burn intent → Gateway API → mint on Arc → distribute
   */
  async executePayroll(chainConfig: ChainConfig, payrollId: bigint): Promise<string> {
    const walletClient = this.getWalletClient(chainConfig);
    const client = this.getClient(chainConfig);

    // Execute payroll on-chain (Router removes LP, deposits to Gateway for agent)
    const executeTxHash = await walletClient.writeContract({
      address: chainConfig.router,
      abi: ROUTER_ABI,
      functionName: "execute",
      args: [payrollId],
    });
    console.log(`[EXEC] Execute TX: ${executeTxHash}`);

    await client.waitForTransactionReceipt({ hash: executeTxHash });
    console.log(`[EXEC] Execute confirmed for payroll #${payrollId}`);

    // Update MongoDB status
    await Payroll.updateOne(
      { payrollId: Number(payrollId) },
      { status: "executed" },
    );

    return executeTxHash;
  }

  /**
   * Distribute an executed payroll: Gateway bridge → Arc distributor → markDistributed
   */
  async distributePayroll(chainConfig: ChainConfig, payrollId: bigint): Promise<string> {
    const walletClient = this.getWalletClient(chainConfig);
    const client = this.getClient(chainConfig);
    const account = privateKeyToAccount(this.privateKey as `0x${string}`);

    // 1. Read position data
    const pos = await contractService.getPos(payrollId);
    console.log(`[DIST] Position #${payrollId}: provider=${pos.provider}, amount=${pos.usdcDeposited}`);

    // 2. Look up recipients from MongoDB
    const payrollDoc = await Payroll.findOne({ payrollId: Number(payrollId) });

    // 3. Check Gateway balance for agent
    const sourceDomain = GATEWAY_DOMAINS[chainConfig.id];
    const destDomain = GATEWAY_DOMAINS[CHAIN_IDS.ARC_TESTNET];
    const sourceUsdc = chainConfig.usdc;
    const destUsdc = addressesJson.arcTestnet.usdc as Address;
    const distributorAddr = addressesJson.arcTestnet.distributor as Address;

    // Query Gateway API for real available balance
    const balanceRes = await fetch("https://gateway-api-testnet.circle.com/v1/balances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "USDC",
        sources: [{ depositor: account.address, domain: sourceDomain }],
      }),
    });
    const balanceData = await balanceRes.json() as any;
    const balanceStr = balanceData?.balances?.[0]?.balance ?? "0";
    const gatewayBalance = BigInt(Math.floor(parseFloat(balanceStr) * 1_000_000));
    console.log(`[DIST] Gateway API balance: ${balanceStr} USDC (${gatewayBalance} raw)`);

    if (gatewayBalance <= MAX_FEE) {
      throw new Error(`Gateway balance ${gatewayBalance} too low to cover fee ${MAX_FEE}`);
    }

    const transferValue = gatewayBalance - MAX_FEE;
    console.log(`[DIST] Transfer value: ${transferValue} (balance ${gatewayBalance} - fee ${MAX_FEE})`);

    // 4. Sign EIP-712 burn intent: source chain → Arc
    const burnIntent = {
      maxBlockHeight: maxUint256,
      maxFee: MAX_FEE,
      spec: {
        version: 1,
        sourceDomain,
        destinationDomain: destDomain,
        sourceContract: GATEWAY_WALLET as Address,
        destinationContract: GATEWAY_MINTER_ADDRESS,
        sourceToken: sourceUsdc,
        destinationToken: destUsdc,
        sourceDepositor: account.address,
        destinationRecipient: distributorAddr,
        sourceSigner: account.address,
        destinationCaller: zeroAddress,
        value: transferValue,
        salt: ("0x" + randomBytes(32).toString("hex")) as Hex,
        hookData: "0x" as Hex,
      },
    };

    const typedData = {
      types: { EIP712Domain, TransferSpec, BurnIntent },
      domain: EIP712_DOMAIN,
      primaryType: "BurnIntent" as const,
      message: {
        ...burnIntent,
        spec: {
          ...burnIntent.spec,
          sourceContract: pad(burnIntent.spec.sourceContract.toLowerCase() as `0x${string}`, { size: 32 }),
          destinationContract: pad(burnIntent.spec.destinationContract.toLowerCase() as `0x${string}`, { size: 32 }),
          sourceToken: pad(burnIntent.spec.sourceToken.toLowerCase() as `0x${string}`, { size: 32 }),
          destinationToken: pad(burnIntent.spec.destinationToken.toLowerCase() as `0x${string}`, { size: 32 }),
          sourceDepositor: pad(burnIntent.spec.sourceDepositor.toLowerCase() as `0x${string}`, { size: 32 }),
          destinationRecipient: pad(burnIntent.spec.destinationRecipient.toLowerCase() as `0x${string}`, { size: 32 }),
          sourceSigner: pad(burnIntent.spec.sourceSigner.toLowerCase() as `0x${string}`, { size: 32 }),
          destinationCaller: pad(burnIntent.spec.destinationCaller.toLowerCase() as `0x${string}`, { size: 32 }),
        },
      },
    };

    const burnSignature = await account.signTypedData(typedData as any);
    console.log(`[DIST] Burn intent signed`);

    // 5. Submit to Gateway API (retry for indexing delay)
    console.log(`[DIST] Submitting to Gateway API...`);
    const requests = [{ burnIntent: typedData.message, signature: burnSignature }];
    const body = JSON.stringify(requests, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    );

    let gatewayResponse: any;
    const MAX_RETRIES = 10;
    const RETRY_DELAY = 15_000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(GATEWAY_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (response.ok) {
        gatewayResponse = await response.json();
        console.log(`[DIST] Gateway API response received`);
        break;
      }

      const errText = await response.text();
      if (response.status === 400 && errText.includes("Insufficient balance") && attempt < MAX_RETRIES) {
        console.log(`[DIST] Gateway not indexed yet, retrying in ${RETRY_DELAY / 1000}s (${attempt}/${MAX_RETRIES})...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY));
        continue;
      }

      console.error(`[DIST] Gateway API error: ${response.status} ${errText}`);
      throw new Error(`Gateway API failed: ${response.status}`);
    }

    if (!gatewayResponse) throw new Error("Gateway API failed after max retries");

    const { attestation, signature: gatewaySig } = gatewayResponse;

    // 6. Build recipients + sign state hash
    const recipients = payrollDoc
      ? payrollDoc.recipients.map(r => ({
          wallet: r.wallet as Address,
          amount: BigInt(r.amount),
        }))
      : pos.recipients.map((r: any) => ({
          wallet: r.wallet as Address,
          amount: r.amount as bigint,
        }));

    const recipientsHash = keccak256(
      encodeAbiParameters(
        [{ type: "tuple[]", components: [{ name: "wallet", type: "address" }, { name: "amount", type: "uint256" }] }],
        [recipients],
      ),
    );

    const stateHash = keccak256(
      encodePacked(
        ["uint256", "address", "uint256", "uint256", "uint256", "bytes32"],
        [payrollId, pos.provider as Address, pos.usdcDeposited, pos.payrollDate, 1n, recipientsHash],
      ),
    );

    const stateSignature = await account.signMessage({ message: { raw: stateHash as Hex } });
    console.log(`[DIST] State signature created`);

    // 7. Call distributor on Arc Chain
    console.log(`[DIST] Calling distributor on Arc Chain...`);
    const arcWalletClient = this.getArcWalletClient();
    const arcClient = this.getClient(chainConfig, true);

    const distTxHash = await arcWalletClient.writeContract({
      address: distributorAddr,
      abi: DISTRIBUTOR_ABI,
      functionName: "mintVerifyAndDistribute",
      args: [
        attestation as Hex,
        gatewaySig as Hex,
        payrollId,
        pos.provider as Address,
        pos.usdcDeposited,
        pos.payrollDate,
        stateSignature,
        recipients,
      ],
    });
    console.log(`[DIST] Distribution TX: ${distTxHash}`);

    await arcClient.waitForTransactionReceipt({ hash: distTxHash });
    console.log(`[DIST] Distribution confirmed on Arc Chain!`);

    // 8. Mark distributed on-chain + MongoDB
    const markTxHash = await walletClient.writeContract({
      address: chainConfig.router,
      abi: ROUTER_ABI,
      functionName: "markDistributed",
      args: [payrollId],
    });
    await client.waitForTransactionReceipt({ hash: markTxHash });
    console.log(`[DIST] Marked distributed on-chain: ${markTxHash}`);

    if (payrollDoc) {
      payrollDoc.status = "settled";
      payrollDoc.distributed = true;
      await payrollDoc.save();
    }

    return distTxHash;
  }

  /**
   * Check and distribute pending payrolls on a specific chain
   */
  async checkPendingDistributions(chainConfig: ChainConfig): Promise<bigint[]> {
    const client = this.getClient(chainConfig);
    const allIds = await client.readContract({
      address: chainConfig.router,
      abi: ROUTER_ABI,
      functionName: "getActiveIds",
    }) as bigint[];

    const pending: bigint[] = [];
    for (const pid of allIds) {
      const pos = await client.readContract({
        address: chainConfig.router,
        abi: ROUTER_ABI,
        functionName: "getPos",
        args: [pid],
      }) as any;
      if (pos.executed && !pos.distributed) {
        pending.push(pid);
      }
    }
    return pending;
  }

  /**
   * Distribution cron tick — picks up executed-but-not-distributed payrolls
   */
  async distributionTick(): Promise<void> {
    try {
      for (const chainConfig of CHAIN_CONFIGS) {
        try {
          const pendingIds = await this.checkPendingDistributions(chainConfig);
          if (pendingIds.length === 0) continue;

          console.log(`[DIST-CRON] ${chainConfig.name}: Found ${pendingIds.length} pending distribution(s): ${pendingIds.map(id => id.toString()).join(", ")}`);

          if (!this.privateKey) {
            console.log("[DIST-CRON] No private key - skipping distribution");
            continue;
          }

          for (const payrollId of pendingIds) {
            try {
              console.log(`[DIST-CRON] Distributing payroll #${payrollId} from ${chainConfig.name}...`);
              const txHash = await this.distributePayroll(chainConfig, payrollId);
              console.log(`[DIST-CRON] Payroll #${payrollId} distributed: ${txHash}`);
            } catch (error) {
              console.error(`[DIST-CRON] Failed to distribute payroll #${payrollId}:`, (error as Error).message);
            }
          }
        } catch (error) {
          console.error(`[DIST-CRON] ${chainConfig.name}: Error:`, (error as Error).message);
        }
      }
    } catch (error) {
      console.error("[DIST-CRON] Error:", (error as Error).message);
    }
  }

  /**
   * Single cron tick - check and execute ready payrolls
   */
  async tick(): Promise<CronResult> {
    const result: CronResult = {
      timestamp: new Date(),
      readyCount: 0,
      executed: false,
    };

    try {
      const allChainResults = await this.checkReadyPayrolls();

      for (const chainResult of allChainResults) {
        result.readyCount += chainResult.readyIds.length;

        if (chainResult.readyIds.length > 0) {
          console.log(`[CRON] ${chainResult.chainName}: Found ${chainResult.readyIds.length} ready payroll(s): ${chainResult.readyIds.map(id => id.toString()).join(", ")}`);

          if (this.privateKey) {
            const chainConfig = CHAIN_CONFIGS.find(c => c.id === chainResult.chainId)!;
            for (const payrollId of chainResult.readyIds) {
              try {
                console.log(`[CRON] Executing payroll #${payrollId} on ${chainResult.chainName}...`);
                const txHash = await this.executePayroll(chainConfig, payrollId);
                result.executed = true;
                result.txHash = txHash;
                console.log(`[CRON] Payroll #${payrollId} executed: ${txHash}`);
              } catch (error) {
                console.error(`[CRON] Failed to execute payroll #${payrollId}:`, (error as Error).message);
              }
            }
          } else {
            console.log("[CRON] No private key configured - skipping execution");
          }
        }
      }
    } catch (error) {
      result.error = (error as Error).message;
      console.error("[CRON] Error:", result.error);
    }

    this.results.push(result);
    if (this.results.length > 100) {
      this.results.shift();
    }

    return result;
  }

  /**
   * Fetch APY rates from DefiLlama and update StateManager on all chains
   */
  async updateApyRates(): Promise<ApyUpdateResult> {
    const result: ApyUpdateResult = {
      timestamp: new Date(),
      chainsUpdated: 0,
      apyData: [],
    };

    try {
      console.log("[APY] Fetching APY rates from DefiLlama...");

      const chainNames = CHAIN_CONFIGS.map((c) => c.defiLlamaName);
      const apyMap = await this.defiLlamaService.getApyForChains(chainNames);

      const chainIds: bigint[] = [];
      const apys: bigint[] = [];

      for (const chain of CHAIN_CONFIGS) {
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

      // Update APY on all chains' StateManagers
      if (chainIds.length > 0 && this.privateKey) {
        for (const chainConfig of CHAIN_CONFIGS) {
          try {
            const walletClient = this.getWalletClient(chainConfig);

            const hash = await walletClient.writeContract({
              address: chainConfig.stateManager,
              abi: STATE_MANAGER_ABI,
              functionName: "batchUpdateChainApy",
              args: [chainIds, apys],
            });

            console.log(`[APY] ${chainConfig.name}: Updated ${chainIds.length} chains. TX: ${hash}`);
            result.txHash = hash; // Last TX hash
          } catch (error) {
            console.error(`[APY] ${chainConfig.name}: Error updating APY:`, (error as Error).message);
          }
        }
        result.chainsUpdated = chainIds.length;
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
   * Get best chain for APY from StateManager (queries first chain)
   */
  async getBestChainForApy(): Promise<{ chainId: bigint; apy: bigint } | null> {
    try {
      const chainConfig = CHAIN_CONFIGS[0];
      const client = this.getClient(chainConfig);

      const result = await client.readContract({
        address: chainConfig.stateManager,
        abi: STATE_MANAGER_ABI,
        functionName: "getBestChainForApy",
      }) as [bigint, bigint];

      return { chainId: result[0], apy: result[1] };
    } catch (error) {
      console.error("[APY] Error getting best chain:", error);
      return null;
    }
  }

  /**
   * Check if a payroll can be migrated on a specific chain
   */
  async canMigratePayroll(chainConfig: ChainConfig, payrollDate: bigint): Promise<boolean> {
    try {
      const client = this.getClient(chainConfig);

      const canMigrate = await client.readContract({
        address: chainConfig.stateManager,
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
   * Check if a payroll should migrate on a specific chain
   */
  async shouldMigrate(chainConfig: ChainConfig, payrollId: bigint): Promise<{ migrate: boolean; targetChain: bigint; apyDiff: bigint }> {
    const client = this.getClient(chainConfig);

    const result = await client.readContract({
      address: chainConfig.migration,
      abi: MIGRATION_ABI,
      functionName: "shouldMigrate",
      args: [payrollId],
    }) as [boolean, bigint, bigint];

    return { migrate: result[0], targetChain: result[1], apyDiff: result[2] };
  }

  /**
   * Execute migration directly via the migration contract
   */
  async executeMigration(
    chainConfig: ChainConfig,
    payrollId: bigint,
    targetChainId: bigint
  ): Promise<string> {
    const walletClient = this.getWalletClient(chainConfig);
    const arcClient = this.getClient(chainConfig, true);
    const hash = await walletClient.writeContract({
      address: chainConfig.migration,
      abi: MIGRATION_ABI,
      functionName: "migrateOut",
      args: [payrollId, targetChainId],
    });

    console.log(`[REBALANCE] Migration TX: ${hash}`);
    return hash;
  }

  /**
   * Check active payrolls for rebalancing opportunities across all chains
   * Returns array of opportunities and optionally executes migrations if private key is set
   */
  async checkRebalancingOpportunities(): Promise<RebalancingOpportunity[]> {
    console.log("[REBALANCE] Checking for rebalancing opportunities across all chains...");
    const opportunities: RebalancingOpportunity[] = [];

    try {
      // Get best chain for APY
      const bestChain = await this.getBestChainForApy();
      if (!bestChain || bestChain.chainId === BigInt(0)) {
        console.log("[REBALANCE] No valid APY data available");
        return opportunities;
      }

      const bestApyPercent = Number(bestChain.apy) / 100;
      console.log(`[REBALANCE] Best APY: ${bestApyPercent.toFixed(2)}% on chain ${bestChain.chainId}`);

      // Check each chain for rebalancing opportunities
      for (const chainConfig of CHAIN_CONFIGS) {
        try {
          // Skip if migration contract not deployed
          if (chainConfig.migration === "0x0000000000000000000000000000000000000000") {
            console.log(`[REBALANCE] ${chainConfig.name}: Migration contract not deployed yet`);
            continue;
          }

          const client = this.getClient(chainConfig);

          // Get all active payroll IDs from router
          const activePayrollIds = await client.readContract({
            address: chainConfig.router,
            abi: ROUTER_ABI,
            functionName: "getActiveIds",
          }) as bigint[];

          if (activePayrollIds.length === 0) {
            console.log(`[REBALANCE] ${chainConfig.name}: No active payrolls`);
            continue;
          }

          console.log(`[REBALANCE] ${chainConfig.name}: Checking ${activePayrollIds.length} active payroll(s)...`);

          // For each active payroll, check if it should migrate
          for (const payrollId of activePayrollIds) {
            try {
              const result = await this.shouldMigrate(chainConfig, payrollId);

              // Always add to opportunities list
              opportunities.push({
                payrollId,
                currentChain: chainConfig.name,
                targetChain: result.targetChain,
                apyDiff: result.apyDiff,
                shouldMigrate: result.migrate,
              });

              if (result.migrate) {
                const apyDiffPercent = Number(result.apyDiff) / 100;
                console.log(`[REBALANCE] ${chainConfig.name}: Payroll #${payrollId} should migrate to chain ${result.targetChain} (APY diff: +${apyDiffPercent.toFixed(2)}%)`);

                if (this.privateKey) {
                  try {
                    const txHash = await this.executeMigration(chainConfig, payrollId, result.targetChain);
                    console.log(`[REBALANCE] ${chainConfig.name}: Migration executed: ${txHash}`);

                    this.rebalanceResults.push({
                      timestamp: new Date(),
                      payrollId,
                      fromChain: chainConfig.id,
                      toChain: Number(result.targetChain),
                      amount: BigInt(0),
                      apyDiff: apyDiffPercent,
                      txHash,
                    });
                  } catch (error) {
                    console.error(`[REBALANCE] Migration failed:`, (error as Error).message);
                  }
                } else {
                  console.log("[REBALANCE] No private key - cannot migrate");
                }
              }
            } catch (error) {
              // Position can't migrate or other error, skip
              continue;
            }
          }
        } catch (error) {
          console.error(`[REBALANCE] ${chainConfig.name}: Error:`, (error as Error).message);
        }
      }

      console.log("[REBALANCE] Check complete");

    } catch (error) {
      console.error("[REBALANCE] Error:", error);
    }

    return opportunities;
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
  async start(intervalMs: number = 60000) {
    if (this.intervalId) {
      console.log("[CRON] Already running");
      return;
    }

    console.log(`[CRON] Starting multi-chain payroll cron (interval: ${intervalMs}ms)`);
    console.log(`[CRON] Monitoring ${CHAIN_CONFIGS.length} chains:`);
    for (const chain of CHAIN_CONFIGS) {
      console.log(`[CRON]   - ${chain.name}: Router ${chain.router}`);
    }
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

    // Start distribution cron (every 2 minutes)
    const DIST_INTERVAL = 2 * 60 * 1000;
    console.log(`[DIST-CRON] Starting distribution cron (interval: ${DIST_INTERVAL / 1000}s)`);
    this.distributionTick();
    this.distIntervalId = setInterval(() => this.distributionTick(), DIST_INTERVAL);
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
    if (this.distIntervalId) {
      clearInterval(this.distIntervalId);
      this.distIntervalId = null;
      console.log("[DIST-CRON] Distribution cron stopped");
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
export async function startStandaloneCron() {
  const privateKey = process.env.AGENT_PRIVATE_KEY;
  const interval = parseInt(process.env.CRON_INTERVAL || "60000");

  const cron = new PayrollCron(privateKey);
  await cron.start(interval);

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
