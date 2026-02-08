// Alchemy RPC configuration with multi-chain support

export interface RpcConfig {
  [chainId: number]: string;
}

// Build Alchemy RPC URLs from API key
export function getAlchemyRpcUrls(apiKey?: string): RpcConfig {
  const key = apiKey || process.env.ALCHEMY_API_KEY || "";

  if (!key) {
    console.warn("[CONFIG] No ALCHEMY_API_KEY found, using public RPCs");
  }

  return {
    // Sepolia (Ethereum testnet)
    11155111: key
      ? `https://eth-sepolia.g.alchemy.com/v2/${key}`
      : "https://rpc.sepolia.org",

    // Base Sepolia
    84532: key
      ? `https://base-sepolia.g.alchemy.com/v2/${key}`
      : "https://sepolia.base.org",

    // Arc Testnet (no Alchemy support, use public RPC)
    5042002: "https://rpc.testnet.arc.network",
  };
}

// Get RPC URL for a specific chain
export function getRpcUrl(chainId: number, apiKey?: string): string {
  const urls = getAlchemyRpcUrls(apiKey);
  return urls[chainId] || "";
}

// Default chain IDs
export const CHAIN_IDS = {
  SEPOLIA: 11155111,
  BASE_SEPOLIA: 84532,
  ARC_TESTNET: 5042002,
} as const;

// Circle Gateway domain IDs per chain
export const GATEWAY_DOMAINS: Record<number, number> = {
  84532: 6,      // Base Sepolia
  11155111: 0,   // Sepolia
  5042002: 26,   // Arc Testnet
};

// Circle Gateway Wallet contract address (same on all EVM testnets)
export const GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9" as const;

// Get primary RPC URL (Base Sepolia by default)
export function getPrimaryRpcUrl(apiKey?: string): string {
  return getRpcUrl(CHAIN_IDS.BASE_SEPOLIA, apiKey);
}
