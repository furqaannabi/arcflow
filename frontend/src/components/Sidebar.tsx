import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  CreditCard, 
  Settings, 
  Bot,
  Sun,
  Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: CreditCard, label: "Payroll", path: "/payroll" },
  { icon: Bot, label: "AI Assistant", path: "/chat" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

export default function Sidebar() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="w-64 min-h-screen bg-white dark:bg-card border-r border-gray-100 dark:border-border p-6 flex flex-col transition-colors duration-300">
      <div className="flex items-center gap-2 mb-10 px-2">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
          A
        </div>
        <span className="text-xl font-bold text-gray-900 dark:text-foreground">ArcFlow</span>
      </div>

      <nav className="space-y-1 flex-1">
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path;
          
          return (
            <Link
              key={item.label}
              to={item.path}
              className={cn(
                "flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive 
                  ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400" 
                  : "text-gray-600 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-accent hover:text-gray-900 dark:hover:text-accent-foreground"
              )}
            >
              <div className="flex items-center gap-3">
                <item.icon className={cn("w-5 h-5", isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-gray-500")} />
                {item.label}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="pt-4 border-t border-gray-100 dark:border-border">
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm font-medium text-gray-600 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-accent hover:text-gray-900 dark:hover:text-accent-foreground transition-all"
        >
          {theme === "dark" ? (
             <Sun className="w-5 h-5 text-gray-400 dark:text-gray-500" />
          ) : (
             <Moon className="w-5 h-5 text-gray-400" />
          )}
          <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
        </button>
      </div>
    </div>
  );
}
