import { useState } from 'react';
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import ChainSwitcher from "@/components/ChainSwitcher";
import { Copy, Check } from "lucide-react";

export default function ConnectButton() {
  const { isConnected, userAddress, connect, disconnect } = useAuth();
  const [copied, setCopied] = useState(false);

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

  const copyAddress = async () => {
    if (userAddress) {
      await navigator.clipboard.writeText(userAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isConnected && userAddress) {
    return (
      <div className="flex items-center gap-3">
        <ChainSwitcher />
        <div 
          onClick={copyAddress}
          className="px-3 py-1.5 bg-gray-100 rounded-lg text-sm font-mono font-medium text-gray-700 flex items-center gap-2 cursor-pointer hover:bg-gray-200 transition-colors"
          title="Click to copy address"
        >
          {userAddress.slice(0, 6)}...{userAddress.slice(-4)}
          {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
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
