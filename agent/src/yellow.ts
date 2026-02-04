import {
  createPublicClient,
  http,
  type Address,
  type PublicClient,
  encodeFunctionData,
  formatUnits,
} from "viem";
import { sepolia } from "viem/chains";

// Yellow Network Custody Contract on Sepolia
const CUSTODY_ADDRESS = "0x019B65A265EB3363822f2752141b3dF16131b262" as Address;

// ABI for Yellow Network Custody Contract
const CUSTODY_ABI = [
  {
    name: "getAccountsBalances",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "users", type: "address[]" },
      { name: "tokens", type: "address[]" },
    ],
    outputs: [{ name: "", type: "uint256[]" }],
  },
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

// USDC on Sepolia
const USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as Address;

export interface WithdrawableBalance {
  address: string;
  token: string;
  balance: string;
  balanceRaw: bigint;
}

export class YellowNetworkService {
  private client: PublicClient;

  constructor(rpcUrl?: string) {
    this.client = createPublicClient({
      chain: sepolia,
      transport: http(rpcUrl),
    });
  }

  /**
   * Get withdrawable USDC balance from Yellow Network Custody Contract
   */
  async getWithdrawableBalance(userAddress: Address): Promise<WithdrawableBalance> {
    const balances = await this.client.readContract({
      address: CUSTODY_ADDRESS,
      abi: CUSTODY_ABI,
      functionName: "getAccountsBalances",
      args: [[userAddress], [USDC_ADDRESS]],
    });

    const balance = balances[0] || BigInt(0);

    return {
      address: userAddress,
      token: "USDC",
      balance: formatUnits(balance, 6),
      balanceRaw: balance,
    };
  }

  /**
   * Generate withdrawal transaction calldata
   */
  generateWithdrawCalldata(
    amount: bigint
  ): {
    to: Address;
    data: string;
    description: string;
  } {
    const data = encodeFunctionData({
      abi: CUSTODY_ABI,
      functionName: "withdraw",
      args: [USDC_ADDRESS, amount],
    });

    return {
      to: CUSTODY_ADDRESS,
      data,
      description: `Withdraw ${formatUnits(amount, 6)} USDC from Yellow Network`,
    };
  }

  /**
   * Get custody contract address
   */
  getCustodyAddress(): Address {
    return CUSTODY_ADDRESS;
  }
}
