import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Filter, User } from "lucide-react";

// Mock data for employees
const EMPLOYEES = [
  { id: 1, name: "Alice Johnson", role: "Software Engineer", salary: "5,000 USDC", status: "Active" },
  { id: 2, name: "Bob Smith", role: "Product Manager", salary: "5,500 USDC", status: "Active" },
  { id: 3, name: "Charlie Brown", role: "Designer", salary: "4,800 USDC", status: "On Leave" },
  { id: 4, name: "Diana Prince", role: "DevOps", salary: "5,200 USDC", status: "Active" },
];

export default function EmployeesTable() {
  return (
    <Card className="shadow-none border border-gray-100 dark:border-border mt-6 overflow-hidden transition-colors duration-300 bg-white dark:bg-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2 bg-white dark:bg-card border-b border-gray-100 dark:border-border transition-colors duration-300">
        <CardTitle className="text-base font-medium text-gray-900 dark:text-foreground">Active Employees</CardTitle>
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
                <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 dark:text-muted-foreground uppercase tracking-wider">Employee</th>
                <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 dark:text-muted-foreground uppercase tracking-wider">Role</th>
                <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 dark:text-muted-foreground uppercase tracking-wider">Salary</th>
                <th className="py-3 px-6 text-right text-xs font-medium text-gray-500 dark:text-muted-foreground uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-border bg-white dark:bg-card">
              {EMPLOYEES.map((employee) => (
                <tr key={employee.id} className="hover:bg-gray-50/50 dark:hover:bg-muted/50 transition-colors">
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                        <User className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-medium text-gray-900 dark:text-foreground">{employee.name}</span>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-sm text-gray-500 dark:text-muted-foreground">{employee.role}</td>
                  <td className="py-4 px-6 text-sm font-medium text-gray-900 dark:text-foreground">{employee.salary}</td>
                  <td className="py-4 px-6 text-right">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      employee.status === 'Active' 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                    }`}>
                      {employee.status}
                    </span>
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
