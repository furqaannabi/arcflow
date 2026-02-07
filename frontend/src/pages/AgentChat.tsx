import { useState, useRef, useEffect } from "react";
import { Send, Bot, FileText, X, Sparkles, TrendingUp, Users, Menu, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import ChatMessage from "@/components/chat/ChatMessage";
import CSVUpload from "@/components/chat/CSVUpload";
import Sidebar from "@/components/Sidebar";
import ConnectButton from "@/components/ConnectButton";
import PayrollsPanel from "@/components/PayrollsPanel";

// Define message type locally matching what ChatMessage expects
interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

const AGENT_API_URL = "http://localhost:3001";

function WelcomeScreen({ onSuggestionClick }: { onSuggestionClick: (text: string) => void }) {
  const suggestions = [
    {
      icon: TrendingUp,
      text: "Check yields on Base",
      prompt: "What are the current yields for USDC on Base?",
      color: "text-green-500 bg-green-50 dark:bg-green-900/20 dark:text-green-400"
    },
    {
      icon: Users,
      text: "Draft a new payroll",
      prompt: "I want to draft a new payroll for my team.",
      color: "text-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400"
    }
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in-95 duration-500">
      <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-blue-500/20">
        <Sparkles className="w-8 h-8 text-white" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
        Welcome to ArcFlow Agent
      </h2>
      <p className="text-gray-500 dark:text-gray-400 max-w-md mb-8">
        I can help you manage payrolls, optimize yields, and execute cross-chain transactions seamlessly.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onSuggestionClick(s.prompt)}
            className="flex flex-col items-center p-4 bg-white dark:bg-card border border-gray-100 dark:border-border rounded-xl hover:border-blue-200 dark:hover:border-blue-800 hover:shadow-md transition-all group text-left"
          >
            <div className={`p-3 rounded-lg mb-3 ${s.color} group-hover:scale-110 transition-transform`}>
              <s.icon className="w-5 h-5" />
            </div>
            <span className="font-medium text-sm text-gray-700 dark:text-gray-300">
              {s.text}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AgentChat() {
  const { userAddress } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [payrollsPanelOpen, setPayrollsPanelOpen] = useState(false);
  // Backend session ID for API calls
  const [sessionId, setSessionId] = useState<string | null>(null);
  // Frontend session ID for localStorage persistence
  const [frontendSessionId, setFrontendSessionId] = useState<string>(() => {
    // Try to load last active session from localStorage
    const storedActiveSession = localStorage.getItem('arcflow_active_session');
    return storedActiveSession || Date.now().toString();
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load messages from localStorage when frontendSessionId changes
  useEffect(() => {
    const stored = localStorage.getItem(`arcflow_messages_${frontendSessionId}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const restored = parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
        setMessages(restored);
      } catch (e) {
        console.error('Failed to parse messages from localStorage', e);
        setMessages([]);
      }
    } else {
      setMessages([]);
    }
    // Reset backend session when switching frontend sessions
    setSessionId(null);
  }, [frontendSessionId]);

  // Save messages to localStorage whenever they change
  const [messagesVersion, setMessagesVersion] = useState(0);
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(`arcflow_messages_${frontendSessionId}`, JSON.stringify(messages));
      setMessagesVersion(v => v + 1); // Trigger Sidebar to check for new session
    }
  }, [messages, frontendSessionId]);

  // Save active session to localStorage
  useEffect(() => {
    localStorage.setItem('arcflow_active_session', frontendSessionId);
  }, [frontendSessionId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSendMessage = async (overrideContent?: string) => {
    const messageContent = typeof overrideContent === "string" ? overrideContent : input;

    if ((!messageContent.trim() && selectedFiles.length === 0) || isLoading) return;

    const currentFiles = [...selectedFiles];
    const currentInput = messageContent;

    // Clear input state immediately ONLY IF it was typed input
    if (!overrideContent) {
        setInput("");
    }
    setSelectedFiles([]);
    setIsLoading(true);

    // Optimistically add user message
    const userMsg: Message = { 
        role: "user", 
        content: currentInput || (currentFiles.length > 0 ? `Uploaded ${currentFiles.length} file(s)` : ""),
        timestamp: new Date()
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      // SSE stream handler for a single request
      const sendStreamingRequest = async (file?: File, msg?: string) => {
        let body: FormData | string;
        const headers: Record<string, string> = {};

        if (file) {
          const formData = new FormData();
          if (msg) formData.append("message", msg);
          if (sessionId) formData.append("sessionId", sessionId);
          if (userAddress) formData.append("userAddress", userAddress);
          formData.append("file", file);
          body = formData;
        } else {
          body = JSON.stringify({
            message: msg,
            sessionId: sessionId || undefined,
            userAddress,
          });
          headers["Content-Type"] = "application/json";
        }

        const response = await fetch(`${AGENT_API_URL}/api/chat`, {
          method: "POST",
          headers,
          body,
        });

        if (!response.ok || !response.body) {
          throw new Error("Failed to connect to agent");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let streamedContent = "";
        let transactions: Array<{ to: string; data: string; description: string; [key: string]: any }> = [];

        // Add placeholder assistant message that we'll update
        const assistantMsgIndex = (await new Promise<number>((resolve) => {
          setMessages((prev) => {
            const newMessages = [...prev, { role: "assistant" as const, content: "", timestamp: new Date() }];
            resolve(newMessages.length - 1);
            return newMessages;
          });
        }));

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              const eventType = line.slice(7).trim();
              continue;
            }
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                
                // Handle different event types
                if (data.content !== undefined) {
                  // Token event - append content
                  streamedContent += data.content;
                  setMessages((prev) => {
                    const updated = [...prev];
                    if (updated[assistantMsgIndex]) {
                      updated[assistantMsgIndex] = { ...updated[assistantMsgIndex], content: streamedContent };
                    }
                    return updated;
                  });
                } else if (data.sessionId && !sessionId) {
                  // Session event
                  setSessionId(data.sessionId);
                } else if (data.error) {
                  // Error event
                  throw new Error(data.error);
                } else if (data.transactions) {
                  // Done event with transactions
                  transactions = data.transactions;
                }
              } catch (e) {
                if ((e as Error).message !== "Unexpected end of JSON input") {
                  console.error("SSE parse error:", e);
                }
              }
            }
          }
        }

        // Append transaction JSON if present
        if (transactions.length > 0) {
          const tx = transactions[0];
          const txJson = `\n\n\`\`\`json\n${JSON.stringify({
            to: tx.to,
            data: tx.data,
            description: tx.description,
            value: tx.value,
            payrollDate: tx.payrollDate,
            recipientCount: tx.recipientCount
          }, null, 2)}\n\`\`\``;
          
          setMessages((prev) => {
            const updated = [...prev];
            if (updated[assistantMsgIndex]) {
              updated[assistantMsgIndex] = { 
                ...updated[assistantMsgIndex], 
                content: streamedContent + txJson 
              };
            }
            return updated;
          });
        }

        return { response: streamedContent, transactions };
      };

      if (currentFiles.length > 0) {
        // Send files sequentially
        for (let i = 0; i < currentFiles.length; i++) {
          const file = currentFiles[i];
          const msgToSend = i === 0 ? currentInput : undefined; 
          
          if (currentFiles.length > 1) {
             setMessages((prev) => [...prev, { role: "system", content: `Uploading ${file.name}...`, timestamp: new Date() }]);
          }

          await sendStreamingRequest(file, msgToSend);
        }
      } else {
        // Text only
        await sendStreamingRequest(undefined, currentInput);
      }

    } catch (error) {
      console.error("Chat error:", error);
      let errorMessage = (error as Error).message || "Failed to communicate with agent.";
      
      if (errorMessage.includes("File upload not allowed")) {
        errorMessage = "Please ask the agent first before uploading (e.g., 'I want to upload payroll').";
      }
      
      setMessages((prev) => [...prev, { role: "system", content: `Error: ${errorMessage}`, timestamp: new Date() }]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px"; // Max height 200px
  };

  const handleNewChat = () => {
    const newId = Date.now().toString();
    setFrontendSessionId(newId);
    setMessages([]);
    setSessionId(null);
    setInput("");
    setSelectedFiles([]);
    inputRef.current?.focus();
  };

  const handleSessionChange = (newSessionId: string) => {
    if (newSessionId !== frontendSessionId) {
      setFrontendSessionId(newSessionId);
      setInput("");
      setSelectedFiles([]);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background flex transition-colors duration-300">
      <Sidebar 
        onNewChat={handleNewChat} 
        onSessionChange={handleSessionChange} 
        activeSessionId={frontendSessionId} 
        messagesVersion={messagesVersion}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col h-screen">
        {/* Header */}
        <header className="bg-white dark:bg-card border-b border-gray-100 dark:border-border h-16 px-4 md:px-8 flex items-center justify-between shrink-0 transition-colors duration-300">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-accent md:hidden"
            >
              <Menu className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Bot className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-foreground">AI Assistant</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <button
              onClick={() => setPayrollsPanelOpen(!payrollsPanelOpen)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors"
            >
              <Receipt className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <span className="hidden md:inline text-sm font-medium text-gray-700 dark:text-gray-300">Payrolls</span>
            </button>
            <ConnectButton />
          </div>
        </header>

        {/* Chat Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col">
          {messages.length === 0 ? (
            <WelcomeScreen onSuggestionClick={handleSendMessage} />
          ) : (
            <div className="max-w-4xl mx-auto w-full flex flex-col">
              {messages.map((msg, idx) => (
                <ChatMessage 
                  key={idx} 
                  role={msg.role} 
                  content={msg.content} 
                  timestamp={msg.timestamp}
                  onTransactionSuccess={(txHash) => handleSendMessage(`Transaction approved! Hash: ${txHash}`)}
                />
              ))}
              {isLoading && (
                <div className="flex justify-start mb-6 ml-11 animate-in fade-in slide-in-from-bottom-2">
                   <div className="bg-gray-100 dark:bg-muted rounded-2xl rounded-tl-sm px-4 py-3 border border-gray-200 dark:border-border flex items-center gap-1.5 transition-colors duration-300">
                      <div className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                   </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        {/* Input Area */}
        <div className="bg-white dark:bg-card border-t border-gray-100 dark:border-border p-6 shrink-0 transition-colors duration-300">
          <div className="max-w-4xl mx-auto w-full flex flex-col gap-3">
            {selectedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 animate-in fade-in slide-in-from-bottom-2">
                {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-800 text-sm">
                        <div className="p-1 bg-white dark:bg-blue-950 rounded-md">
                        <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <span className="font-medium max-w-[200px] truncate">{file.name}</span>
                        <span className="text-blue-400 dark:text-blue-500 text-xs">({(file.size / 1024).toFixed(1)} KB)</span>
                        <button 
                        onClick={() => removeFile(index)}
                        className="ml-2 hover:bg-blue-100 dark:hover:bg-blue-800 p-1 rounded-full transition-colors"
                        >
                        <X className="w-3 h-3" />
                        </button>
                    </div>
                ))}
              </div>
            )}
            
            <div className="flex items-center gap-2 md:gap-3">
              <CSVUpload 
                onFilesSelect={(files) => setSelectedFiles(prev => [...prev, ...files])} 
                disabled={isLoading} 
              />
              
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={input}
                  onChange={handleInput}
                  onKeyDown={handleKeyDown}
                  placeholder={selectedFiles.length > 0 ? "Add a message..." : "Ask anything..."}
                  className="w-full px-3 md:px-6 py-3 md:py-4 text-sm md:text-base border border-gray-200 dark:border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm bg-transparent dark:text-foreground placeholder:text-muted-foreground resize-none min-h-[44px] md:min-h-[52px] max-h-[200px] overflow-y-auto"
                  disabled={isLoading}
                />
              </div>
              
              <Button 
                onClick={() => handleSendMessage()}
                disabled={isLoading || (!input.trim() && selectedFiles.length === 0)} 
                className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white h-[44px] md:h-[52px] w-11 md:w-14 rounded-xl flex-shrink-0"
              >
                <Send className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
