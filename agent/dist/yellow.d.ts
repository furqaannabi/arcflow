import { type Address } from "viem";
export interface WithdrawableBalance {
    address: string;
    token: string;
    balance: string;
    balanceRaw: bigint;
}
export declare class YellowNetworkService {
    private client;
    constructor(rpcUrl?: string);
    /**
     * Get withdrawable USDC balance from Yellow Network Custody Contract
     */
    getWithdrawableBalance(userAddress: Address): Promise<WithdrawableBalance>;
    /**
     * Generate withdrawal transaction calldata
     */
    generateWithdrawCalldata(amount: bigint): {
        to: Address;
        data: string;
        description: string;
    };
    /**
     * Get custody contract address
     */
    getCustodyAddress(): Address;
}
