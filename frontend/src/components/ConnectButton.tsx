import { useAuth, SUPPORTED_CHAINS } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import ChainSwitcher from "@/components/ChainSwitcher";

export default function ConnectButton() {
  const { isConnected, userAddress, connect, disconnect, currentChain } = useAuth();

  const handleClick = async () => {
    if (isConnected) {
      disconnect();
    } else {
      try {
        await connect(); // Will use default Sepolia
      } catch (error) {
        console.error('Connection failed:', error);
      }
    }
  };

  if (isConnected && userAddress) {
    const chainName = SUPPORTED_CHAINS[currentChain].chain.name;
    
    return (
      <div className="flex items-center gap-4">
        <ChainSwitcher />
        <div className="flex flex-col items-end">
          <div className="px-3 py-1.5 bg-gray-100 rounded-lg text-sm font-mono">
            {userAddress.slice(0, 6)}...{userAddress.slice(-4)}
          </div>
          <div className="text-xs text-gray-500 mt-1">{chainName}</div>
        </div>
        <Button onClick={handleClick} variant="outline" size="sm">
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <Button onClick={handleClick} className="bg-blue-600 hover:bg-blue-700">
      Get Started
    </Button>
  );
}
