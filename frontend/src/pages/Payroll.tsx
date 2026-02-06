import { useState } from "react";
// import { useAuth } from "@/contexts/AuthContext"; // unused
import Sidebar from "@/components/Sidebar";
import ConnectButton from "@/components/ConnectButton";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import ActivePayrollsTable from "@/components/payroll/ActivePayrollsTable";
import CreatePayrollModal from "@/components/payroll/CreatePayrollModal";
import PayrollDetailsModal from "@/components/payroll/PayrollDetailsModal";

export default function Payroll() {
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
            <ConnectButton />
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
