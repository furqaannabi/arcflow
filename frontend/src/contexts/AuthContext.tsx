import React, { createContext, useContext, useState, useCallback } from 'react';
import { toPasskeyTransport, toWebAuthnCredential, toCircleSmartAccount, toModularTransport, WebAuthnMode } from '@circle-fin/modular-wallets-core';
import { createPublicClient } from 'viem';
import { toWebAuthnAccount, bundlerActions } from 'viem/account-abstraction';
import { polygon, polygonAmoy, arbitrum, arbitrumSepolia, base, baseSepolia, optimism, optimismSepolia, avalanche, avalancheFuji } from 'viem/chains';

// Supported chains based on official Circle Modular Wallets documentation
const SUPPORTED_CHAINS = {
  // Testnets (using baseSepolia as default)
  baseSepolia: { chain: baseSepolia, path: 'baseSepolia' },
  polygonAmoy: { chain: polygonAmoy, path: 'polygonAmoy' },
  arbitrumSepolia: { chain: arbitrumSepolia, path: 'arbitrumSepolia' },
  optimismSepolia: { chain: optimismSepolia, path: 'optimismSepolia' },
  avalancheFuji: { chain: avalancheFuji, path: 'avalancheFuji' },
  // Note: arcTestnet, monadTestnet, unichainSepolia require custom chain configs
  
  // Mainnets
  polygon: { chain: polygon, path: 'polygon' },
  arbitrum: { chain: arbitrum, path: 'arbitrum' },
  base: { chain: base, path: 'base' },
  optimism: { chain: optimism, path: 'optimism' },
  avalanche: { chain: avalanche, path: 'avalanche' },
  // Note: monad, unichain require custom chain configs
} as const;

export type SupportedChainKey = keyof typeof SUPPORTED_CHAINS;

interface AuthContextType {
  isConnected: boolean;
  userAddress: string | null;
  currentChain: SupportedChainKey;
  connect: (chainKey?: SupportedChainKey) => Promise<void>;
  disconnect: () => void;
  switchChain: (chainKey: SupportedChainKey) => Promise<void>;
  sendTransaction: (tx: { to: string; data: string; value?: bigint }) => Promise<string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [currentChain, setCurrentChain] = useState<SupportedChainKey>('baseSepolia'); // Default to Base Sepolia
  const [credential, setCredential] = useState<any>(null); // Store credential for chain switching

  // Restore state on mount
  React.useEffect(() => {
    const storedConnected = localStorage.getItem('arcflow_connected');
    const storedAddress = localStorage.getItem('arcflow_address');
    
    if (storedConnected === 'true' && storedAddress) {
      setIsConnected(true);
      setUserAddress(storedAddress);
    }
  }, []);

  const connect = useCallback(async (chainKey: SupportedChainKey = 'baseSepolia') => {
    try {
      // Get Circle credentials from env
      const clientKey = import.meta.env.VITE_CIRCLE_CLIENT_KEY;
      const clientUrl = import.meta.env.VITE_CIRCLE_CLIENT_URL;

      if (!clientKey || !clientUrl) {
        throw new Error('Circle credentials not found in environment variables');
      }

      console.log(`Starting Circle wallet connection on ${chainKey}...`);

      const selectedChain = SUPPORTED_CHAINS[chainKey];
      if (!selectedChain) {
        throw new Error(`Unsupported chain: ${chainKey}`);
      }

      // 1. Create passkey transport and credential (only if we don't have one)
      let passkeyCredential = credential;
      
      if (!passkeyCredential) {
        const passkeyTransport = toPasskeyTransport(clientUrl, clientKey);
        
        // Try to login first, fallback to register
        try {
          passkeyCredential = await toWebAuthnCredential({
            transport: passkeyTransport,
            mode: WebAuthnMode.Login,
            username: `arcflow-user-${Date.now()}`, 
          });
          console.log('Logged in with existing passkey');
        } catch (loginError) {
          console.log('No existing passkey, creating new one...');
          passkeyCredential = await toWebAuthnCredential({
            transport: passkeyTransport,
            mode: WebAuthnMode.Register,
            username: `arcflow-user-${Date.now()}`,
          });
          console.log('Passkey credential created');
        }
        
        // Store credential for future chain switches
        setCredential(passkeyCredential);
      }

      // 2. Create modular transport for selected chain
      const modularTransport = toModularTransport(
        `${clientUrl}/${selectedChain.path}`,
        clientKey
      );

      // 3. Create public client
      const client = createPublicClient({
        chain: selectedChain.chain,
        transport: modularTransport,
      });

      console.log('Client created for', selectedChain.chain.name);

      // 4. Create Circle smart account with WebAuthn owner
      const smartAccount = await toCircleSmartAccount({
        client,
        owner: toWebAuthnAccount({ credential: passkeyCredential }),
      });

      console.log('Smart account created:', smartAccount.address);

      // Get account address (same across all chains!)
      const address = smartAccount.address;
      
      setIsConnected(true);
      setUserAddress(address);
      setCurrentChain(chainKey);
      
      // Persist state
      localStorage.setItem('arcflow_connected', 'true');
      localStorage.setItem('arcflow_address', address);

      console.log(`Successfully connected to ${selectedChain.chain.name} with address:`, address);
      return passkeyCredential; 
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      
      // Show user-friendly error message
      if (error instanceof Error) {
        alert(`Wallet connection failed: ${error.message}`);
      } else {
        alert('Wallet connection failed. Please try again.');
      }
      
      throw error;
    }
  }, [credential]);

