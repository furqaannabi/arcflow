import { useMemo } from "react";
import { cn } from "@/lib/utils";
import TransactionAction from "./TransactionAction";

interface ChatMessageProps {
  role: "user" | "assistant" | "system";
  content: string;
}

interface TransactionData {
  to: string;
  data: string;
  description: string;
  value?: string;
  payrollDate?: string;
  recipientCount?: number;
}

export default function ChatMessage({ role, content }: ChatMessageProps) {
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
          "max-w-[80%] rounded-2xl px-4 py-3 text-sm",
          isUser
            ? "bg-blue-600 text-white rounded-tr-sm"
            : "bg-gray-100 text-gray-800 rounded-tl-sm border border-gray-200"
        )}
      >
        <div className="whitespace-pre-wrap">{textPart}</div>
        
        {transaction && (
          <TransactionAction
            to={transaction.to}
            data={transaction.data}
            description={transaction.description}
            value={transaction.value}
          />
        )}
      </div>
    </div>
  );
}
