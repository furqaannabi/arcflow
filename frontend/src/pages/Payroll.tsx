import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import Sidebar from "@/components/Sidebar";
import ChainSwitcher from "@/components/ChainSwitcher";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import ActivePayrollsTable from "@/components/payroll/ActivePayrollsTable";
import CreatePayrollModal from "@/components/payroll/CreatePayrollModal";
import PayrollDetailsModal from "@/components/payroll/PayrollDetailsModal";

export default function Payroll() {
  const { userAddress, disconnect, isConnected, connect } = useAuth();
  
  // State for modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedPayrollId, setSelectedPayrollId] = useState<number | null>(null);

  const handleCreateClose = () => setIsCreateModalOpen(false);
  const handleDetailsClose = () => setSelectedPayrollId(null);
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background flex transition-colors duration-300">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1">
        {/* Header - Reused from Dashboard style for consistency */}
        <header className="bg-white dark:bg-card border-b border-gray-100 dark:border-border h-16 px-8 flex items-center justify-between transition-colors duration-300">
          <h1 className="text-xl font-bold text-gray-900 dark:text-foreground">Payroll</h1>
          
          <div className="flex items-center gap-4">
            <ChainSwitcher />
            
            {isConnected ? (
              <>
                <div className="px-3 py-1.5 bg-gray-50 dark:bg-muted rounded-lg text-sm font-mono text-gray-600 dark:text-foreground border border-gray-100 dark:border-border min-w-[140px] text-center transition-colors">
                  {userAddress ? `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}` : 'Connecting...'}
                </div>
                <Button onClick={disconnect} variant="ghost" size="sm" className="text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-red-900/10">
                  Disconnect
                </Button>
              </>
            ) : (
              <Button onClick={() => connect()} className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700">
                Connect Wallet
              </Button>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-foreground">Payroll Management</h2>
              <p className="text-gray-500 dark:text-muted-foreground">Create and manage your global payrolls</p>
            </div>
            <Button 
                className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white gap-2"
                onClick={() => setIsCreateModalOpen(true)}
            >
              <Plus className="w-4 h-4" />
              Create Payroll
            </Button>
          </div>

          <ActivePayrollsTable onViewDetails={setSelectedPayrollId} />
          
          {isCreateModalOpen && <CreatePayrollModal onClose={handleCreateClose} />}
          {selectedPayrollId !== null && <PayrollDetailsModal payrollId={selectedPayrollId} onClose={handleDetailsClose} />}
        </main>
      </div>
    </div>
  );
}
