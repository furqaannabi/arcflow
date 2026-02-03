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
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Create New Payroll</h2>
            <p className="text-sm text-gray-500">Step {step} of 3</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <div className="space-y-6 max-w-md mx-auto py-10">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Payroll Name</label>
                <input
                  type="text"
                  placeholder="e.g. March Engineering Payroll"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={payrollName}
                  onChange={(e) => setPayrollName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Period Start</label>
                  <input
                    type="date"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Period End</label>
                  <input
                    type="date"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                <h3 className="font-semibold text-gray-900">Add Employees</h3>
                <Button onClick={addEmployee} size="sm" variant="outline" className="gap-2">
                  <Plus className="w-4 h-4" /> Add Employee
                </Button>
              </div>

              {employees.map((employee) => (
                <div key={employee.id} className="p-4 bg-gray-50 rounded-lg border border-gray-100 relative">
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
                      <label className="text-xs font-medium text-gray-500">Name</label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        value={employee.name}
                        onChange={(e) => updateEmployee(employee.id, 'name', e.target.value)}
                        placeholder="e.g. John Doe"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-500">Role</label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        value={employee.role}
                        onChange={(e) => updateEmployee(employee.id, 'role', e.target.value)}
                        placeholder="e.g. Senior Engineer"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-500">Wallet Address</label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        value={employee.walletAddress}
                        onChange={(e) => updateEmployee(employee.id, 'walletAddress', e.target.value)}
                        placeholder="0x..."
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-500">Destination Chain</label>
                      <select
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                      <label className="text-xs font-medium text-gray-500">Amount (USDC)</label>
                      <input
                        type="number"
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
              <div className="bg-gray-50 rounded-xl p-8 text-center mb-8">
                <Check className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Ready to Create</h3>
                <p className="text-gray-500">Review the payroll details below</p>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between py-3 border-b border-gray-100">
                  <span className="text-gray-500">Payroll Name</span>
                  <span className="font-medium">{payrollName}</span>
                </div>
                <div className="flex justify-between py-3 border-b border-gray-100">
                  <span className="text-gray-500">Pay Period</span>
                  <span className="font-medium">{formatDateRange(startDate, endDate)}</span>
                </div>
                <div className="flex justify-between py-3 border-b border-gray-100">
                  <span className="text-gray-500">Employees</span>
                  <span className="font-medium">{employees.length}</span>
                </div>
                <div className="flex justify-between py-3 border-b border-gray-100">
                  <span className="text-gray-500">Total Amount</span>
                  <span className="text-xl font-bold text-blue-600">{totalAmount.toLocaleString()} USDC</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          {step < 3 ? (
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
              onClick={() => setStep(step + 1)}
              disabled={step === 1 && (!payrollName || !startDate || !endDate)}
            >
              Next Step <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              className="bg-green-600 hover:bg-green-700 text-white gap-2"
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
