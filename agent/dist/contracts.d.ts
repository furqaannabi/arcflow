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
        migration: Address;
        usdc: Address;
        usdt: Address;
    };
    getReadyPayrolls(): Promise<bigint[]>;
    isPayrollReady(payrollId: bigint): Promise<boolean>;
    getActivePayrollIds(): Promise<bigint[]>;
    generateExecuteReadyPayrollsCalldata(): {
        to: Address;
        data: string;
    };
    shouldMigrate(payrollId: bigint): Promise<{
        migrate: boolean;
        targetChain: bigint;
        apyDiff: bigint;
    }>;
    generateMigrateOutCalldata(payrollId: bigint, targetChainId: bigint): {
        to: Address;
        data: string;
    };
    generateMigrateInCalldata(payrollId: bigint, fromChainId: bigint, amount: bigint, attestation: `0x${string}`, signature: `0x${string}`): {
        to: Address;
        data: string;
    };
}
