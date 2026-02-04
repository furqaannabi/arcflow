interface YieldData {
    project: string;
    chain: string;
    apy: number;
    tvl: number;
    symbol: string;
}
export declare class DefiLlamaService {
    private readonly baseUrl;
    getUsdcYields(): Promise<YieldData[]>;
    getBestApy(chain?: string): Promise<YieldData | null>;
    getApyForChains(chains: string[]): Promise<Map<string, YieldData>>;
    private getFallbackData;
}
export {};
