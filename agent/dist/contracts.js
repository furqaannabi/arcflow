import { createPublicClient, http, formatUnits, } from "viem";
import { sepolia } from "viem/chains";
// Contract addresses on Sepolia (from foundry deployment)
const ADDRESSES = {
    router: "0x466cb61cda7e16f3e66c45762b825808cd689feb",
    stateManager: "0x83c29b0c971b649f60aff89b7878fb6c0c712dfe",
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    usdt: "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06",
};
// ABI fragments for the functions we need
const ROUTER_ABI = [
    {
        name: "deposit",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
            { name: "usdcAmount", type: "uint256" },
            { name: "payrollDate", type: "uint256" },
            {
                name: "recipients",
                type: "tuple[]",
                components: [
                    { name: "wallet", type: "address" },
                    { name: "amount", type: "uint256" },
                ],
            },
        ],
        outputs: [
            { name: "payrollId", type: "uint256" },
            { name: "liquidity", type: "uint128" },
        ],
    },
    {
        name: "getReadyPayrolls",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "uint256[]" }],
    },
    {
        name: "isPayrollReady",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "payrollId", type: "uint256" }],
        outputs: [{ name: "", type: "bool" }],
    },
    {
        name: "executeReadyPayrolls",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [],
        outputs: [
            { name: "executed", type: "uint256" },
            { name: "totalBridged", type: "uint256" },
        ],
    },
    {
        name: "getPosition",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "payrollId", type: "uint256" }],
        outputs: [
            {
                name: "",
                type: "tuple",
                components: [
                    { name: "payrollId", type: "uint256" },
                    { name: "provider", type: "address" },
                    { name: "liquidity", type: "uint128" },
                    { name: "usdcDeposited", type: "uint256" },
                    { name: "depositTime", type: "uint256" },
                    { name: "payrollDate", type: "uint256" },
                    { name: "payrollStateHash", type: "bytes32" },
                    { name: "accumulatedYield", type: "uint256" },
                    { name: "sourceChainId", type: "uint256" },
                    { name: "currentChainId", type: "uint256" },
                    { name: "migrationCount", type: "uint256" },
                    { name: "recipientsHash", type: "bytes32" },
                ],
            },
        ],
    },
    {
        name: "getProviderPositions",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "provider", type: "address" }],
        outputs: [
            {
                name: "",
                type: "tuple[]",
                components: [
                    { name: "payrollId", type: "uint256" },
                    { name: "provider", type: "address" },
                    { name: "liquidity", type: "uint128" },
                    { name: "usdcDeposited", type: "uint256" },
                    { name: "depositTime", type: "uint256" },
                    { name: "payrollDate", type: "uint256" },
                    { name: "payrollStateHash", type: "bytes32" },
                    { name: "accumulatedYield", type: "uint256" },
                    { name: "sourceChainId", type: "uint256" },
                    { name: "currentChainId", type: "uint256" },
                    { name: "migrationCount", type: "uint256" },
                    { name: "recipientsHash", type: "bytes32" },
                ],
            },
        ],
    },
];
const ERC20_ABI = [
    {
        name: "approve",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bool" }],
    },
    {
        name: "allowance",
        type: "function",
        stateMutability: "view",
        inputs: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
        ],
        outputs: [{ name: "", type: "uint256" }],
    },
    {
        name: "balanceOf",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
    },
];
export class ContractService {
    client;
    constructor(rpcUrl) {
        this.client = createPublicClient({
            chain: sepolia,
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
        const positions = await this.client.readContract({
            address: ADDRESSES.router,
            abi: ROUTER_ABI,
            functionName: "getProviderPositions",
            args: [provider],
        });
        return positions.map((p) => ({
            payrollId: p.payrollId,
            provider: p.provider,
            liquidity: p.liquidity,
            usdcDeposited: p.usdcDeposited,
            depositTime: p.depositTime,
            payrollDate: p.payrollDate,
            accumulatedYield: p.accumulatedYield,
            currentChainId: p.currentChainId,
        }));
    }
    // Generate calldata for approval transaction
    generateApprovalCalldata(amount) {
        const { encodeFunctionData } = require("viem");
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
        const { encodeFunctionData } = require("viem");
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
    // Generate calldata for executing ready payrolls
    generateExecuteReadyPayrollsCalldata() {
        const { encodeFunctionData } = require("viem");
        return {
            to: ADDRESSES.router,
            data: encodeFunctionData({
                abi: ROUTER_ABI,
                functionName: "executeReadyPayrolls",
                args: [],
            }),
        };
    }
}
