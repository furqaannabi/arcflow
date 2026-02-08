import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { MessageSquare, Plus, Sun, Moon, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";

interface ChatSession {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
}

interface SidebarProps {
  onNewChat?: () => void;
  onSessionChange?: (sessionId: string) => void;
  activeSessionId?: string;
  messagesVersion?: number;
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ onNewChat, onSessionChange, activeSessionId: externalActiveSessionId, messagesVersion, isOpen = true, onClose }: SidebarProps) {
  const { theme, setTheme } = useTheme();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>(sessions[0]?.id || "1");
  // Use external active session if provided, otherwise manage locally
  const effectiveActiveSessionId = externalActiveSessionId || activeSessionId;

  // Load sessions from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('arcflow_sessions');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Restore Date objects
        const restored = parsed.map((s: any) => ({ ...s, timestamp: new Date(s.timestamp) }));
        setSessions(restored);
        if (restored.length > 0 && !externalActiveSessionId) {
          setActiveSessionId(restored[0].id);
        }
      } catch (e) {
        console.error('Failed to parse sessions from localStorage', e);
      }
    }
  }, []);

  // Save sessions to localStorage when they change
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem('arcflow_sessions', JSON.stringify(sessions));
    } else {
      // Clear localStorage when no sessions remain
      localStorage.removeItem('arcflow_sessions');
    }
  }, [sessions]);

  // Ensure externalActiveSessionId has a session entry (only if messages exist)
  // Also update title if it's a generic placeholder
  useEffect(() => {
    if (!externalActiveSessionId) return;
    
    const messagesJson = localStorage.getItem(`arcflow_messages_${externalActiveSessionId}`);
    if (!messagesJson) return;
    
    try {
      const messages = JSON.parse(messagesJson);
      const firstUserMsg = messages.find((m: any) => m.role === 'user');
      const titleFromMessage = firstUserMsg?.content?.slice(0, 30) || "Chat";
      const finalTitle = titleFromMessage + (titleFromMessage.length >= 30 ? "..." : "");
      
      // Check if session already exists
      const existingSession = sessions.find(s => s.id === externalActiveSessionId);
      
      if (existingSession) {
        // Update title if it's a generic placeholder
        if (existingSession.title === "Chat" || existingSession.title === "New Chat") {
          setSessions(prev => prev.map(s => 
            s.id === externalActiveSessionId ? { ...s, title: finalTitle } : s
          ));
        }
        return;
      }
      
      // Check localStorage to avoid race condition
      const storedSessions = localStorage.getItem('arcflow_sessions');
      if (storedSessions) {
        const parsed = JSON.parse(storedSessions);
        if (parsed.some((s: any) => s.id === externalActiveSessionId)) return;
      }
      
      // Create new session
      const newSession: ChatSession = {
        id: externalActiveSessionId,
        title: finalTitle,
        lastMessage: messages[messages.length - 1]?.content?.slice(0, 50) || "",
        timestamp: new Date(),
      };
      setSessions(prev => {
        if (prev.some(s => s.id === externalActiveSessionId)) return prev;
        return [newSession, ...prev];
      });
    } catch (e) {
      console.error('Failed to process session', e);
    }
  }, [externalActiveSessionId, messagesVersion]);

  const handleNewChat = () => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: "New Chat",
      lastMessage: "",
      timestamp: new Date(),
    };
    setSessions([newSession, ...sessions]);
    setActiveSessionId(newSession.id);
    if (onSessionChange) onSessionChange(newSession.id);
    if (onNewChat) onNewChat();
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Delete messages for this session
    localStorage.removeItem(`arcflow_messages_${id}`);
    
    const remainingSessions = sessions.filter((s) => s.id !== id);
    setSessions(remainingSessions);
    // Note: localStorage sync is handled by useEffect
    
    
    // If we're deleting the active session, switch to another one
    const isActiveSession = effectiveActiveSessionId === id;
    if (isActiveSession && remainingSessions.length > 0) {
      const nextSession = remainingSessions[0];
      setActiveSessionId(nextSession.id);
      localStorage.setItem('arcflow_active_session', nextSession.id);
      if (onSessionChange) onSessionChange(nextSession.id);
    } else if (isActiveSession && remainingSessions.length === 0) {
      // No sessions left, create a new one
      const newId = Date.now().toString();
      setActiveSessionId(newId);
      localStorage.setItem('arcflow_active_session', newId);
      if (onSessionChange) onSessionChange(newId);
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
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden" 
          onClick={onClose}
        />
      )}
      
      {/* Sidebar */}
      <div className={cn(
        "fixed md:relative z-50 w-64 h-screen bg-white dark:bg-card border-r border-gray-100 dark:border-border p-4 flex flex-col transition-all duration-300",
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        {/* Mobile close button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-accent md:hidden"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
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
        className="group flex items-center justify-center gap-2 w-full px-4 py-2.5 mb-4 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-all duration-200 hover:bg-blue-50 dark:hover:bg-blue-900/10"
      >
        <div className="p-1 rounded-lg bg-gray-100 dark:bg-gray-800 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30 transition-colors">
          <Plus className="w-4 h-4" />
        </div>
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
            onClick={() => {
              setActiveSessionId(session.id);
              if (onSessionChange) onSessionChange(session.id);
            }}
            className={cn(
              "group relative px-3 py-2.5 rounded-lg cursor-pointer transition-colors",
              effectiveActiveSessionId === session.id
                ? "bg-blue-50 dark:bg-blue-900/20"
                : "hover:bg-gray-50 dark:hover:bg-accent"
            )}
          >
            <div className="flex items-start gap-2">
              <MessageSquare
                className={cn(
                  "w-4 h-4 mt-0.5 shrink-0",
                  effectiveActiveSessionId === session.id
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
    </>
  );
}
