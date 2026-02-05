import { useState } from "react";
import { X, User, Calendar, DollarSign, Clock, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PayrollDetailsModalProps {
  onClose: () => void;
  payrollId: number;
}

// Mock data store - in a real app this would come from an API
const MOCK_PAYROLL_DETAILS: Record<number, any> = {
  1: {
    id: 1,
    name: "Feb Engineering",
    dept: "Engineering",
    period: "Feb 1 - Feb 28, 2026",
    status: "Active",
    totalAmount: "48,200",
    totalDeposited: "50,000",
    remainingBalance: "22,500",
    createdAt: "2026-02-01",
    employees: [
      { id: 101, name: "Alice Dev", role: "Senior Engineer", wallet: "0x71C...9A21", chain: "Base", amount: "12,000", status: "Pending" },
      { id: 102, name: "Bob Arch", role: "Architect", wallet: "0x3D2...1B4C", chain: "Optimism", amount: "15,000", status: "Pending" },
      { id: 103, name: "Charlie QA", role: "QA Lead", wallet: "0x9F1...8E2D", chain: "Arbitrum", amount: "10,500", status: "Paid" },
      { id: 104, name: "Diana UI", role: "Frontend Dev", wallet: "0x2A1...5C3B", chain: "Base", amount: "10,700", status: "Pending" },
    ]
  },
  2: {
    id: 2,
    name: "Feb Sales",
    dept: "Sales",
    period: "Feb 1 - Feb 28, 2026",
    status: "Paused",
    totalAmount: "32,500",
    totalDeposited: "32,500",
    remainingBalance: "32,500",
    createdAt: "2026-01-28",
    employees: [
      { id: 201, name: "Eve Sales", role: "Sales Lead", wallet: "0x1B2...3C4D", chain: "Ethereum", amount: "18,000", status: "Paused" },
      { id: 202, name: "Frank BD", role: "Business Dev", wallet: "0x5E6...7F8G", chain: "Polygon", amount: "14,500", status: "Paused" },
    ]
  },
  3: {
    id: 3,
    name: "Jan Engineering",
    dept: "Engineering",
    period: "Jan 1 - Jan 31, 2026",
    status: "Completed",
    totalAmount: "45,000",
    totalDeposited: "45,000",
    remainingBalance: "0",
    createdAt: "2026-01-01",
    employees: [
      { id: 301, name: "Alice Dev", role: "Senior Engineer", wallet: "0x71C...9A21", chain: "Base", amount: "12,000", status: "Paid" },
      { id: 302, name: "Bob Arch", role: "Architect", wallet: "0x3D2...1B4C", chain: "Optimism", amount: "15,000", status: "Paid" },
      { id: 303, name: "Charlie QA", role: "QA Lead", wallet: "0x9F1...8E2D", chain: "Arbitrum", amount: "10,500", status: "Paid" },
    ]
  }
};

export default function PayrollDetailsModal({ onClose, payrollId }: PayrollDetailsModalProps) {
  const details = MOCK_PAYROLL_DETAILS[payrollId];
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");

  if (!details) return null;

  const handleWithdraw = () => {
    // In a real app, this would call a smart contract function
    console.log(`Withdrawing ${withdrawAmount || details.remainingBalance} USDC from payroll ${payrollId}`);
    setIsWithdrawing(false);
    setWithdrawAmount("");
    // Show toast notification here
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-card rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-200 dark:border-border">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-border bg-gray-50/50 dark:bg-muted/50">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-xl font-bold text-gray-900 dark:text-foreground">{details.name}</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                details.status === 'Completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                details.status === 'Active' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
              }`}>
                {details.status}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {details.period}
              </span>
              <span className="flex items-center gap-1.5">
                <DollarSign className="w-4 h-4" />
                Total: {details.totalAmount} USDC
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-foreground p-1 hover:bg-gray-100 dark:hover:bg-muted/50 rounded-lg transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Fund Status Card */}
            <div className="bg-gray-900 dark:bg-black/40 border border-gray-800 rounded-xl p-6 text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500 rounded-full mix-blend-overlay filter blur-3xl opacity-20 -translate-y-1/2 translate-x-1/2"></div>
              
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-gray-400 text-sm font-medium mb-1">Remaining Pool Balance</h3>
                    <div className="text-3xl font-bold font-mono tracking-tight">{details.remainingBalance} USDC</div>
                     <div className="text-sm text-gray-500 mt-1">
                      Total Deposited: {details.totalDeposited} USDC
                    </div>
                  </div>
                  {isWithdrawing ? (
                     <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/20 animate-in fade-in zoom-in duration-200">
                        <div className="flex items-center gap-2 mb-2">
                          <input 
                            type="number" 
                            placeholder="Amount"
                            className="bg-black/20 border border-white/10 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500 w-32"
                            value={withdrawAmount}
                            onChange={(e) => setWithdrawAmount(e.target.value)}
                          />
                          <button 
                            className="text-xs text-blue-300 hover:text-blue-200 underline"
                            onClick={() => setWithdrawAmount(details.remainingBalance.replace(/,/g, ''))}
                          >
                            Max
                          </button>
                        </div>
                        <div className="flex gap-2">
                           <Button 
                            size="sm" 
                            variant="secondary"
                            onClick={() => setIsWithdrawing(false)}
                            className="h-7 text-xs bg-white/10 hover:bg-white/20 text-white border-none"
                          >
                            Cancel
                          </Button>
                          <Button 
                            size="sm" 
                            onClick={handleWithdraw}
                            className="h-7 text-xs bg-blue-600 hover:bg-blue-500 border-none"
                          >
                            Confirm
                          </Button>
                        </div>
                     </div>
                  ) : (
                    <Button 
                      className="bg-white text-gray-900 hover:bg-gray-100 gap-2"
                      disabled={details.remainingBalance === "0"}
                      onClick={() => setIsWithdrawing(true)}
                    >
                      <ArrowUpRight className="w-4 h-4" />
                      Withdraw Funds
                    </Button>
                  )}
                </div>
                
                {/* Visual Progress Bar for Funds */}
                <div className="w-full bg-gray-800 rounded-full h-1.5 mb-2 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-cyan-400 h-1.5 rounded-full transition-all duration-500"
                    style={{ 
                      width: `${(parseFloat(details.remainingBalance.replace(/,/g, '')) / parseFloat(details.totalDeposited.replace(/,/g, ''))) * 100}%` 
                    }}
                  ></div>
                </div>
                <div className="flex justify-between text-xs text-gray-400">
                  <span>0%</span>
                  <span>100% Funded</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-foreground mb-4 flex items-center gap-2">
                <User className="w-4 h-4 text-gray-500" />
                Employee Breakdown
              </h3>
              
              <div className="border border-gray-100 dark:border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-muted-foreground">Employee</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-muted-foreground">Wallet Details</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-500 dark:text-muted-foreground">Amount</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-500 dark:text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-border bg-white dark:bg-card">
                    {details.employees.map((emp: any) => (
                      <tr key={emp.id} className="hover:bg-gray-50/50 dark:hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900 dark:text-foreground">{emp.name}</div>
                          <div className="text-gray-500 dark:text-muted-foreground text-xs">{emp.role}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-muted-foreground font-mono text-xs">
                          <div>{emp.wallet}</div>
                          <div className="text-gray-400 dark:text-gray-500">{emp.chain}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-foreground">
                          {emp.amount} USDC
                        </td>
                         <td className="px-4 py-3 text-right">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
                            emp.status === 'Paid' ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' :
                            emp.status === 'Paused' ? 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' :
                            'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                          }`}>
                            {emp.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 rounded-lg p-4 flex gap-3">
              <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-blue-900 dark:text-blue-300">Payment Schedule</h4>
                <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                  This payroll is scheduled to be processed according to the defined period. 
                  {details.status === 'Active' && " Processing is currently active."}
                  {details.status === 'Paused' && " Processing is currently paused."}
                  {details.status === 'Completed' && " All payments have been settled."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
