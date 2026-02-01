import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  CreditCard, 
  Settings, 
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: CreditCard, label: "Payroll", path: "/payroll" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <div className="w-64 min-h-screen bg-white border-r border-gray-100 p-6 flex flex-col">
      <div className="flex items-center gap-2 mb-10 px-2">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
          A
        </div>
        <span className="text-xl font-bold text-gray-900">ArcFlow</span>
      </div>

      <nav className="space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path;
          
          return (
            <Link
              key={item.label}
              to={item.path}
              className={cn(
                "flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive 
                  ? "bg-blue-50 text-blue-600" 
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <div className="flex items-center gap-3">
                <item.icon className={cn("w-5 h-5", isActive ? "text-blue-600" : "text-gray-400")} />
                {item.label}
              </div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