  const switchChain = useCallback(async (chainKey: SupportedChainKey) => {
    // If we have no credential but are "connected" (persisted state), we need to full reconnect
    if (!credential) {
      console.log('No credential in state, falling back to full connection flow...');
      await connect(chainKey);
      return;
    }

    try {
      console.log(`Switching to ${chainKey}...`);
      
      const clientKey = import.meta.env.VITE_CIRCLE_CLIENT_KEY;
      const clientUrl = import.meta.env.VITE_CIRCLE_CLIENT_URL;
      
      const selectedChain = SUPPORTED_CHAINS[chainKey];
      
      // Create modular transport for new chain
      const modularTransport = toModularTransport(
        `${clientUrl}/${selectedChain.path}`,
        clientKey
      );

      // Create public client
      const client = createPublicClient({
        chain: selectedChain.chain,
        transport: modularTransport,
      });

      // Create smart account (same address!)
      const smartAccount = await toCircleSmartAccount({
        client,
        owner: toWebAuthnAccount({ credential }),
      });

      setCurrentChain(chainKey);
      console.log(`Switched to ${selectedChain.chain.name}, address: ${smartAccount.address}`);
    } catch (error) {
      console.error('Failed to switch chain:', error);
      throw error;
    }
  }, [credential, connect]);

  const sendTransaction = useCallback(async (tx: { to: string; data: string; value?: bigint }) => {
    let activeCredential = credential;

    // Check if we need to restore session
    if (!activeCredential) {
       console.log("Restoring session for transaction...");
       // Re-run connect logic to get credential (will prompt user passkey)
       activeCredential = await connect(currentChain);
    }
    
    if (!activeCredential) {
      throw new Error("Wallet not connected");
    }

    try {
      console.log(`Sending transaction on ${currentChain}...`);
      
      const clientKey = import.meta.env.VITE_CIRCLE_CLIENT_KEY;
      const clientUrl = import.meta.env.VITE_CIRCLE_CLIENT_URL; // Using client URL as bundler URL
      
      const selectedChain = SUPPORTED_CHAINS[currentChain];
      
      const modularTransport = toModularTransport(
        `${clientUrl}/${selectedChain.path}`,
        clientKey
      );

      // Create public client for gas estimation etc
      const publicClient = createPublicClient({
        chain: selectedChain.chain,
        transport: modularTransport,
      });

      // Create smart account
      const smartAccount = await toCircleSmartAccount({
        client: publicClient,
        owner: toWebAuthnAccount({ credential: activeCredential }),
      });

      // For Smart Accounts, we must use UserOperations (ERC-4337)
      // We extend the client with bundler actions.
      // Note: "paymaster: true" requests gas sponsorship from the Circle Paymaster.
      const bundlerClient = publicClient.extend(bundlerActions);

      console.log("Sending UserOperation...");
      const userOpHash = await bundlerClient.sendUserOperation({
        account: smartAccount,
        calls: [{
          to: tx.to as `0x${string}`,
          data: tx.data as `0x${string}`,
          value: tx.value || 0n,
        }],
        paymaster: true,
      });

      console.log('UserOp sent, hash:', userOpHash);
      console.log('Waiting for receipt...');

      const receipt = await bundlerClient.waitForUserOperationReceipt({
        hash: userOpHash,
      });

      console.log('Transaction completed:', receipt.receipt.transactionHash);
      return receipt.receipt.transactionHash;
    } catch (error) {
      console.error('Failed to send transaction:', error);
      throw error;
    }
  }, [credential, currentChain, connect]);

  const disconnect = useCallback(() => {
    setIsConnected(false);
    setUserAddress(null);
    setCredential(null);
    setCurrentChain('baseSepolia');
    
    localStorage.removeItem('arcflow_connected');
    localStorage.removeItem('arcflow_address');
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isConnected,
        userAddress,
        currentChain,
        connect,
        disconnect,
        switchChain,
        sendTransaction,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Export supported chains for UI
export { SUPPORTED_CHAINS };
