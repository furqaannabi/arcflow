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
      <div className="flex items-center gap-1.5 md:gap-3">
        <ChainSwitcher />
        <div 
          onClick={copyAddress}
          className="px-2 md:px-3 py-1 md:py-1.5 bg-gray-100 dark:bg-muted rounded-lg text-xs md:text-sm font-mono font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5 cursor-pointer hover:bg-gray-200 dark:hover:bg-accent transition-colors"
          title="Click to copy address"
        >
          {userAddress.slice(0, 6)}...{userAddress.slice(-4)}
          {copied ? <Check className="w-3 h-3 md:w-3.5 md:h-3.5 text-green-600" /> : <Copy className="w-3 h-3 md:w-3.5 md:h-3.5 text-gray-400" />}
        </div>
        <Button 
          onClick={handleClick} 
          variant="ghost" 
          size="sm" 
          className="text-xs md:text-sm px-2 md:px-3 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          <span className="hidden md:inline">Disconnect</span>
          <span className="md:hidden">×</span>
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
