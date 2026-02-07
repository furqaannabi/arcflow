import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  encodeFunctionData,
  encodeAbiParameters,
  encodePacked,
  keccak256,
  toHex,
  pad,
  type Address,
  type Hex,
} from "viem";
import { baseSepolia } from "viem/chains";
import addressesJson from "./addresses.json" with { type: "json" };
import abis from "./abis.json" with { type: "json" };

const ADDRESSES = {
  poolManager: addressesJson.baseSepolia.poolManager as Address,
  router: addressesJson.baseSepolia.router as Address,
  stateManager: addressesJson.baseSepolia.stateManager as Address,
  migration: addressesJson.baseSepolia.migration as Address,
  usdc: addressesJson.baseSepolia.usdc as Address,
  usdt: addressesJson.baseSepolia.usdt as Address,
};

// Pool key params (must match deployment: fee=500, tickSpacing=10, no hooks)
const POOL_FEE = 500;
const POOL_TICK_SPACING = 10;
const POOL_HOOKS = "0x0000000000000000000000000000000000000000" as Address;

// Uniswap V4 StateLibrary constants
const POOLS_SLOT = pad(toHex(6), { size: 32 }) as Hex; // mapping slot in PoolManager
const LIQUIDITY_OFFSET = 3n;

const EXTSLOAD_ABI = [
  {
    name: "extsload",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "slot", type: "bytes32" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
] as const;

const ROUTER_ABI = abis.router;
const ERC20_ABI = abis.erc20;
const MIGRATION_ABI = abis.migration;

export interface PayrollRecipient {
  wallet: Address;
  amount: bigint;
}

export interface LPPosition {
  payrollId: bigint;
  provider: Address;
  liquidity: bigint;
  usdcDeposited: bigint;
  depositTime: bigint;
  payrollDate: bigint;
  accumulatedYield: bigint;
  currentChainId: bigint;
}

export class ContractService {
  private client;

  constructor(rpcUrl?: string) {
    this.client = createPublicClient({
      chain: baseSepolia,
      transport: http(rpcUrl),
    });
  }

  async getTransactionReceipt(txHash: `0x${string}`): Promise<{
    status: "success" | "reverted";
    blockNumber: bigint;
    gasUsed: bigint;
    to: Address | null;
  } | null> {
    try {
      const receipt = await this.client.getTransactionReceipt({ hash: txHash });
      return {
        status: receipt.status,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        to: receipt.to as Address | null,
      };
    } catch {
      return null;
    }
  }

  async getUsdcBalance(address: Address): Promise<string> {
    const balance = await this.client.readContract({
      address: ADDRESSES.usdc,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address],
    });
    return formatUnits(balance as bigint, 6);
  }

  async getAllowance(owner: Address): Promise<string> {
    const allowance = await this.client.readContract({
      address: ADDRESSES.usdc,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [owner, ADDRESSES.router],
    });
    return formatUnits(allowance as bigint, 6);
  }

  async getPositions(provider: Address): Promise<LPPosition[]> {
    // Get payroll IDs for provider
    const payrollIds = await this.client.readContract({
      address: ADDRESSES.router,
      abi: ROUTER_ABI,
      functionName: "getProviderPayrolls",
      args: [provider],
    }) as bigint[];

    // Fetch each position
    const positions: LPPosition[] = [];
    for (const pid of payrollIds) {
      const p = await this.client.readContract({
        address: ADDRESSES.router,
        abi: ROUTER_ABI,
        functionName: "getPos",
        args: [pid],
      }) as any;
      positions.push({
        payrollId: p.payrollId,
        provider: p.provider,
        liquidity: p.liquidity,
        usdcDeposited: p.usdcDeposited,
        depositTime: p.depositTime,
        payrollDate: p.payrollDate,
        accumulatedYield: p.accumulatedYield,
        currentChainId: p.currentChainId,
      });
    }
    return positions;
  }

  // Generate calldata for approval transaction
  generateApprovalCalldata(amount: bigint): {
    to: Address;
    data: string;
  } {
    return {
      to: ADDRESSES.usdc,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [ADDRESSES.router, amount],
      }),
    };
  }

  // Generate calldata for deposit transaction
  generateDepositCalldata(
    amount: bigint,
    payrollDate: bigint,
    recipients: PayrollRecipient[]
  ): {
    to: Address;
    data: string;
  } {
    return {
      to: ADDRESSES.router,
      data: encodeFunctionData({
        abi: ROUTER_ABI,
        functionName: "deposit",
        args: [amount, payrollDate, recipients],
      }),
    };
  }

  /**
   * Read pool liquidity directly from PoolManager via extsload,
   * matching Uniswap V4 StateLibrary.getLiquidity(poolId).
   */
  async getPoolLiquidity(): Promise<bigint> {
    // 1. Sort tokens to get currency0/currency1
    const [currency0, currency1] =
      ADDRESSES.usdc.toLowerCase() < ADDRESSES.usdt.toLowerCase()
        ? [ADDRESSES.usdc, ADDRESSES.usdt]
        : [ADDRESSES.usdt, ADDRESSES.usdc];

    // 2. Compute PoolId = keccak256(abi.encode(PoolKey))
    const poolId = keccak256(
      encodeAbiParameters(
        [
          { type: "address" },
          { type: "address" },
          { type: "uint24" },
          { type: "int24" },
          { type: "address" },
        ],
        [currency0, currency1, POOL_FEE, POOL_TICK_SPACING, POOL_HOOKS]
      )
    );

    // 3. Compute pool state slot = keccak256(abi.encodePacked(poolId, POOLS_SLOT))
    const stateSlot = keccak256(encodePacked(["bytes32", "bytes32"], [poolId, POOLS_SLOT]));

    // 4. Liquidity slot = stateSlot + LIQUIDITY_OFFSET
    const liquiditySlot = toHex(BigInt(stateSlot) + LIQUIDITY_OFFSET, { size: 32 }) as Hex;

    // 5. Read via extsload on PoolManager
    const raw = await this.client.readContract({
      address: ADDRESSES.poolManager,
      abi: EXTSLOAD_ABI,
      functionName: "extsload",
      args: [liquiditySlot],
    });

    // 6. Decode as uint128 (lower 128 bits)
    return BigInt(raw) & ((1n << 128n) - 1n);
  }

  getAddresses() {
    return ADDRESSES;
  }

  // Get payroll IDs that are ready to execute
  async getReadyPayrolls(): Promise<bigint[]> {
    const readyIds = await this.client.readContract({
      address: ADDRESSES.router,
      abi: ROUTER_ABI,
      functionName: "getReadyPayrolls",
      args: [],
    });
    return readyIds as bigint[];
  }

  // Check if a specific payroll is ready
  async isPayrollReady(payrollId: bigint): Promise<boolean> {
    const ready = await this.client.readContract({
      address: ADDRESSES.router,
      abi: ROUTER_ABI,
      functionName: "isPayrollReady",
      args: [payrollId],
    });
    return ready as boolean;
  }

  // Get all active payroll IDs
  async getActivePayrollIds(): Promise<bigint[]> {
    const ids = await this.client.readContract({
      address: ADDRESSES.router,
      abi: ROUTER_ABI,
      functionName: "getActiveIds",
      args: [],
    });
    return ids as bigint[];
  }

  // Generate calldata for settling via Yellow channel
  generateSettleCalldata(payrollId: bigint, channelId: `0x${string}`, signature: `0x${string}`): {
    to: Address;
    data: string;
  } {
    return {
      to: ADDRESSES.router,
      data: encodeFunctionData({
        abi: ROUTER_ABI,
        functionName: "settle",
        args: [payrollId, channelId, signature],
      }),
    };
  }

  // Check if a payroll should migrate to a better yield chain
  async shouldMigrate(payrollId: bigint): Promise<{
    migrate: boolean;
    targetChain: bigint;
    apyDiff: bigint;
  }> {
    const result = await this.client.readContract({
      address: ADDRESSES.migration,
      abi: MIGRATION_ABI,
      functionName: "shouldMigrate",
      args: [payrollId],
    }) as [boolean, bigint, bigint];
    return { migrate: result[0], targetChain: result[1], apyDiff: result[2] };
  }

  // Generate calldata for migrate out
  generateMigrateOutCalldata(
    payrollId: bigint,
    targetChainId: bigint
  ): {
    to: Address;
    data: string;
  } {

    return {
      to: ADDRESSES.migration,
      data: encodeFunctionData({
        abi: MIGRATION_ABI,
        functionName: "migrateOut",
        args: [payrollId, targetChainId],
      }),
    };
  }

  // Generate calldata for migrate in
  generateMigrateInCalldata(
    payrollId: bigint,
    fromChainId: bigint,
    amount: bigint,
    attestation: `0x${string}`,
    signature: `0x${string}`
  ): {
    to: Address;
    data: string;
  } {

    return {
      to: ADDRESSES.migration,
      data: encodeFunctionData({
        abi: MIGRATION_ABI,
        functionName: "migrateIn",
        args: [payrollId, fromChainId, amount, attestation, signature],
      }),
    };
  }
}
