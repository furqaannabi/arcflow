import { useAuth, SUPPORTED_CHAINS, type SupportedChainKey } from "@/contexts/AuthContext";

export default function ChainSwitcher() {
  const { currentChain, switchChain } = useAuth();



  const handleChainChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newChain = e.target.value as SupportedChainKey;
    try {
      await switchChain(newChain);
    } catch (error) {
      console.error('Failed to switch chain:', error);
    }
  };

  return (

      <select
        id="chain-select"
        value={currentChain}
        onChange={handleChainChange}
        className="px-2 md:px-3 py-1 md:py-1.5 bg-white dark:bg-muted border border-gray-300 dark:border-border rounded-lg text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-foreground appearance-none min-w-[80px] md:min-w-[120px]"
      >
        {Object.entries(SUPPORTED_CHAINS).map(([key, { chain }]) => (
          <option key={key} value={key} className="bg-white dark:bg-popover text-gray-900 dark:text-foreground">
            {chain.name}
          </option>
        ))}
      </select>

  );
}
