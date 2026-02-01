import { useAuth, SUPPORTED_CHAINS } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ChainSwitcher from "@/components/ChainSwitcher";

export default function Dashboard() {
  const { userAddress, disconnect, currentChain } = useAuth();
  const chainName = SUPPORTED_CHAINS[currentChain]?.chain.name || 'Unknown';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg"></div>
            <span className="text-lg font-semibold">ArcFlow</span>
          </div>
          <div className="flex items-center gap-4">
            <ChainSwitcher />
            <div className="flex flex-col items-end">
              <div className="px-3 py-1.5 bg-gray-100 rounded-lg text-sm font-mono">
                {userAddress?.slice(0, 6)}...{userAddress?.slice(-4)}
              </div>
              <div className="text-xs text-gray-500 mt-1">{chainName}</div>
            </div>
            <Button onClick={disconnect} variant="ghost" size="sm">
              Disconnect
            </Button>
          </div>
        </div>
      </nav>

      {/* Dashboard Content */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-8">Dashboard</h1>
        
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-gray-600 mb-1">Treasury Balance</div>
              <div className="text-3xl font-bold">$0.00</div>
              <div className="text-xs text-gray-500 mt-1">Coming soon</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-gray-600 mb-1">Yield Earned</div>
              <div className="text-3xl font-bold text-green-600">$0.00</div>
              <div className="text-xs text-gray-500 mt-1">Coming soon</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-gray-600 mb-1">Next Payroll</div>
              <div className="text-3xl font-bold">--</div>
              <div className="text-xs text-gray-500 mt-1">Not scheduled</div>
            </CardContent>
          </Card>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Welcome to ArcFlow</h2>
          <p className="text-gray-600 mb-6">
            Your wallet is connected. Dashboard features coming soon!
          </p>
          <Button disabled>Deposit Funds (Coming Soon)</Button>
        </div>
      </div>
    </div>
  );
}
