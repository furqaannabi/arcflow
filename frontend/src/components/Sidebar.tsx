import { useState } from "react";
import { Link } from "react-router-dom";
import { MessageSquare, Plus, Sun, Moon, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";

interface ChatSession {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
}

export default function Sidebar() {
  const { theme, setTheme } = useTheme();
  const [sessions, setSessions] = useState<ChatSession[]>([
    {
      id: "1",
      title: "Payroll Setup",
      lastMessage: "Set payroll date to March 1st",
      timestamp: new Date(Date.now() - 3600000),
    },
    {
      id: "2",
      title: "USDC Approval",
      lastMessage: "Approve 1000 USDC for router",
      timestamp: new Date(Date.now() - 7200000),
    },
  ]);
  const [activeSessionId, setActiveSessionId] = useState<string>("1");

  const handleNewChat = () => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: "New Chat",
      lastMessage: "",
      timestamp: new Date(),
    };
    setSessions([newSession, ...sessions]);
    setActiveSessionId(newSession.id);
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions(sessions.filter((s) => s.id !== id));
    if (activeSessionId === id && sessions.length > 1) {
      setActiveSessionId(sessions[0].id === id ? sessions[1].id : sessions[0].id);
    }
  };

  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / 3600000);
    
    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="w-64 min-h-screen bg-white dark:bg-card border-r border-gray-100 dark:border-border p-4 flex flex-col transition-colors duration-300">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 px-2">
        <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
            A
          </div>
          <span className="text-xl font-bold text-gray-900 dark:text-foreground">ArcFlow</span>
        </Link>
      </div>

      {/* New Chat Button */}
      <button
        onClick={handleNewChat}
        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 mb-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
      >
        <Plus className="w-4 h-4" />
        New Chat
      </button>

      {/* Chat Sessions */}
      <div className="flex-1 overflow-y-auto space-y-1">
        <div className="text-xs font-semibold text-gray-500 dark:text-muted-foreground px-2 mb-2">
          RECENT CHATS
        </div>
        {sessions.map((session) => (
          <div
            key={session.id}
            onClick={() => setActiveSessionId(session.id)}
            className={cn(
              "group relative px-3 py-2.5 rounded-lg cursor-pointer transition-colors",
              activeSessionId === session.id
                ? "bg-blue-50 dark:bg-blue-900/20"
                : "hover:bg-gray-50 dark:hover:bg-accent"
            )}
          >
            <div className="flex items-start gap-2">
              <MessageSquare
                className={cn(
                  "w-4 h-4 mt-0.5 shrink-0",
                  activeSessionId === session.id
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-gray-400 dark:text-gray-500"
                )}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3
                    className={cn(
                      "text-sm font-medium truncate",
                      activeSessionId === session.id
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-gray-900 dark:text-foreground"
                    )}
                  >
                    {session.title}
                  </h3>
                  <button
                    onClick={(e) => handleDeleteSession(session.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded transition-opacity"
                  >
                    <Trash2 className="w-3 h-3 text-red-500" />
                  </button>
                </div>
                {session.lastMessage && (
                  <p className="text-xs text-gray-500 dark:text-muted-foreground truncate mt-0.5">
                    {session.lastMessage}
                  </p>
                )}
                <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">
                  {formatTimestamp(session.timestamp)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Theme Toggle */}
      <div className="pt-4 border-t border-gray-100 dark:border-border mt-4">
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
