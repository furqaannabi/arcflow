import { useState } from "react";
import { X, Plus, Trash2, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SUPPORTED_CHAINS } from "@/contexts/AuthContext";

interface CreatePayrollModalProps {
  onClose: () => void;
}

interface Employee {
  id: number;
  name: string;
  role: string;
  amount: string;
  walletAddress: string;
  destinationChain: string;
}

const ARC_TESTNET = {
  id: 5042002,
  name: "Arc Testnet",
  key: "arcTestnet"
};

export default function CreatePayrollModal({ onClose }: CreatePayrollModalProps) {
  const [step, setStep] = useState(1);
  const [payrollName, setPayrollName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([
    { id: 1, name: "", role: "", amount: "", walletAddress: "", destinationChain: "arcTestnet" }
  ]);

  const addEmployee = () => {
    setEmployees([
      ...employees,
      { id: Date.now(), name: "", role: "", amount: "", walletAddress: "", destinationChain: "arcTestnet" }
    ]);
  };

  const removeEmployee = (id: number) => {
    setEmployees(employees.filter(e => e.id !== id));
  };

  const updateEmployee = (id: number, field: keyof Employee, value: string) => {
    setEmployees(employees.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const totalAmount = employees.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

  const formatDateRange = (start: string, end: string) => {
    if (!start || !end) return "";
    const startDate = new Date(start);
    const endDate = new Date(end);
    return `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-card rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-100 dark:border-border transition-colors duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-border transition-colors duration-300">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-foreground">Create New Payroll</h2>
            <p className="text-sm text-gray-500 dark:text-muted-foreground">Step {step} of 3</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-foreground transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <div className="space-y-6 max-w-md mx-auto py-10">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-foreground">Payroll Name</label>
                <input
                  type="text"
                  placeholder="e.g. March Engineering Payroll"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-input bg-white dark:bg-background rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-900 dark:text-foreground placeholder:text-gray-400 dark:placeholder:text-muted-foreground"
                  value={payrollName}
                  onChange={(e) => setPayrollName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-foreground">Period Start</label>
                  <input
                    type="date"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-input bg-white dark:bg-background rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-900 dark:text-foreground"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-foreground">Period End</label>
                  <input
                    type="date"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-input bg-white dark:bg-background rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-900 dark:text-foreground"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-gray-900 dark:text-foreground">Add Employees</h3>
                <Button onClick={addEmployee} size="sm" variant="outline" className="gap-2 dark:text-foreground dark:border-border dark:hover:bg-muted">
                  <Plus className="w-4 h-4" /> Add Employee
                </Button>
              </div>

              {employees.map((employee) => (
                <div key={employee.id} className="p-4 bg-gray-50 dark:bg-muted/30 rounded-lg border border-gray-100 dark:border-border relative">
                  {employees.length > 1 && (
                    <button
                      onClick={() => removeEmployee(employee.id)}
                      className="absolute top-4 right-4 p-1 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-500 dark:text-muted-foreground">Name</label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-white dark:bg-background border border-gray-200 dark:border-input rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-900 dark:text-foreground placeholder:text-gray-400 dark:placeholder:text-muted-foreground"
                        value={employee.name}
                        onChange={(e) => updateEmployee(employee.id, 'name', e.target.value)}
                        placeholder="e.g. John Doe"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-500 dark:text-muted-foreground">Role</label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-white dark:bg-background border border-gray-200 dark:border-input rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-900 dark:text-foreground placeholder:text-gray-400 dark:placeholder:text-muted-foreground"
                        value={employee.role}
                        onChange={(e) => updateEmployee(employee.id, 'role', e.target.value)}
                        placeholder="e.g. Senior Engineer"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-500 dark:text-muted-foreground">Wallet Address</label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-white dark:bg-background border border-gray-200 dark:border-input rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-900 dark:text-foreground placeholder:text-gray-400 dark:placeholder:text-muted-foreground"
                        value={employee.walletAddress}
                        onChange={(e) => updateEmployee(employee.id, 'walletAddress', e.target.value)}
                        placeholder="0x..."
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-500 dark:text-muted-foreground">Destination Chain</label>
                      <select
                        className="w-full px-3 py-2 bg-white dark:bg-background border border-gray-200 dark:border-input rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-900 dark:text-foreground"
                        value={employee.destinationChain}
                        onChange={(e) => updateEmployee(employee.id, 'destinationChain', e.target.value)}
                      >
                        <option value="arcTestnet">{ARC_TESTNET.name}</option>
                        {Object.entries(SUPPORTED_CHAINS).map(([key, { chain }]) => (
                          <option key={key} value={key}>{chain.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-500 dark:text-muted-foreground">Amount (USDC)</label>
                      <input
                        type="number"
                        className="w-full px-3 py-2 bg-white dark:bg-background border border-gray-200 dark:border-input rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-900 dark:text-foreground placeholder:text-gray-400 dark:placeholder:text-muted-foreground"
                        value={employee.amount}
                        onChange={(e) => updateEmployee(employee.id, 'amount', e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {step === 3 && (
            <div className="max-w-xl mx-auto py-8">
              <div className="bg-gray-50 dark:bg-muted/30 rounded-xl p-8 text-center mb-8 border border-gray-100 dark:border-border">
                <Check className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-gray-900 dark:text-foreground mb-2">Ready to Create</h3>
                <p className="text-gray-500 dark:text-muted-foreground">Review the payroll details below</p>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between py-3 border-b border-gray-100 dark:border-border">
                  <span className="text-gray-500 dark:text-muted-foreground">Payroll Name</span>
                  <span className="font-medium text-gray-900 dark:text-foreground">{payrollName}</span>
                </div>
                <div className="flex justify-between py-3 border-b border-gray-100 dark:border-border">
                  <span className="text-gray-500 dark:text-muted-foreground">Pay Period</span>
                  <span className="font-medium text-gray-900 dark:text-foreground">{formatDateRange(startDate, endDate)}</span>
                </div>
                <div className="flex justify-between py-3 border-b border-gray-100 dark:border-border">
                  <span className="text-gray-500 dark:text-muted-foreground">Employees</span>
                  <span className="font-medium text-gray-900 dark:text-foreground">{employees.length}</span>
                </div>
                <div className="flex justify-between py-3 border-b border-gray-100 dark:border-border">
                  <span className="text-gray-500 dark:text-muted-foreground">Total Amount</span>
                  <span className="text-xl font-bold text-blue-600 dark:text-blue-400">{totalAmount.toLocaleString()} USDC</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 dark:border-border bg-gray-50 dark:bg-muted/50 flex justify-end gap-3 transition-colors duration-300">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} className="dark:text-foreground dark:border-border dark:hover:bg-muted">
              Back
            </Button>
          )}
          {step < 3 ? (
            <Button
              className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white gap-2"
              onClick={() => setStep(step + 1)}
              disabled={step === 1 && (!payrollName || !startDate || !endDate)}
            >
              Next Step <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              className="bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700 text-white gap-2"
              onClick={onClose} // Just close for mock
            >
              Create Payroll <Check className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
