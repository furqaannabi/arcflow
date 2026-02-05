import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, AlertCircle, ArrowRight } from "lucide-react";
import { useAuth, SUPPORTED_CHAINS } from "@/contexts/AuthContext";

interface TransactionActionProps {
  to: string;
  data: string;
  description: string;
  value?: string; // Optional value in wei
}

export default function TransactionAction({ to, data, description, value = "0" }: TransactionActionProps) {
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
    } catch (error) {
      console.error("Transaction failed:", error);
      setStatus("error");
      setErrorMessage((error as Error).message || "Transaction failed");
    }
  };

  if (status === "success") {
    return (
      <div className="bg-green-50 border border-green-100 rounded-lg p-4 mt-2">
        <div className="flex items-center gap-2 mb-2 text-green-700 font-semibold">
          <CheckCircle className="w-5 h-5" />
          <span>Transaction Sent</span>
        </div>
        <p className="text-sm text-green-600 mb-2">{description}</p>
        {txHash && explorerUrl && (
          <a
            href={`${explorerUrl}/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-green-700 underline hover:no-underline"
          >
            View on Explorer
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border boundary-gray-200 rounded-lg p-4 mt-2 shadow-sm">
      <h4 className="font-semibold text-gray-900 mb-2">Action Required</h4>
      <p className="text-sm text-gray-600 mb-4">{description}</p>
      
      <div className="bg-gray-50 rounded p-3 mb-4 text-xs font-mono text-gray-500 overflow-hidden text-ellipsis whitespace-nowrap">
        <div className="flex gap-2 mb-1">
          <span className="font-bold">To:</span> {to}
        </div>
        <div className="flex gap-2">
          <span className="font-bold">Data:</span> {data.slice(0, 10)}...{data.slice(-10)}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {status === "error" && (
           <div className="flex items-center gap-2 text-red-600 text-sm flex-1">
             <AlertCircle className="w-4 h-4" />
             <span className="truncate">{errorMessage}</span>
           </div>
        )}
        
        <Button 
          onClick={handleSign} 
          disabled={status === "pending"}
          className={`ml-auto ${status === "error" ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}
        >
          {status === "pending" ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Signing...
            </>
          ) : (
            <>
              Sign & Send
              <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
