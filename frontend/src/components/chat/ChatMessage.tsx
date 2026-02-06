import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import TransactionAction from "./TransactionAction";

interface ChatMessageProps {
  role: "user" | "assistant" | "system";
  content: string;
  onTransactionSuccess?: (txHash: string) => void;
}

interface TransactionData {
  to: string;
  data: string;
  description: string;
  value?: string;
  payrollDate?: string;
  recipientCount?: number;
}

export default function ChatMessage({ role, content, onTransactionSuccess }: ChatMessageProps) {
  const isUser = role === "user";
  const isSystem = role === "system";

  // Parse content to find potential JSON transaction blocks
  const { textPart, transaction } = useMemo(() => {
    if (isUser || isSystem) return { textPart: content, transaction: null };

    // Look for JSON code blocks: ```json ... ```
    // We try to find a block that looks like a transaction
    const jsonBlockRegex = /```json\s*(\{[\s\S]*?\})\s*```/;
    const match = content.match(jsonBlockRegex);

    if (match) {
      try {
        const jsonContent = JSON.parse(match[1]);
        // Check if it has transaction fields
        if (jsonContent.to && jsonContent.data) {
          const description = jsonContent.description || "Sign Transaction";
          // Remove the code block from the display text to avoid duplication
          const textPart = content.replace(match[0], "").trim();
          return {
            textPart,
            transaction: { ...jsonContent, description } as TransactionData,
          };
        }
      } catch (e) {
        // failed to parse or not a transaction, ignore
      }
    }

    return { textPart: content, transaction: null };
  }, [content, isUser, isSystem]);

  if (isSystem) {
     return (
        <div className="flex justify-center my-4">
             <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">
                 {content}
             </span>
        </div>
     );
  }

  return (
    <div className={cn("flex w-full mb-4", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-3 text-sm transition-colors duration-300",
          isUser
            ? "bg-blue-600 text-white rounded-tr-sm"
            : "bg-gray-100 dark:bg-muted text-gray-800 dark:text-foreground rounded-tl-sm border border-gray-200 dark:border-border"
        )}
      >
        <div className="markdown-content">
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]}
            components={{
              ul: ({node, ...props}) => <ul className="list-disc pl-4 my-2 space-y-1" {...props} />,
              ol: ({node, ...props}) => <ol className="list-decimal pl-4 my-2 space-y-1" {...props} />,
              li: ({node, ...props}) => <li className="my-0.5" {...props} />,
              p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
              strong: ({node, ...props}) => <strong className="font-semibold" {...props} />,
              a: ({node, ...props}) => <a className="text-blue-500 hover:underline" target="_blank" rel="noopener noreferrer" {...props} />,
              code: ({node, inline, className, children, ...props}: any) => {
                return inline ? (
                  <code className="bg-gray-200 dark:bg-gray-800 px-1 py-0.5 rounded text-xs font-mono" {...props}>{children}</code>
                ) : (
                  <code className="block bg-gray-200 dark:bg-gray-800 p-2 rounded text-xs font-mono my-2 overflow-x-auto" {...props}>{children}</code>
                );
              }
            }}
          >
            {textPart}
          </ReactMarkdown>
        </div>
        
        {transaction && (
          <TransactionAction
            to={transaction.to}
            data={transaction.data}
            description={transaction.description}
            value={transaction.value}
            onSuccess={onTransactionSuccess}
          />
        )}
      </div>
    </div>
  );
}
