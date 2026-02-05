import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Filter, Eye, Play, Pause } from "lucide-react";

// Mock data
const PAYROLLS = [
  { id: 1, name: "Feb Engineering", dept: "Engineering", period: "Feb 1 - Feb 28", employees: 12, total: "48,200 USDC", status: "Active" },
  { id: 2, name: "Feb Sales", dept: "Sales", period: "Feb 1 - Feb 28", employees: 8, total: "32,500 USDC", status: "Paused" },
  { id: 3, name: "Jan Engineering", dept: "Engineering", period: "Jan 1 - Jan 31", employees: 11, total: "45,000 USDC", status: "Completed" },
];

export default function ActivePayrollsTable({ onViewDetails }: { onViewDetails: (id: number) => void }) {
  return (
    <Card className="shadow-none border border-gray-100 dark:border-border mt-6 overflow-hidden transition-colors duration-300 bg-white dark:bg-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2 bg-white dark:bg-card border-b border-gray-100 dark:border-border transition-colors duration-300">
        <CardTitle className="text-base font-medium text-gray-900 dark:text-foreground">Active Payrolls</CardTitle>
        <button className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-muted-foreground hover:text-gray-900 dark:hover:text-foreground transition-colors">
          <Filter className="w-3.5 h-3.5" />
          Filter
        </button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50/50 dark:bg-muted/50">
              <tr>
                <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 dark:text-muted-foreground uppercase tracking-wider">Payroll Name</th>
                <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 dark:text-muted-foreground uppercase tracking-wider">Department</th>
                <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 dark:text-muted-foreground uppercase tracking-wider">Pay Period</th>
                <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 dark:text-muted-foreground uppercase tracking-wider">Employees</th>
                <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 dark:text-muted-foreground uppercase tracking-wider">Total Amount</th>
                <th className="py-3 px-6 text-right text-xs font-medium text-gray-500 dark:text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="py-3 px-6 text-right text-xs font-medium text-gray-500 dark:text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-border bg-white dark:bg-card">
              {PAYROLLS.map((payroll) => (
                <tr key={payroll.id} className="hover:bg-gray-50/50 dark:hover:bg-muted/50 transition-colors">
                  <td className="py-4 px-6 text-sm font-medium text-gray-900 dark:text-foreground">{payroll.name}</td>
                  <td className="py-4 px-6 text-sm text-gray-500 dark:text-muted-foreground">{payroll.dept}</td>
                  <td className="py-4 px-6 text-sm text-gray-500 dark:text-muted-foreground">{payroll.period}</td>
                  <td className="py-4 px-6 text-sm text-gray-500 dark:text-muted-foreground">{payroll.employees}</td>
                  <td className="py-4 px-6 text-sm font-medium text-gray-900 dark:text-foreground">{payroll.total}</td>
                  <td className="py-4 px-6 text-right">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      payroll.status === 'Completed' 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                        : payroll.status === 'Active'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                    }`}>
                      {payroll.status}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex justify-end gap-2">
                       {payroll.status === 'Active' && (
                         <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-500 dark:hover:text-amber-400 dark:hover:bg-amber-900/20">
                           <Pause className="w-4 h-4" />
                         </Button>
                       )}
                       {payroll.status === 'Paused' && (
                         <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50 dark:text-green-500 dark:hover:text-green-400 dark:hover:bg-green-900/20">
                           <Play className="w-4 h-4" />
                         </Button>
                       )}
                       <Button 
                         variant="ghost" 
                         size="icon" 
                         className="h-8 w-8 text-gray-400 hover:text-gray-900 dark:text-gray-500 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-muted"
                         onClick={() => onViewDetails(payroll.id)}
                       >
                         <Eye className="w-4 h-4" />
                       </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
