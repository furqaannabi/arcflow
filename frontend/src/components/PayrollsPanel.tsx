import { useState, useEffect } from "react";
import { X, Calendar, Users, DollarSign, ExternalLink, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Payroll {
  payrollId: string;
  totalAmount: string;
  payrollDate: string;
  status: string;
  chainId: number;
  txHash?: string;
  recipients: Array<{ wallet: string; amount: string }>;
  createdAt: string;
}

interface PayrollsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  userAddress?: string;
}

const AGENT_API_URL = "http://localhost:3001";

export default function PayrollsPanel({ isOpen, onClose, userAddress }: PayrollsPanelProps) {
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch payrolls when panel opens and user is connected
  useEffect(() => {
    if (!isOpen || !userAddress) return;

    const fetchPayrolls = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`${AGENT_API_URL}/api/payrolls/${userAddress}`);
        if (!response.ok) throw new Error("Failed to fetch payrolls");
        const data = await response.json();
        setPayrolls(data);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPayrolls();
  }, [isOpen, userAddress]);

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:bg-transparent md:pointer-events-none" 
          onClick={onClose}
        />
      )}
      
      {/* Panel */}
      <div className={cn(
        "fixed right-0 top-0 h-screen w-full md:w-96 bg-white dark:bg-card border-l border-gray-200 dark:border-border shadow-2xl z-50 transition-transform duration-300 flex flex-col",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-border">
          <h2 className="text-lg font-bold text-gray-900 dark:text-foreground">My Payrolls</h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {!userAddress ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <DollarSign className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Connect your wallet to view payrolls
              </p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : payrolls.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <Calendar className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                No payrolls yet
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Create your first payroll in the chat
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Payroll cards will go here */}
              <p className="text-sm text-gray-500">Payrolls will appear here</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
