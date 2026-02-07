import { createPublicClient, http, formatUnits, encodeFunctionData, } from "viem";
import { baseSepolia } from "viem/chains";
import addressesJson from "./addresses.json" with { type: "json" };
import abis from "./abis.json" with { type: "json" };
const ADDRESSES = {
    router: addressesJson.baseSepolia.router,
    stateManager: addressesJson.baseSepolia.stateManager,
    migration: addressesJson.baseSepolia.migration,
    usdc: addressesJson.baseSepolia.usdc,
    usdt: addressesJson.baseSepolia.usdt,
};
const ROUTER_ABI = abis.router;
const ERC20_ABI = abis.erc20;
const MIGRATION_ABI = abis.migration;
export class ContractService {
    client;
    constructor(rpcUrl) {
        this.client = createPublicClient({
            chain: baseSepolia,
            transport: http(rpcUrl),
        });
    }
    async getUsdcBalance(address) {
        const balance = await this.client.readContract({
            address: ADDRESSES.usdc,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [address],
        });
        return formatUnits(balance, 6);
    }
    async getAllowance(owner) {
        const allowance = await this.client.readContract({
            address: ADDRESSES.usdc,
            abi: ERC20_ABI,
            functionName: "allowance",
            args: [owner, ADDRESSES.router],
        });
        return formatUnits(allowance, 6);
    }
    async getPositions(provider) {
        // Get payroll IDs for provider
        const payrollIds = await this.client.readContract({
            address: ADDRESSES.router,
            abi: ROUTER_ABI,
            functionName: "getProviderPayrolls",
            args: [provider],
        });
        // Fetch each position
        const positions = [];
        for (const pid of payrollIds) {
            const p = await this.client.readContract({
                address: ADDRESSES.router,
                abi: ROUTER_ABI,
                functionName: "getPos",
                args: [pid],
            });
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
    generateApprovalCalldata(amount) {
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
    generateDepositCalldata(amount, payrollDate, recipients) {
        return {
            to: ADDRESSES.router,
            data: encodeFunctionData({
                abi: ROUTER_ABI,
                functionName: "deposit",
                args: [amount, payrollDate, recipients],
            }),
        };
    }
    getAddresses() {
        return ADDRESSES;
    }
    // Get payroll IDs that are ready to execute
    async getReadyPayrolls() {
        const readyIds = await this.client.readContract({
            address: ADDRESSES.router,
            abi: ROUTER_ABI,
            functionName: "getReadyPayrolls",
            args: [],
        });
        return readyIds;
    }
    // Check if a specific payroll is ready
    async isPayrollReady(payrollId) {
        const ready = await this.client.readContract({
            address: ADDRESSES.router,
            abi: ROUTER_ABI,
            functionName: "isPayrollReady",
            args: [payrollId],
        });
        return ready;
    }
    // Get all active payroll IDs
    async getActivePayrollIds() {
        const ids = await this.client.readContract({
            address: ADDRESSES.router,
            abi: ROUTER_ABI,
            functionName: "getActiveIds",
            args: [],
        });
        return ids;
    }
    // Generate calldata for settling via Yellow channel
    generateSettleCalldata(payrollId, channelId, signature) {
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
    async shouldMigrate(payrollId) {
        const result = await this.client.readContract({
            address: ADDRESSES.migration,
            abi: MIGRATION_ABI,
            functionName: "shouldMigrate",
            args: [payrollId],
        });
        return { migrate: result[0], targetChain: result[1], apyDiff: result[2] };
    }
    // Generate calldata for migrate out
    generateMigrateOutCalldata(payrollId, targetChainId) {
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
    generateMigrateInCalldata(payrollId, fromChainId, amount, attestation, signature) {
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
