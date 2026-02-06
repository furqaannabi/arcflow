import { ArrowUpRight, ArrowDownRight, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

interface StatsCardProps {
  title: string;
  value: string;
  trend: "up" | "down";
  percentage: string;
  label: string; // e.g. "vs last month"
}

export default function StatsCard({ title, value, trend, percentage, label }: StatsCardProps) {
  const isPositive = trend === "up";

  return (
    <Card className="shadow-none border border-gray-100 dark:border-border bg-white dark:bg-card">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-gray-500">{title}</span>
          <button className="text-gray-400 hover:text-gray-600">
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="text-3xl font-semibold text-gray-900 dark:text-foreground">{value}</div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">{label}</span>
            <div className={cn(
              "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
              isPositive 
                ? "bg-green-50 text-green-600"
                : "bg-red-50 text-red-600"
            )}>
              {isPositive ? (
                <ArrowUpRight className="w-3 h-3" />
              ) : (
                <ArrowDownRight className="w-3 h-3" />
              )}
              {percentage}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
