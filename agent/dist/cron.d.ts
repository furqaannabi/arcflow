import { type Hash } from "viem";
export interface CronResult {
    timestamp: Date;
    readyCount: number;
    executed: boolean;
    txHash?: string;
    error?: string;
}
/**
 * Autonomous Payroll Cron - runs every minute, checks and executes ready payrolls
 */
export declare class PayrollCron {
    private rpcUrl;
    private privateKey;
    private intervalId;
    private results;
    constructor(rpcUrl?: string, privateKey?: string);
    /**
     * Check for ready payrolls
     */
    checkReadyPayrolls(): Promise<bigint[]>;
    /**
     * Execute all ready payrolls
     */
    executeReadyPayrolls(): Promise<Hash>;
    /**
     * Single cron tick - check and execute
     */
    tick(): Promise<CronResult>;
    /**
     * Start the cron (runs every minute by default)
     */
    start(intervalMs?: number): void;
    /**
     * Stop the cron
     */
    stop(): void;
    /**
     * Get recent results
     */
    getResults(): CronResult[];
    /**
     * Get last result
     */
    getLastResult(): CronResult | null;
}
/**
 * Start standalone cron (for running as separate process)
 */
export declare function startStandaloneCron(): PayrollCron;
