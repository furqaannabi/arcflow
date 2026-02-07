import { useState, useEffect, useCallback } from "react";
import { X, Calendar, Users, DollarSign, ExternalLink, RefreshCw } from "lucide-react";
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
const AUTO_REFRESH_INTERVAL = 30000; // 30 seconds

export default function PayrollsPanel({ isOpen, onClose, userAddress }: PayrollsPanelProps) {
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch payrolls function
  const fetchPayrolls = useCallback(async () => {
    if (!userAddress) return;
    
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
  }, [userAddress]);

  // Fetch on panel open
  useEffect(() => {
    if (isOpen && userAddress) {
      fetchPayrolls();
    }
  }, [isOpen, userAddress, fetchPayrolls]);

  // Auto-refresh every 30 seconds while panel is open
  useEffect(() => {
    if (!isOpen || !userAddress) return;

    const interval = setInterval(fetchPayrolls, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [isOpen, userAddress, fetchPayrolls]);

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
          <div className="flex items-center gap-2">
            <button 
              onClick={fetchPayrolls}
              disabled={isLoading}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors disabled:opacity-50"
              title="Refresh payrolls"
            >
              <RefreshCw className={cn("w-5 h-5 text-gray-500 dark:text-gray-400", isLoading && "animate-spin")} />
            </button>
            <button 
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
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
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
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
              {payrolls.map((payroll) => {
                const amount = (Number(payroll.totalAmount) / 1e6).toFixed(2);
                const date = new Date(Number(payroll.payrollDate) * 1000);
                const statusColors = {
                  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
                  deposited: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                  executed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                  failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                };

                return (
                  <div
                    key={payroll.payrollId}
                    className="bg-gray-50 dark:bg-muted border border-gray-200 dark:border-border rounded-lg p-3 hover:border-blue-300 dark:hover:border-blue-700 transition-colors cursor-pointer"
                  >
                    {/* Status Badge + Date */}
                    <div className="flex items-center justify-between mb-2">
                      <span className={cn(
                        "text-xs font-medium px-2 py-1 rounded-full",
                        statusColors[payroll.status as keyof typeof statusColors] || statusColors.pending
                      )}>
                        {payroll.status.charAt(0).toUpperCase() + payroll.status.slice(1)}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {date.toLocaleDateString([], { month: 'short', day: 'numeric' })} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {payroll.txHash && (
                          <a
                            href={`https://sepolia.basescan.org/tx/${payroll.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                      <span className="text-lg font-bold text-gray-900 dark:text-foreground">
                        ${amount} USDC
                      </span>
                    </div>

                    {/* Recipients */}
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <Users className="w-4 h-4" />
                      <span>{payroll.recipients.length} recipient{payroll.recipients.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
