import { type Address, type Chain } from "viem";
import { YellowChunkingService } from "./yellow";
interface ChainConfig {
    id: number;
    name: string;
    chain: Chain;
    router: Address;
    stateManager: Address;
    migration: Address;
    defiLlamaName: string;
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
    apyData: {
        chainId: number;
        chainName: string;
        apy: number;
    }[];
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
 * Integrates with Yellow Network SDK for state channel execution
 */
export declare class PayrollCron {
    private privateKey;
    private alchemyApiKey;
    private intervalId;
    private apyIntervalId;
    private results;
    private apyResults;
    private rebalanceResults;
    private defiLlamaService;
    private yellowService;
    private yellowInitialized;
    private readonly MIN_APY_DIFF_FOR_REBALANCE;
    private useYellowChannels;
    constructor(privateKey?: string, alchemyApiKey?: string);
    /**
     * Initialize Yellow Network SDK connection
     * Called once on startup
     */
    initializeYellowSDK(): Promise<void>;
    /**
     * Check if Yellow SDK is ready for channel operations
     */
    isYellowReady(): boolean;
    /**
     * Get Yellow service instance
     */
    getYellowService(): YellowChunkingService;
    /**
     * Get public client for a specific chain
     */
    private getClient;
    /**
     * Get wallet client for a specific chain
     */
    private getWalletClient;
    /**
     * Check for ready payrolls on a specific chain
     */
    checkReadyPayrollsOnChain(chainConfig: ChainConfig): Promise<bigint[]>;
    /**
     * Check for ready payrolls across all chains
     */
    checkReadyPayrolls(): Promise<{
        chainId: number;
        chainName: string;
        readyIds: bigint[];
    }[]>;
    /**
     * Execute payroll via Yellow Network state channel (REQUIRED)
     * Direct execution is disabled - all payrolls must go through Yellow
     */
    executePayrollViaYellow(payrollId: bigint): Promise<{
        channelId: string;
        settled: boolean;
        txHash?: string;
    }>;
    /**
     * Single cron tick - check and execute via Yellow Network ONLY
     */
    tick(): Promise<CronResult>;
    /**
     * Fetch APY rates from DefiLlama and update StateManager on all chains
     */
    updateApyRates(): Promise<ApyUpdateResult>;
    /**
     * Get best chain for APY from StateManager (queries first chain)
     */
    getBestChainForApy(): Promise<{
        chainId: bigint;
        apy: bigint;
    } | null>;
    /**
     * Check if a payroll can be migrated on a specific chain
     */
    canMigratePayroll(chainConfig: ChainConfig, payrollDate: bigint): Promise<boolean>;
    /**
     * Check if a payroll should migrate on a specific chain
     */
    shouldMigrate(chainConfig: ChainConfig, payrollId: bigint): Promise<{
        migrate: boolean;
        targetChain: bigint;
        apyDiff: bigint;
    }>;
    /**
     * Execute migration via Yellow Network state channel (REQUIRED)
     * Direct migration is disabled - all migrations must go through Yellow
     */
    executeMigrateViaYellow(chainConfig: ChainConfig, payrollId: bigint, targetChainId: bigint): Promise<{
        channelId: string;
        txHash?: string;
    }>;
    /**
     * Check active payrolls for rebalancing opportunities across all chains
     * Returns array of opportunities and optionally executes migrations if private key is set
     */
    checkRebalancingOpportunities(): Promise<RebalancingOpportunity[]>;
    /**
     * APY monitoring tick - runs every 6 hours
     */
    apyTick(): Promise<ApyUpdateResult>;
    /**
     * Start the cron (runs every minute by default)
     */
    start(intervalMs?: number): Promise<void>;
    /**
     * Stop the cron
     */
    stop(): void;
    /**
     * Get recent payroll results
     */
    getResults(): CronResult[];
    /**
     * Get last payroll result
     */
    getLastResult(): CronResult | null;
    /**
     * Get recent APY update results
     */
    getApyResults(): ApyUpdateResult[];
    /**
     * Get last APY update result
     */
    getLastApyResult(): ApyUpdateResult | null;
    /**
     * Get rebalance results
     */
    getRebalanceResults(): RebalanceResult[];
    /**
     * Force APY update (for testing)
     */
    forceApyUpdate(): Promise<ApyUpdateResult>;
}
/**
 * Start standalone cron (for running as separate process)
 */
export declare function startStandaloneCron(): Promise<PayrollCron>;
export {};
