import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MoreHorizontal } from "lucide-react";

const data = [
  { name: 'Jan', treasury: 100, payroll: 30 },
  { name: 'Feb', treasury: 120, payroll: 32 },
  { name: 'Mar', treasury: 110, payroll: 30 },
  { name: 'Apr', treasury: 130, payroll: 35 },
  { name: 'Mei', treasury: 140, payroll: 32 },
  { name: 'Jun', treasury: 135, payroll: 30 },
  { name: 'Jul', treasury: 160, payroll: 40 },
  { name: 'Aug', treasury: 150, payroll: 35 },
  { name: 'Sep', treasury: 180, payroll: 42 },
  { name: 'Oct', treasury: 170, payroll: 38 },
  { name: 'Nov', treasury: 190, payroll: 45 },
  { name: 'Dec', treasury: 200, payroll: 40 },
];

export default function CashFlowChart() {
  return (
    <Card className="shadow-none border border-gray-100 h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-4">
          <CardTitle className="text-base font-medium">Treasury Growth</CardTitle>
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-blue-600"></div>
              <span className="text-gray-500">Balance</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-cyan-400"></div>
              <span className="text-gray-500">Payroll</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-50 rounded-lg p-0.5">
            <button className="px-3 py-1 text-xs font-medium text-gray-500 hover:text-gray-900">D</button>
            <button className="px-3 py-1 text-xs font-medium text-gray-900 bg-white shadow-sm rounded-md">M</button>
            <button className="px-3 py-1 text-xs font-medium text-gray-500 hover:text-gray-900">Y</button>
            <button className="px-3 py-1 text-xs font-medium text-gray-500 hover:text-gray-900">All</button>
          </div>
          <button className="text-gray-400 hover:text-gray-600">
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] w-full mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorExpand" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#94a3b8', fontSize: 12 }} 
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#94a3b8', fontSize: 12 }} 
                tickFormatter={(value) => `$${value}`}
              />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Area 
                type="monotone" 
                dataKey="treasury" 
                stroke="#2563eb" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorIncome)" 
              />
              <Area 
                type="monotone" 
                dataKey="payroll" 
                stroke="#06b6d4" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorExpand)" 
              />
              {/* Vertical dotted line for "July" similar to design */}
              <ReferenceLine x="Jul" stroke="#94a3b8" strokeDasharray="3 3" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
