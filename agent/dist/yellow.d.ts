import { type Address, type PublicClient, type Chain } from "viem";
import { YellowSDKClient } from "./yellowClient";
export interface ChainConfig {
    chainId: number;
    name: string;
    chain: Chain;
    rpcUrl?: string;
    usdc: Address;
    custodyContract: Address;
    gatewayWallet: Address;
    circleDomain: number;
}
export declare const CHAIN_CONFIGS: Record<number, ChainConfig>;
export declare const ARC_DISTRIBUTOR_ADDRESS: Address;
export interface WithdrawableBalance {
    chainId: number;
    chainName: string;
    address: string;
    token: string;
    balance: string;
    balanceRaw: bigint;
}
export interface MultiChainBalance {
    totalBalance: string;
    totalBalanceRaw: bigint;
    balances: WithdrawableBalance[];
}
export interface PayrollRecipient {
    wallet: Address;
    amount: bigint;
}
export interface ChunkedPayroll {
    payrollId: bigint;
    provider: Address;
    totalAmount: bigint;
    payrollDate: bigint;
    recipients: PayrollRecipient[];
    stateHash: string;
    stateSignature?: string;
    targetChainId: number;
}
export interface BatchFundsNotification {
    payrollId: bigint;
    provider: Address;
    totalAmount: bigint;
    payrollDate: bigint;
    sourceChainId: bigint;
    targetChainId: bigint;
    bridgeTxHash: string;
}
export interface CrossChainTransfer {
    fromChainId: number;
    toChainId: number;
    amount: bigint;
    recipient: Address;
    payrollId?: bigint;
}
export declare class YellowNetworkService {
    private clients;
    private rpcUrls;
    constructor(rpcUrls?: Record<number, string>, alchemyApiKey?: string);
    /**
     * Get client for a specific chain
     */
    getClient(chainId: number): PublicClient | undefined;
    /**
     * Get chain config
     */
    getChainConfig(chainId: number): ChainConfig | undefined;
    /**
     * Get all supported chain IDs
     */
    getSupportedChainIds(): number[];
    /**
     * Get withdrawable USDC balance from Yellow Network Custody on a specific chain
     */
    getWithdrawableBalance(userAddress: Address, chainId?: number): Promise<WithdrawableBalance>;
    /**
     * Get balances across all supported chains
     */
    getMultiChainBalances(userAddress: Address): Promise<MultiChainBalance>;
    /**
     * Generate withdrawal transaction calldata for a specific chain
     */
    generateWithdrawCalldata(amount: bigint, chainId?: number): {
        chainId: number;
        to: Address;
        data: string;
        description: string;
    };
    /**
     * Generate cross-chain transfer parameters
     */
    generateCrossChainTransfer(transfer: CrossChainTransfer): {
        fromChain: ChainConfig;
        toChain: ChainConfig;
        amount: string;
        circleDomains: {
            from: number;
            to: number;
        };
    };
    /**
     * Get custody contract address for a chain
     */
    getCustodyAddress(chainId?: number): Address;
    /**
     * Get USDC address for a chain
     */
    getUsdcAddress(chainId?: number): Address;
}
/**
 * Yellow Chunking Service - handles batch fund splitting for Arc distribution
 * Supports multiple chains for fund reception and distribution
 */
export declare class YellowChunkingService {
    private pendingBatches;
    private recipientCache;
    private privateKey?;
    private alchemyApiKey?;
    private yellowService;
    private sdkClient;
    private sdkInitialized;
    constructor(privateKey?: string, alchemyApiKey?: string, rpcUrls?: Record<number, string>);
    /**
     * Initialize the Yellow SDK client and connect to ClearNode
     * Called once on agent startup
     */
    initializeSDK(): Promise<void>;
    /**
     * Check if SDK is ready for operations
     */
    isSDKReady(): boolean;
    /**
     * Get SDK client instance
     */
    getSDKClient(): YellowSDKClient | null;
    /**
     * Execute payroll via Yellow Network state channel
     * Creates channel → Funds → Settles → Records on-chain
     */
    executePayrollViaChannel(payrollId: bigint): Promise<{
        channelId: string;
        settled: boolean;
        txHash?: string;
    }>;
    /**
     * Sign channel state hash for contract verification
     */
    signChannelState(channelId: `0x${string}`, payrollId: bigint, totalAmount: bigint): Promise<string | null>;
    /**
     * Record channel settlement on StateManager contract
     */
    recordChannelSettlementOnChain(channelId: `0x${string}`, payrollId: bigint, totalAmount: bigint): Promise<string | undefined>;
    /**
     * Get current channel info from SDK
     */
    getChannelInfo(): {
        channelId: string | null;
        status: string;
    } | null;
    /**
     * Get Yellow Network service instance
     */
    getYellowService(): YellowNetworkService;
    /**
     * Register incoming batch funds from bridge
     */
    registerBatchFunds(notification: BatchFundsNotification): void;
    /**
     * Store recipient data for a payroll (called when payroll is created)
     * Data stays on origin chain - only stored locally for chunking
     */
    cacheRecipients(payrollId: bigint, recipients: PayrollRecipient[]): void;
    /**
     * Compute recipients hash (matches on-chain computation)
     */
    computeRecipientsHash(recipients: PayrollRecipient[]): string;
    /**
     * Compute payroll state hash for verification
     */
    computePayrollStateHash(payrollId: bigint, provider: Address, amount: bigint, payrollDate: bigint, chainId: bigint, recipientsHash: string): string;
    /**
     * Sign state hash for Arc distributor verification
     */
    signStateHash(stateHash: string): Promise<string | null>;
    /**
     * Chunk batch funds into individual payroll amounts
     */
    chunkBatch(payrollId: bigint, targetChainId?: number): Promise<ChunkedPayroll | null>;
    /**
     * Get pending batches awaiting chunking
     */
    getPendingBatches(): BatchFundsNotification[];
    /**
     * Get pending batches for a specific chain
     */
    getPendingBatchesForChain(chainId: number): BatchFundsNotification[];
    /**
     * Check if recipients are cached for a payroll
     */
    hasRecipientData(payrollId: bigint): boolean;
    /**
     * Generate distribution calldata for Arc distributor on a specific chain
     */
    generateDistributionCalldata(chunked: ChunkedPayroll, circleAttestation: string, circleSignature: string, distributorAddress?: Address): {
        chainId: number;
        to: Address;
        data: string;
        description: string;
    };
    /**
     * Get supported chains
     */
    getSupportedChains(): ChainConfig[];
}
