import { useState, useRef, useEffect } from "react";
import { Send, Bot, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import ChatMessage from "@/components/chat/ChatMessage";
import CSVUpload from "@/components/chat/CSVUpload";
import Sidebar from "@/components/Sidebar";
import ConnectButton from "@/components/ConnectButton";

// Define message type locally matching what ChatMessage expects
interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

const AGENT_API_URL = "http://localhost:3001";

export default function AgentChat() {
  const { userAddress } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    // { role: "assistant", content: "Hello! I'm ArcFlow Agent. I can help you manage your payrolls. You can ask me to set a payroll date, calculate yields, or upload an employee CSV." }
  ]);
  const [input, setInput] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // Session ID will be returned by the backend on first message
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
    const userMsg: Message = { role: "user", content: currentInput || (currentFiles.length > 0 ? `Uploaded ${currentFiles.length} file(s)` : "") };
    setMessages((prev) => [...prev, userMsg]);

    try {
      // Helper to send a single request
      const sendRequest = async (file?: File, msg?: string) => {
        let body;
        const headers: Record<string, string> = {};

        if (file) {
          const formData = new FormData();
          if (msg) formData.append("message", msg);
          if (sessionId) formData.append("sessionId", sessionId);
          if (userAddress) formData.append("userAddress", userAddress);
          formData.append("file", file);
          body = formData;
          // Content-Type header is set automatically for FormData
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

        const data = await response.json();
        
        if (data.error) {
          throw new Error(data.error);
        }

        // Store session ID if returned
        if (data.sessionId && !sessionId) {
            setSessionId(data.sessionId);
        }

        return data; // Return full data to handle 'allowFileUpload' if needed
      };

      if (currentFiles.length > 0) {
        // Send files sequentially
        for (let i = 0; i < currentFiles.length; i++) {
          const file = currentFiles[i];
          // Attach text input only to the first file request
          const msgToSend = i === 0 ? currentInput : undefined; 
          
          // Add system message for upload progress
          if (currentFiles.length > 1) {
             setMessages((prev) => [...prev, { role: "system", content: `Uploading ${file.name}...` }]);
          }

          const data = await sendRequest(file, msgToSend);
          setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
        }
      } else {
        // Text only
        const data = await sendRequest(undefined, currentInput);
        
        // Check for transactions and append to content so ChatMessage renders it
        let content = data.response;
        if (data.transactions && data.transactions.length > 0) {
          const tx = data.transactions[0];
          content += `\n\n\`\`\`json\n${JSON.stringify({
            to: tx.to,
            data: tx.data,
            description: tx.description,
            value: tx.value,
            payrollDate: tx.payrollDate,
            recipientCount: tx.recipientCount
          }, null, 2)}\n\`\`\``;
        }

        setMessages((prev) => [...prev, { role: "assistant", content }]);
      }

    } catch (error) {
      console.error("Chat error:", error);
      let errorMessage = (error as Error).message || "Failed to communicate with agent.";
      
      if (errorMessage.includes("File upload not allowed")) {
        errorMessage = "Please ask the agent first before uploading (e.g., 'I want to upload payroll').";
      }
      
      setMessages((prev) => [...prev, { role: "system", content: `Error: ${errorMessage}` }]);
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background flex transition-colors duration-300">
      <Sidebar />

      <div className="flex-1 flex flex-col h-screen">
        {/* Header */}
        <header className="bg-white dark:bg-card border-b border-gray-100 dark:border-border h-16 px-8 flex items-center justify-between shrink-0 transition-colors duration-300">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Bot className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-foreground">AI Assistant</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <ConnectButton />
          </div>
        </header>

        {/* Chat Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4">
          <div className="max-w-5xl mx-auto w-full flex flex-col">
            {messages.map((msg, idx) => (
              <ChatMessage 
                key={idx} 
                role={msg.role} 
                content={msg.content} 
                onTransactionSuccess={(txHash) => handleSendMessage(`Transaction approved! Hash: ${txHash}`)}
              />
            ))}
            {isLoading && (
              <div className="flex justify-start mb-4">
                 <div className="bg-gray-100 dark:bg-muted rounded-2xl rounded-tl-sm px-4 py-3 border border-gray-200 dark:border-border flex items-center gap-2 transition-colors duration-300">
                    <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                 </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* Input Area */}
        <div className="bg-white dark:bg-card border-t border-gray-100 dark:border-border p-6 shrink-0 transition-colors duration-300">
          <div className="max-w-5xl mx-auto w-full flex flex-col gap-3">
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
            
            <div className="flex items-center gap-3">
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
                  placeholder={selectedFiles.length > 0 ? "Add a message with your files..." : "Ask about payroll, yields, or generate a transaction..."}
                  className="w-full px-6 py-4 text-base border border-gray-200 dark:border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm bg-transparent dark:text-foreground placeholder:text-muted-foreground resize-none min-h-[52px] max-h-[200px] overflow-y-auto"
                  disabled={isLoading}
                />
              </div>
              
              <Button 
                onClick={() => handleSendMessage()}
                disabled={isLoading || (!input.trim() && selectedFiles.length === 0)} 
                className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white h-[52px] w-14 rounded-xl flex-shrink-0"
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
