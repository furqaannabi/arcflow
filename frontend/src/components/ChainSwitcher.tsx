import { useAuth, SUPPORTED_CHAINS, type SupportedChainKey } from "@/contexts/AuthContext";

export default function ChainSwitcher() {
  const { currentChain, switchChain, isConnected } = useAuth();

  if (!isConnected) return null;

  const handleChainChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newChain = e.target.value as SupportedChainKey;
    try {
      await switchChain(newChain);
    } catch (error) {
      console.error('Failed to switch chain:', error);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="chain-select" className="text-sm font-medium text-gray-700">
        Network:
      </label>
      <select
        id="chain-select"
        value={currentChain}
        onChange={handleChainChange}
        className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {Object.entries(SUPPORTED_CHAINS).map(([key, { chain }]) => (
          <option key={key} value={key}>
            {chain.name}
          </option>
        ))}
      </select>
    </div>
  );
}
