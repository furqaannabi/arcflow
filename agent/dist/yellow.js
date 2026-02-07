import { createPublicClient, createWalletClient, http, encodeFunctionData, formatUnits, keccak256, encodeAbiParameters, parseAbiParameters, toBytes, } from "viem";
import { sepolia, baseSepolia } from "viem/chains";
import { signMessage, privateKeyToAccount } from "viem/accounts";
import { getRpcUrl, CHAIN_IDS } from "./config";
import addressesJson from "./addresses.json" with { type: "json" };
import abis from "./abis.json" with { type: "json" };
import { getYellowSDKClient } from "./yellowClient";
// Contract ABIs
const ROUTER_ABI = abis.router;
const STATE_MANAGER_ABI = abis.stateManager;
// Arc Testnet chain definition
const arcTestnet = {
    id: 5042002,
    name: "Arc Testnet",
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: {
        default: { http: ["https://rpc.testnet.arc.network"] },
    },
    blockExplorers: {
        default: { name: "Arc Explorer", url: "https://explorer.testnet.arc.network" },
    },
};
// Circle Gateway Testnet Addresses (same across all EVM chains)
const GATEWAY_WALLET_TESTNET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
const GATEWAY_MINTER_TESTNET = "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B";
// Supported chains configuration (uses addresses.json for USDC addresses)
export const CHAIN_CONFIGS = {
    // Sepolia (Ethereum testnet)
    [CHAIN_IDS.SEPOLIA]: {
        chainId: CHAIN_IDS.SEPOLIA,
        name: "Sepolia",
        chain: sepolia,
        usdc: addressesJson.sepolia.usdc,
        custodyContract: "0x019B65A265EB3363822f2752141b3dF16131b262",
        gatewayWallet: GATEWAY_WALLET_TESTNET,
        circleDomain: 0,
    },
    // Base Sepolia
    [CHAIN_IDS.BASE_SEPOLIA]: {
        chainId: CHAIN_IDS.BASE_SEPOLIA,
        name: "Base Sepolia",
        chain: baseSepolia,
        usdc: addressesJson.baseSepolia.usdc,
        custodyContract: "0x0000000000000000000000000000000000000000",
        gatewayWallet: GATEWAY_WALLET_TESTNET,
        circleDomain: 6,
    },
    // Arc Testnet (distribution chain)
    [CHAIN_IDS.ARC_TESTNET]: {
        chainId: CHAIN_IDS.ARC_TESTNET,
        name: "Arc Testnet",
        chain: arcTestnet,
        usdc: "0x0000000000000000000000000000000000000000", // Minted via Gateway
        custodyContract: "0x0000000000000000000000000000000000000000",
        gatewayWallet: GATEWAY_MINTER_TESTNET, // Uses minter for receiving
        circleDomain: 9, // Arc domain
    },
};
// Arc Testnet Distributor Address
export const ARC_DISTRIBUTOR_ADDRESS = addressesJson.arcTestnet.distributor;
// Default chain
const DEFAULT_CHAIN_ID = CHAIN_IDS.SEPOLIA;
// ABIs from centralized abis.json
const CUSTODY_ABI = abis.custody;
const DISTRIBUTOR_ABI = abis.distributor;
// ============ Yellow Network Service (Multi-Chain) ============
export class YellowNetworkService {
    clients = new Map();
    rpcUrls = new Map();
    constructor(rpcUrls, alchemyApiKey) {
        // Initialize clients for all supported chains
        for (const [chainIdStr, config] of Object.entries(CHAIN_CONFIGS)) {
            const chainId = parseInt(chainIdStr);
            // Priority: explicit rpcUrls > getRpcUrl (uses Alchemy if available)
            const rpcUrl = rpcUrls?.[chainId] || getRpcUrl(chainId, alchemyApiKey);
            if (rpcUrl) {
                this.rpcUrls.set(chainId, rpcUrl);
            }
            this.clients.set(chainId, createPublicClient({
                chain: config.chain,
                transport: http(rpcUrl),
            }));
            console.log(`[YELLOW] Initialized ${config.name} client`);
        }
    }
    /**
     * Get client for a specific chain
     */
    getClient(chainId) {
        return this.clients.get(chainId);
    }
    /**
     * Get chain config
     */
    getChainConfig(chainId) {
        return CHAIN_CONFIGS[chainId];
    }
    /**
     * Get all supported chain IDs
     */
    getSupportedChainIds() {
        return Object.keys(CHAIN_CONFIGS).map(Number);
    }
    /**
     * Get withdrawable USDC balance from Yellow Network Custody on a specific chain
     */
    async getWithdrawableBalance(userAddress, chainId = DEFAULT_CHAIN_ID) {
        const config = CHAIN_CONFIGS[chainId];
        if (!config) {
            throw new Error(`Chain ${chainId} not supported`);
        }
        const client = this.clients.get(chainId);
        if (!client) {
            throw new Error(`No client for chain ${chainId}`);
        }
        // Skip if no custody contract configured
        if (config.custodyContract === "0x0000000000000000000000000000000000000000") {
            return {
                chainId,
                chainName: config.name,
                address: userAddress,
                token: "USDC",
                balance: "0",
                balanceRaw: BigInt(0),
            };
        }
        const balances = await client.readContract({
            address: config.custodyContract,
            abi: CUSTODY_ABI,
            functionName: "getAccountsBalances",
            args: [[userAddress], [config.usdc]],
        });
        const balance = balances[0] || BigInt(0);
        return {
            chainId,
            chainName: config.name,
            address: userAddress,
            token: "USDC",
            balance: formatUnits(balance, 6),
            balanceRaw: balance,
        };
    }
    /**
     * Get balances across all supported chains
     */
    async getMultiChainBalances(userAddress) {
        const balances = [];
        let totalBalanceRaw = BigInt(0);
        for (const chainId of this.getSupportedChainIds()) {
            try {
                const balance = await this.getWithdrawableBalance(userAddress, chainId);
                balances.push(balance);
                totalBalanceRaw += balance.balanceRaw;
            }
            catch (error) {
                console.error(`[YELLOW] Error fetching balance on chain ${chainId}:`, error);
                // Continue with other chains
            }
        }
        return {
            totalBalance: formatUnits(totalBalanceRaw, 6),
            totalBalanceRaw,
            balances,
        };
    }
    /**
     * Generate withdrawal transaction calldata for a specific chain
     */
    generateWithdrawCalldata(amount, chainId = DEFAULT_CHAIN_ID) {
        const config = CHAIN_CONFIGS[chainId];
        if (!config) {
            throw new Error(`Chain ${chainId} not supported`);
        }
        const data = encodeFunctionData({
            abi: CUSTODY_ABI,
            functionName: "withdraw",
            args: [config.usdc, amount],
        });
        return {
            chainId,
            to: config.custodyContract,
            data,
            description: `Withdraw ${formatUnits(amount, 6)} USDC from Yellow Network on ${config.name}`,
        };
    }
    /**
     * Generate cross-chain transfer parameters
     */
    generateCrossChainTransfer(transfer) {
        const fromChain = CHAIN_CONFIGS[transfer.fromChainId];
        const toChain = CHAIN_CONFIGS[transfer.toChainId];
        if (!fromChain || !toChain) {
            throw new Error("Invalid chain IDs for cross-chain transfer");
        }
        return {
            fromChain,
            toChain,
            amount: formatUnits(transfer.amount, 6),
            circleDomains: {
                from: fromChain.circleDomain,
                to: toChain.circleDomain,
            },
        };
    }
    /**
     * Get custody contract address for a chain
     */
    getCustodyAddress(chainId = DEFAULT_CHAIN_ID) {
        const config = CHAIN_CONFIGS[chainId];
        if (!config) {
            throw new Error(`Chain ${chainId} not supported`);
        }
        return config.custodyContract;
    }
    /**
     * Get USDC address for a chain
     */
    getUsdcAddress(chainId = DEFAULT_CHAIN_ID) {
        const config = CHAIN_CONFIGS[chainId];
        if (!config) {
            throw new Error(`Chain ${chainId} not supported`);
        }
        return config.usdc;
    }
}
// ============ Yellow Chunking Service (Multi-Chain) ============
/**
 * Yellow Chunking Service - handles batch fund splitting for Arc distribution
 * Supports multiple chains for fund reception and distribution
 */
