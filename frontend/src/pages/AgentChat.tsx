import { useState, useRef, useEffect } from "react";
import { Send, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import ChatMessage from "@/components/chat/ChatMessage";
import CSVUpload from "@/components/chat/CSVUpload";
import Sidebar from "@/components/Sidebar";
import ChainSwitcher from "@/components/ChainSwitcher";

// Define message type locally matching what ChatMessage expects
interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

const AGENT_API_URL = "http://localhost:3001";

export default function AgentChat() {
  const { userAddress, isConnected, connect, disconnect } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hello! I'm ArcFlow Agent. I can help you manage your payrolls. You can ask me to set a payroll date, calculate yields, or upload an employee CSV." }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => "session-" + Math.random().toString(36).substring(7));
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch(`${AGENT_API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg.content,
          sessionId,
          userAddress,
        }),
      });

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [...prev, { role: "system", content: "Error: Failed to communicate with agent." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCSVUpload = async (fileContent: string) => {
    const systemMsg: Message = { role: "system", content: "Uploading CSV..." };
    setMessages((prev) => [...prev, systemMsg]);
    setIsLoading(true);

    try {
      const response = await fetch(`${AGENT_API_URL}/api/upload-csv`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csvData: fileContent,
          sessionId,
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      const responseText = data.success 
        ? `Successfully parsing CSV. Found ${data.recipientCount} recipients. Total: ${data.totalAmountUsdc} USDC.`
        : "Failed to parse CSV.";

      // Add a hidden system message or just let the agent know via context? 
      // Ideally we send this to the agent so it knows context, but /upload-csv is separate.
      // The agent stores it in pendingPayrolls map, so the context IS updated on backend.
      // We just show the result to user.
      setMessages((prev) => [...prev, { role: "assistant", content: responseText }]);

    } catch (error) {
      console.error("Upload error:", error);
      setMessages((prev) => [...prev, { role: "system", content: "Error: Failed to upload CSV." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar />

      <div className="flex-1 flex flex-col h-screen">
        {/* Header */}
        <header className="bg-white border-b border-gray-100 h-16 px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Bot className="w-5 h-5 text-blue-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">AI Assistant</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <ChainSwitcher />
            {isConnected ? (
              <div className="flex items-center gap-2">
                 <div className="px-3 py-1.5 bg-gray-50 rounded-lg text-sm font-mono text-gray-600 border border-gray-100">
                  {userAddress ? `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}` : 'Connected'}
                </div>
                 <Button onClick={disconnect} variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50">Disconnect</Button>
              </div>
            ) : (
              <Button onClick={() => connect()} className="bg-blue-600 text-white hover:bg-blue-700">Connect Wallet</Button>
            )}
          </div>
        </header>

        {/* Chat Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4">
          <div className="max-w-5xl mx-auto w-full flex flex-col">
            {messages.map((msg, idx) => (
              <ChatMessage key={idx} role={msg.role} content={msg.content} />
            ))}
            {isLoading && (
              <div className="flex justify-start mb-4">
                 <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 border border-gray-200 flex items-center gap-2">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                 </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* Input Area */}
        <div className="bg-white border-t border-gray-100 p-6 shrink-0">
          <div className="max-w-5xl mx-auto w-full flex gap-4">
            <CSVUpload onUpload={handleCSVUpload} disabled={isLoading} />
            
            <form 
              className="flex-1 flex gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about payroll, yields, or generate a transaction..."
                className="flex-1 px-6 py-4 text-base border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
                disabled={isLoading}
              />
              <Button type="submit" disabled={isLoading || !input.trim()} className="bg-blue-600 hover:bg-blue-700 h-full w-14 rounded-xl">
                <Send className="w-5 h-5" />
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
