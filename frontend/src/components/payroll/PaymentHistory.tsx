import { X, ExternalLink, Calendar, CheckCircle2 } from "lucide-react";

interface PaymentHistoryProps {
  employeeName: string;
  onClose: () => void;
}

// Mock data
const HISTORY = [
  { id: 1, date: "Feb 15, 2024", amount: "5,000 USDC", txHash: "0x38...4d27", status: "Success" },
  { id: 2, date: "Jan 15, 2024", amount: "5,000 USDC", txHash: "0x12...9a12", status: "Success" },
  { id: 3, date: "Dec 15, 2023", amount: "4,800 USDC", txHash: "0x89...2b34", status: "Success" },
];

export default function PaymentHistory({ employeeName, onClose }: PaymentHistoryProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
          <div>
            <h3 className="font-semibold text-gray-900">Payment History</h3>
            <p className="text-xs text-gray-500">for {employeeName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {HISTORY.map((item) => (
            <div key={item.id} className="p-4 border-b border-gray-50 hover:bg-gray-50/50 transition-colors flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                    {item.amount}
                  </div>
                  <div className="text-xs text-gray-500 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {item.date}
                  </div>
                </div>
              </div>
              <a 
                href={`https://sepolia.basescan.org/tx/${item.txHash}`} 
                target="_blank" 
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                View <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