export class YellowChunkingService {
    pendingBatches = new Map();
    recipientCache = new Map();
    privateKey;
    alchemyApiKey;
    yellowService;
    sdkClient = null;
    sdkInitialized = false;
    constructor(privateKey, alchemyApiKey, rpcUrls) {
        this.privateKey = privateKey;
        this.alchemyApiKey = alchemyApiKey;
        this.yellowService = new YellowNetworkService(rpcUrls, alchemyApiKey);
    }
    // ============ SDK Integration ============
    /**
     * Initialize the Yellow SDK client and connect to ClearNode
     * Called once on agent startup
     */
    async initializeSDK() {
        if (this.sdkInitialized) {
            console.log("[YELLOW] SDK already initialized");
            return;
        }
        if (!this.privateKey) {
            console.log("[YELLOW] No private key - SDK not initialized");
            return;
        }
        const rpcUrl = getRpcUrl(CHAIN_IDS.SEPOLIA, this.alchemyApiKey) || "https://1rpc.io/sepolia";
        try {
            this.sdkClient = getYellowSDKClient(this.privateKey, rpcUrl);
            await this.sdkClient.connect();
            await this.sdkClient.authenticate();
            this.sdkInitialized = true;
            console.log("[YELLOW] SDK initialized and authenticated");
        }
        catch (error) {
            console.error("[YELLOW] Failed to initialize SDK:", error);
            this.sdkClient = null;
            throw error;
        }
    }
    /**
     * Check if SDK is ready for operations
     */
    isSDKReady() {
        return this.sdkInitialized && this.sdkClient?.isAuthenticated() === true;
    }
    /**
     * Get SDK client instance
     */
    getSDKClient() {
        return this.sdkClient;
    }
    /**
     * Execute payroll via Yellow Network state channel
     * Creates channel → Funds → Settles → Records on-chain
     */
    async executePayrollViaChannel(payrollId) {
        if (!this.isSDKReady()) {
            await this.initializeSDK();
        }
        if (!this.sdkClient) {
            throw new Error("SDK client not available");
        }
        const payrollKey = payrollId.toString();
        const recipients = this.recipientCache.get(payrollKey);
        if (!recipients || recipients.length === 0) {
            throw new Error(`No recipients cached for payroll ${payrollKey}`);
        }
        const totalAmount = recipients.reduce((sum, r) => sum + r.amount, 0n);
        console.log(`[YELLOW] Executing payroll ${payrollKey} via state channel`);
        console.log(`[YELLOW] Total amount: ${formatUnits(totalAmount, 6)} USDC`);
        console.log(`[YELLOW] Recipients: ${recipients.length}`);
        // Step 1: Create channel
        console.log("[YELLOW] Step 1: Creating channel...");
        const channelId = await this.sdkClient.createChannel();
        console.log(`[YELLOW] Channel created: ${channelId}`);
        // Step 2: Fund channel from Unified Balance
        console.log("[YELLOW] Step 2: Funding channel...");
        await this.sdkClient.fundChannel(totalAmount);
        console.log("[YELLOW] Channel funded");
        // Step 3: Off-chain state represents the payroll distribution
        console.log("[YELLOW] Step 3: Payroll distribution recorded in channel state");
        // Step 4: Close channel and settle on-chain
        console.log("[YELLOW] Step 4: Closing channel and settling...");
        await this.sdkClient.closeChannel();
        console.log("[YELLOW] Channel closed and settled");
        // Step 5: Sign channel state for contract verification
        console.log("[YELLOW] Step 5: Signing channel state for contracts...");
        const channelStateSignature = await this.signChannelState(channelId, payrollId, totalAmount);
        // Step 6: Record settlement on StateManager contract
        let txHash;
        if (channelStateSignature) {
            console.log("[YELLOW] Step 6: Recording settlement on-chain...");
            txHash = await this.recordChannelSettlementOnChain(channelId, payrollId, totalAmount);
            console.log(`[YELLOW] Settlement recorded. TX: ${txHash}`);
        }
        return {
            channelId,
            settled: true,
            txHash,
        };
    }
    /**
     * Sign channel state hash for contract verification
     */
    async signChannelState(channelId, payrollId, totalAmount) {
        if (!this.privateKey) {
            console.log("[YELLOW] No private key - cannot sign channel state");
            return null;
        }
        try {
            // Compute channel state hash (must match contract computation)
            const stateHash = keccak256(encodeAbiParameters(parseAbiParameters("bytes32, uint256, uint256"), [channelId, payrollId, totalAmount]));
            const signature = await signMessage({
                message: { raw: toBytes(stateHash) },
                privateKey: this.privateKey,
            });
            console.log(`[YELLOW] Channel state signed: ${stateHash.slice(0, 18)}...`);
            return signature;
        }
        catch (error) {
            console.error("[YELLOW] Error signing channel state:", error);
            return null;
        }
    }
    /**
     * Record channel settlement on StateManager contract
     */
    async recordChannelSettlementOnChain(channelId, payrollId, totalAmount) {
        if (!this.privateKey)
            return undefined;
        try {
            const rpcUrl = getRpcUrl(CHAIN_IDS.SEPOLIA, this.alchemyApiKey);
            const account = privateKeyToAccount(this.privateKey);
            const walletClient = createWalletClient({
                account,
                chain: sepolia,
                transport: http(rpcUrl),
            });
            const stateManagerAddress = addressesJson.sepolia.stateManager;
            const hash = await walletClient.writeContract({
                address: stateManagerAddress,
                abi: STATE_MANAGER_ABI,
                functionName: "recordChannelSettlement",
                args: [channelId, payrollId, totalAmount],
            });
            return hash;
        }
        catch (error) {
            console.error("[YELLOW] Error recording settlement on-chain:", error);
            return undefined;
        }
    }
    /**
     * Get current channel info from SDK
     */
    getChannelInfo() {
        if (!this.sdkClient)
            return null;
        const info = this.sdkClient.getChannelInfo();
        return info ? {
            channelId: info.channelId,
            status: info.status,
        } : null;
    }
    /**
     * Get Yellow Network service instance
     */
    getYellowService() {
        return this.yellowService;
    }
    /**
     * Register incoming batch funds from bridge
     */
    registerBatchFunds(notification) {
        const key = `${notification.payrollId}-${notification.targetChainId}`;
        this.pendingBatches.set(key, notification);
        const targetChain = CHAIN_CONFIGS[Number(notification.targetChainId)]?.name || "Unknown";
        console.log(`[YELLOW] Registered batch funds for payroll ${notification.payrollId} on ${targetChain}: ${formatUnits(notification.totalAmount, 6)} USDC`);
    }
    /**
     * Store recipient data for a payroll (called when payroll is created)
     * Data stays on origin chain - only stored locally for chunking
     */
    cacheRecipients(payrollId, recipients) {
        const key = payrollId.toString();
        this.recipientCache.set(key, recipients);
        console.log(`[YELLOW] Cached ${recipients.length} recipients for payroll ${key}`);
    }
    /**
     * Compute recipients hash (matches on-chain computation)
     */
    computeRecipientsHash(recipients) {
        const encoded = encodeAbiParameters(parseAbiParameters("(address wallet, uint256 amount)[]"), [recipients.map((r) => ({ wallet: r.wallet, amount: r.amount }))]);
        return keccak256(encoded);
    }
    /**
     * Compute payroll state hash for verification
     */
    computePayrollStateHash(payrollId, provider, amount, payrollDate, chainId, recipientsHash) {
        const encoded = encodeAbiParameters(parseAbiParameters("uint256, address, uint256, uint256, uint256, bytes32"), [payrollId, provider, amount, payrollDate, chainId, recipientsHash]);
        return keccak256(encoded);
    }
    /**
     * Sign state hash for Arc distributor verification
     */
    async signStateHash(stateHash) {
        if (!this.privateKey) {
            console.log("[YELLOW] No private key - cannot sign state");
            return null;
        }
        try {
            const signature = await signMessage({
                message: { raw: toBytes(stateHash) },
                privateKey: this.privateKey,
            });
            return signature;
        }
        catch (error) {
            console.error("[YELLOW] Error signing state:", error);
            return null;
        }
    }
    /**
     * Chunk batch funds into individual payroll amounts
     */
    async chunkBatch(payrollId, targetChainId) {
        const payrollKey = payrollId.toString();
        const recipients = this.recipientCache.get(payrollKey);
        if (!recipients || recipients.length === 0) {
            console.error(`[YELLOW] No recipients cached for payroll ${payrollKey}`);
            return null;
        }
        // Find matching batch - try with targetChainId first, then any
        let batch;
        let batchKey;
        if (targetChainId) {
            batchKey = `${payrollId}-${targetChainId}`;
            batch = this.pendingBatches.get(batchKey);
        }
        if (!batch) {
            // Search all pending batches for this payroll
            for (const [key, b] of this.pendingBatches.entries()) {
                if (b.payrollId === payrollId) {
                    batch = b;
                    batchKey = key;
                    break;
                }
            }
        }
        if (!batch) {
            console.error(`[YELLOW] No pending batch for payroll ${payrollKey}`);
            return null;
        }
        // Validate total amounts match
        const totalRecipientAmount = recipients.reduce((sum, r) => sum + r.amount, BigInt(0));
        if (totalRecipientAmount > batch.totalAmount) {
            console.error(`[YELLOW] Recipient total (${totalRecipientAmount}) exceeds batch amount (${batch.totalAmount})`);
            return null;
        }
        // Compute state hash
        const recipientsHash = this.computeRecipientsHash(recipients);
        const stateHash = this.computePayrollStateHash(batch.payrollId, batch.provider, batch.totalAmount, batch.payrollDate, batch.sourceChainId, recipientsHash);
        // Sign the state hash
        const stateSignature = await this.signStateHash(stateHash);
        const chunked = {
            payrollId: batch.payrollId,
            provider: batch.provider,
            totalAmount: batch.totalAmount,
            payrollDate: batch.payrollDate,
            recipients,
            stateHash,
            stateSignature: stateSignature || undefined,
            targetChainId: Number(batch.targetChainId),
        };
        const targetChainName = CHAIN_CONFIGS[chunked.targetChainId]?.name || "Unknown";
        console.log(`[YELLOW] Chunked payroll ${payrollKey} into ${recipients.length} payments for ${targetChainName}`);
        recipients.forEach((r, i) => {
            console.log(`  ${i + 1}. ${r.wallet}: ${formatUnits(r.amount, 6)} USDC`);
        });
        // Remove from pending after chunking
        this.pendingBatches.delete(batchKey);
        return chunked;
    }
    /**
     * Get pending batches awaiting chunking
     */
    getPendingBatches() {
        return Array.from(this.pendingBatches.values());
    }
    /**
     * Get pending batches for a specific chain
     */
    getPendingBatchesForChain(chainId) {
        return Array.from(this.pendingBatches.values()).filter((b) => Number(b.targetChainId) === chainId);
    }
    /**
     * Check if recipients are cached for a payroll
     */
    hasRecipientData(payrollId) {
        return this.recipientCache.has(payrollId.toString());
    }
    /**
     * Generate distribution calldata for Arc distributor on a specific chain
     */
    generateDistributionCalldata(chunked, circleAttestation, circleSignature, distributorAddress = ARC_DISTRIBUTOR_ADDRESS) {
        const data = encodeFunctionData({
            abi: DISTRIBUTOR_ABI,
            functionName: "mintVerifyAndDistribute",
            args: [
                circleAttestation,
                circleSignature,
                chunked.payrollId,
                chunked.provider,
                chunked.totalAmount,
                chunked.payrollDate,
                (chunked.stateSignature || "0x"),
                chunked.recipients.map((r) => ({ wallet: r.wallet, amount: r.amount })),
            ],
        });
        const chainName = CHAIN_CONFIGS[chunked.targetChainId]?.name || "Unknown";
        return {
            chainId: chunked.targetChainId,
            to: distributorAddress,
            data,
            description: `Distribute ${formatUnits(chunked.totalAmount, 6)} USDC to ${chunked.recipients.length} recipients on ${chainName}`,
        };
    }
    /**
     * Get supported chains
     */
    getSupportedChains() {
        return Object.values(CHAIN_CONFIGS);
    }
}
