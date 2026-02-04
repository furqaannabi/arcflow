import { type Address } from "viem";
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
export declare class ContractService {
    private client;
    constructor(rpcUrl?: string);
    getUsdcBalance(address: Address): Promise<string>;
    getAllowance(owner: Address): Promise<string>;
    getPositions(provider: Address): Promise<LPPosition[]>;
    generateApprovalCalldata(amount: bigint): {
        to: Address;
        data: string;
    };
    generateDepositCalldata(amount: bigint, payrollDate: bigint, recipients: PayrollRecipient[]): {
        to: Address;
        data: string;
    };
    getAddresses(): {
        router: Address;
        stateManager: Address;
        usdc: Address;
        usdt: Address;
    };
    getReadyPayrolls(): Promise<bigint[]>;
    isPayrollReady(payrollId: bigint): Promise<boolean>;
    generateExecuteReadyPayrollsCalldata(): {
        to: Address;
        data: string;
    };
}
