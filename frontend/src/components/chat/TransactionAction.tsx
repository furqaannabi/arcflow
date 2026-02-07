import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, AlertCircle, ArrowRight } from "lucide-react";
import { useAuth, SUPPORTED_CHAINS } from "@/contexts/AuthContext";

interface TransactionActionProps {
  to: string;
  data: string;
  description: string;
  value?: string; // Optional value in wei
  onSuccess?: (txHash: string) => void;
}

export default function TransactionAction({ to, data, description, value = "0", onSuccess }: TransactionActionProps) {
  const { isConnected, connect, sendTransaction, currentChain } = useAuth(); // Assuming sendTransaction will be added
  const [status, setStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const explorerUrl = SUPPORTED_CHAINS[currentChain]?.chain.blockExplorers?.default.url;

  const handleSign = async () => {
    if (!isConnected) {
      await connect();
      return;
    }

    try {
      setStatus("pending");
      setErrorMessage(null);

      // Call sendTransaction from AuthContext
      // @ts-ignore - Temporary until AuthContext is updated
      const hash = await sendTransaction({
        to,
        data,
        value: BigInt(value || "0"),
      });

      setTxHash(hash);
      setStatus("success");
      if (onSuccess) {
        onSuccess(hash);
      }
    } catch (error) {
      console.error("Transaction failed:", error);
      setStatus("error");
      setErrorMessage((error as Error).message || "Transaction failed");
    }
  };

  if (status === "success") {
    return (
      <div className="bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/20 rounded-lg p-4 mt-2 transition-colors">
        <div className="flex items-center gap-2 mb-2 text-green-700 dark:text-green-400 font-semibold">
          <CheckCircle className="w-5 h-5" />
          <span>Transaction Sent</span>
        </div>
        <p className="text-sm text-green-600 dark:text-green-400/80 mb-2">{description}</p>
        {txHash && explorerUrl && (
          <a
            href={`${explorerUrl}/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-green-700 dark:text-green-400 underline hover:no-underline"
          >
            View on Explorer
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-lg p-4 mt-2 shadow-sm transition-colors">
      <h4 className="font-semibold text-gray-900 dark:text-foreground mb-2">Action Required</h4>
      <p className="text-sm text-gray-600 dark:text-muted-foreground mb-4">{description}</p>
      
      <div className="bg-gray-50 dark:bg-muted rounded p-3 mb-4 text-xs font-mono text-gray-500 dark:text-muted-foreground overflow-hidden">
        <div className="flex gap-2 mb-1 overflow-hidden">
          <span className="font-bold shrink-0">To:</span>
          <span className="truncate">{to.slice(0, 6)}...{to.slice(-4)}</span>
        </div>
        <div className="flex gap-2 overflow-hidden">
          <span className="font-bold shrink-0">Data:</span>
          <span className="text-gray-400">{data.slice(0, 10)}... (hidden)</span>
        </div>
      </div>

      {status === "error" && (
        <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-lg flex items-start gap-2 animate-in fade-in slide-in-from-top-1 overflow-hidden">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="text-sm text-red-600 dark:text-red-400 min-w-0 overflow-hidden" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
            <span className="font-semibold block mb-0.5">Transaction Error</span>
            <span className="block break-all">{errorMessage}</span>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button 
          onClick={handleSign} 
          disabled={status === "pending"}
          className={status === "error" ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}
        >
          {status === "pending" ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Signing...
            </>
          ) : (
            <>
              {status === "error" ? "Retry Transaction" : "Sign & Send"}
              <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
