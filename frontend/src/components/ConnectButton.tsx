import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import ChainSwitcher from "@/components/ChainSwitcher";

export default function ConnectButton() {
  const { isConnected, userAddress, connect, disconnect } = useAuth();

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
    return (
      <div className="flex items-center gap-3">
        <ChainSwitcher />
        <div className="px-3 py-1.5 bg-gray-100 rounded-lg text-sm font-mono font-medium text-gray-700">
          {userAddress.slice(0, 6)}...{userAddress.slice(-4)}
        </div>
        <Button onClick={handleClick} variant="ghost" size="sm" className="text-gray-500 hover:text-red-600 hover:bg-red-50">
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
