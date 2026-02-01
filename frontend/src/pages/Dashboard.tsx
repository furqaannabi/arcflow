import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import ChainSwitcher from "@/components/ChainSwitcher";
import Sidebar from "@/components/Sidebar";
import StatsCard from "@/components/StatsCard";
import CashFlowChart from "@/components/CashFlowChart";
import RecentTransactions from "@/components/RecentTransactions";
import EmployeesTable from "@/components/EmployeesTable";



export default function Dashboard() {
  const { userAddress, disconnect, isConnected, connect } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1">
        {/* Header */}
        <header className="bg-white border-b border-gray-100 h-16 px-8 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          
          <div className="flex items-center gap-4">
          <div className="flex items-center gap-4">
            <ChainSwitcher />
            
            {isConnected ? (
              <>
                <div className="px-3 py-1.5 bg-gray-50 rounded-lg text-sm font-mono text-gray-600 border border-gray-100 min-w-[140px] text-center">
                  {userAddress ? `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}` : 'Connecting...'}
                </div>
                <Button onClick={disconnect} variant="ghost" size="sm" className="text-gray-500 hover:text-red-600">
                  Disconnect
                </Button>
              </>
            ) : (
              <Button onClick={() => connect()} className="bg-blue-600 text-white hover:bg-blue-700">
                Connect Wallet
              </Button>
            )}
          </div>
          </div>
        </header>

        {/* content */}
        <main className="p-8">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Overview</h2>
            <p className="text-gray-500">Manage your treasury and autonomous payrolls</p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <StatsCard 
              title="Treasury Balance" 
              value="$124,500.00" 
              trend="up" 
              percentage="12%" 
              label="vs last month"
            />
            <StatsCard 
              title="Active Employees" 
              value="24" 
              trend="up" 
              percentage="4" 
              label="new this month"
            />
            <StatsCard 
              title="Total Payroll" 
              value="$48,200.00" 
              trend="down" 
              percentage="2%" 
              label="vs last month"
            />
          </div>

          {/* Charts & Transactions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 h-[400px]">
             <div className="lg:col-span-2 h-full">
               <CashFlowChart />
             </div>
             <div className="h-full">
               <RecentTransactions />
             </div>
          </div>
          
          <EmployeesTable />
        </main>
      </div>
    </div>
  );
}
