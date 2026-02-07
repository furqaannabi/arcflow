import {
  createPublicClient,
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

const POOL_FEE = 500;
const POOL_TICK_SPACING = 10;
const POOL_HOOKS = "0x0000000000000000000000000000000000000000" as Address;

const POOLS_SLOT = pad(toHex(6), { size: 32 }) as Hex;
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
  recipients: PayrollRecipient[];
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

  async getTransactionReceipt(txHash: `0x${string}`) {
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

  async getPos(payrollId: bigint): Promise<LPPosition> {
    const p = await this.client.readContract({
      address: ADDRESSES.router,
      abi: ROUTER_ABI,
      functionName: "getPos",
      args: [payrollId],
    }) as any;
  
    return {
      payrollId: p.payrollId,
      provider: p.provider,
      recipients: p.recipients,
      liquidity: p.liquidity,
      usdcDeposited: p.usdcDeposited,
      depositTime: p.depositTime,
      payrollDate: p.payrollDate,
      accumulatedYield: p.accumulatedYield,
      currentChainId: p.currentChainId,
    };
  }
  

  async getPositions(provider: Address): Promise<LPPosition[]> {
    const payrollIds = await this.client.readContract({
      address: ADDRESSES.router,
      abi: ROUTER_ABI,
      functionName: "getProviderPayrolls",
      args: [provider],
    }) as bigint[];

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
        recipients: p.recipients,
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

  generateApprovalCalldata(amount: bigint) {
    return {
      to: ADDRESSES.usdc,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [ADDRESSES.router, amount],
      }),
    };
  }

  generateDepositCalldata(
    amount: bigint,
    payrollDate: bigint,
    recipients: PayrollRecipient[]
  ) {
    return {
      to: ADDRESSES.router,
      data: encodeFunctionData({
        abi: ROUTER_ABI,
        functionName: "deposit",
        args: [amount, payrollDate, recipients],
      }),
    };
  }

  async getPoolLiquidity(): Promise<bigint> {
    const [currency0, currency1] =
      ADDRESSES.usdc.toLowerCase() < ADDRESSES.usdt.toLowerCase()
        ? [ADDRESSES.usdc, ADDRESSES.usdt]
        : [ADDRESSES.usdt, ADDRESSES.usdc];

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

    const stateSlot = keccak256(
      encodePacked(["bytes32", "bytes32"], [poolId, POOLS_SLOT])
    );

    const liquiditySlot = toHex(
      BigInt(stateSlot) + LIQUIDITY_OFFSET,
      { size: 32 }
    ) as Hex;

    const raw = await this.client.readContract({
      address: ADDRESSES.poolManager,
      abi: EXTSLOAD_ABI,
      functionName: "extsload",
      args: [liquiditySlot],
    });

    return BigInt(raw) & ((1n << 128n) - 1n);
  }

  getAddresses() {
    return ADDRESSES;
  }

  async getActivePayrollIds(): Promise<bigint[]> {
    const ids = await this.client.readContract({
      address: ADDRESSES.router,
      abi: ROUTER_ABI,
      functionName: "getActiveIds",
      args: [],
    });
    return ids as bigint[];
  }

  async getReadyPayrolls(): Promise<bigint[]> {
    const ids = await this.getActivePayrollIds();
    const now = BigInt(Math.floor(Date.now() / 1000));
    const ready: bigint[] = [];

    for (const id of ids) {
      const p = await this.client.readContract({
        address: ADDRESSES.router,
        abi: ROUTER_ABI,
        functionName: "getPos",
        args: [id],
      }) as any;

      if (p.payrollDate <= now) {
        ready.push(id);
      }
    }

    return ready;
  }

  generateCancelCalldata(payrollId: bigint) {
    return {
      to: ADDRESSES.router,
      data: encodeFunctionData({
        abi: ROUTER_ABI,
        functionName: "cancel",
        args: [payrollId],
      }),
    };
  }

  generateExecuteCalldata(payrollId: bigint) {
    return {
      to: ADDRESSES.router,
      data: encodeFunctionData({
        abi: ROUTER_ABI,
        functionName: "execute",
        args: [payrollId],
      }),
    };
  }

  async shouldMigrate(payrollId: bigint) {
    const result = await this.client.readContract({
      address: ADDRESSES.migration,
      abi: MIGRATION_ABI,
      functionName: "shouldMigrate",
      args: [payrollId],
    }) as [boolean, bigint, bigint];

    return {
      migrate: result[0],
      targetChain: result[1],
      apyDiff: result[2],
    };
  }

  generateMigrateOutCalldata(payrollId: bigint, targetChainId: bigint) {
    return {
      to: ADDRESSES.migration,
      data: encodeFunctionData({
        abi: MIGRATION_ABI,
        functionName: "migrateOut",
        args: [payrollId, targetChainId],
      }),
    };
  }

  generateMigrateInCalldata(
    payrollId: bigint,
    fromChainId: bigint,
    amount: bigint,
    attestation: `0x${string}`,
    signature: `0x${string}`
  ) {
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
