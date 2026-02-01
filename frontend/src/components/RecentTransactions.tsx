import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MoreHorizontal } from "lucide-react";

interface Transaction {
  id: string;
  name: string;
  ref: string;
  amount: string;
  date: string;
  logo: string; // Emoji for now
  logoBg: string;
}

const TRANSACTIONS: Transaction[] = [
  {
    id: '1',
    name: 'Alfonso West',
    ref: '123*******78',
    amount: '$124.00',
    date: 'July 24, 2024',
    logo: '🏛️',
    logoBg: 'bg-gray-100',
  },
  {
    id: '2',
    name: 'Stripe',
    ref: '123*******78',
    amount: '$452.00',
    date: 'July 24, 2024',
    logo: 'S',
    logoBg: 'bg-indigo-600 text-white',
  },
  {
    id: '3',
    name: 'Shopify',
    ref: '123*******78',
    amount: '-$120.50',
    date: 'July 23, 2024',
    logo: '🛍️',
    logoBg: 'bg-green-100',
  },
  {
    id: '4',
    name: 'Adison Levin',
    ref: '123*******78',
    amount: '$203.00',
    date: 'July 23, 2024',
    logo: 'P',
    logoBg: 'bg-blue-600 text-white', // PayPal style
  },
  {
    id: '5',
    name: 'Alfonso West',
    ref: '123*******78',
    amount: '$124.00',
    date: 'July 24, 2024',
    logo: '🏛️',
    logoBg: 'bg-gray-100',
  },
];

export default function RecentTransactions() {
  return (
    <Card className="shadow-none border border-gray-100 h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium">Recent Transactions</CardTitle>
        <button className="text-gray-400 hover:text-gray-600">
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </CardHeader>
      <CardContent className="mt-4">
        <div className="space-y-6">
          {TRANSACTIONS.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${tx.logoBg}`}>
                  {tx.logo}
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">{tx.name}</div>
                  <div className="text-xs text-gray-500">{tx.ref}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-gray-900">{tx.amount}</div>
                <div className="text-xs text-gray-400">View</div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
