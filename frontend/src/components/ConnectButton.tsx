import { useState, useRef, useEffect } from 'react';
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import ChainSwitcher from "@/components/ChainSwitcher";
import { Copy, Check, ChevronDown, Wallet } from "lucide-react";

export default function ConnectButton() {
  const { isConnected, userAddress, connect, disconnect } = useAuth();
  const [copied, setCopied] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleClick = async () => {
    if (isConnected) {
      disconnect();
      setDropdownOpen(false);
    } else {
      try {
        await connect();
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
      <>
        {/* Desktop: Show all controls inline */}
        <div className="hidden md:flex items-center gap-3">
          <ChainSwitcher />
          <div 
            onClick={copyAddress}
            className="px-3 py-1.5 bg-gray-100 dark:bg-muted rounded-lg text-sm font-mono font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2 cursor-pointer hover:bg-gray-200 dark:hover:bg-accent transition-colors"
            title="Click to copy address"
          >
            {userAddress.slice(0, 6)}...{userAddress.slice(-4)}
            {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
          </div>
          <Button onClick={handleClick} variant="ghost" size="sm" className="text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
            Disconnect
          </Button>
        </div>

        {/* Mobile: Dropdown menu */}
        <div className="relative md:hidden" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-100 dark:bg-muted rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300"
          >
            <Wallet className="w-4 h-4" />
            {userAddress.slice(0, 4)}...{userAddress.slice(-3)}
            <ChevronDown className={`w-3 h-3 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-lg p-3 space-y-3 z-50">
              <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">Network</div>
              <ChainSwitcher />
              
              <div className="border-t border-gray-100 dark:border-border pt-3">
                <div className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-2">Wallet</div>
                <div 
                  onClick={copyAddress}
                  className="px-3 py-2 bg-gray-50 dark:bg-muted rounded-lg text-sm font-mono text-gray-700 dark:text-gray-300 flex items-center justify-between cursor-pointer hover:bg-gray-100 dark:hover:bg-accent transition-colors"
                >
                  <span>{userAddress.slice(0, 8)}...{userAddress.slice(-6)}</span>
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-400" />}
                </div>
              </div>
              
              <button
                onClick={handleClick}
                className="w-full px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors text-left"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <Button onClick={handleClick} className="bg-blue-600 hover:bg-blue-700 text-sm px-3 md:px-4">
      Get Started
    </Button>
  );
}
