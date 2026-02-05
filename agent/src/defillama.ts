interface Pool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number;
}

interface YieldData {
  project: string;
  chain: string;
  apy: number;
  tvl: number;
  symbol: string;
}

export class DefiLlamaService {
  private readonly baseUrl = "https://yields.llama.fi";

  async getUsdcYields(): Promise<YieldData[]> {
    try {
      const response = await fetch(`${this.baseUrl}/pools`);
      const data = await response.json();

      // Filter for USDC pools with good APY
      const usdcPools = (data.data as Pool[])
        .filter(
          (pool) =>
            pool.symbol.toLowerCase().includes("usdc") &&
            pool.tvlUsd > 1000000 && // Min $1M TVL
            pool.apy > 0 &&
            pool.apy < 50 // Filter out unrealistic APYs
        )
        .map((pool) => ({
          project: pool.project,
          chain: pool.chain,
          apy: pool.apy,
          tvl: pool.tvlUsd,
          symbol: pool.symbol,
        }))
        .sort((a, b) => b.apy - a.apy);

      return usdcPools;
    } catch (error) {
      console.error("Error fetching DeFiLlama data:", error);
      return this.getFallbackData();
    }
  }

  async getBestApy(chain?: string): Promise<YieldData | null> {
    const pools = await this.getUsdcYields();
    if (chain) {
      return pools.find((p) => p.chain.toLowerCase() === chain.toLowerCase()) || null;
    }
    return pools[0] || null;
  }

  async getApyForChains(chains: string[]): Promise<Map<string, YieldData>> {
    const pools = await this.getUsdcYields();
    const result = new Map<string, YieldData>();

    for (const chain of chains) {
      const pool = pools.find(
        (p) => p.chain.toLowerCase() === chain.toLowerCase()
      );
      if (pool) {
        result.set(chain, pool);
      }
    }

    return result;
  }

  private getFallbackData(): YieldData[] {
    // Fallback data when API is unavailable
    return [
      { project: "Aave V3", chain: "Ethereum", apy: 4.5, tvl: 500000000, symbol: "USDC" },
      { project: "Compound V3", chain: "Ethereum", apy: 4.2, tvl: 400000000, symbol: "USDC" },
      { project: "Aave V3", chain: "Base", apy: 5.1, tvl: 200000000, symbol: "USDC" },
      { project: "Uniswap V3", chain: "Ethereum", apy: 3.8, tvl: 150000000, symbol: "USDC-USDT" },
      { project: "Curve", chain: "Ethereum", apy: 3.5, tvl: 300000000, symbol: "USDC-USDT" },
    ];
  }
}
