import { Router, Request, Response } from "express";
import OpenAI from "openai";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { parseUnits, type Address } from "viem";
import { v4 as uuidv4 } from "uuid";
import { ContractService, type PayrollRecipient } from "../contracts";
import { DefiLlamaService } from "../defillama";
import { YellowNetworkService } from "../yellow";
import { ChatSession, type IMessage, type IPendingPayroll } from "../models/ChatSession";

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (_req, file, cb) => {
    // Only accept CSV files
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files are allowed"));
    }
  },
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

const contractService = new ContractService(process.env.RPC_URL);
const defiLlamaService = new DefiLlamaService();
const yellowService = new YellowNetworkService(process.env.RPC_URL);

// Tool definitions for OpenAI function calling
const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "set_payroll_date",
      description: "Set the payroll distribution date",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description:
              "The payroll date in ISO format or natural language like '31st January 2025'",
          },
        },
        required: ["date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "parse_csv_recipients",
      description:
        "Parse a CSV string containing employee wallet addresses and payment amounts",
      parameters: {
        type: "object",
        properties: {
          csvData: {
            type: "string",
            description:
              "CSV data with columns: address,amount (amount in USDC)",
          },
        },
        required: ["csvData"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_expected_yield",
      description:
        "Get expected yield/APY for USDC deposits from DeFi protocols",
      parameters: {
        type: "object",
        properties: {
          chain: {
            type: "string",
            description: "Blockchain to check yields on (e.g., Ethereum, Base)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_expected_return",
      description:
        "Calculate expected return based on deposit amount and time until payroll",
      parameters: {
        type: "object",
        properties: {
          amount: {
            type: "number",
            description: "USDC amount to deposit",
          },
          daysUntilPayroll: {
            type: "number",
            description: "Number of days until payroll distribution",
          },
        },
        required: ["amount", "daysUntilPayroll"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_approval_transaction",
      description: "Generate the USDC approval transaction for the router contract",
      parameters: {
        type: "object",
        properties: {
          amount: {
            type: "string",
            description: "USDC amount to approve (as string)",
          },
        },
        required: ["amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_deposit_transaction",
      description:
        "Generate the deposit transaction to create the payroll LP position",
      parameters: {
        type: "object",
        properties: {
          userAddress: {
            type: "string",
            description: "User's wallet address",
          },
        },
        required: ["userAddress"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_positions",
      description: "Get all LP positions for a user address",
      parameters: {
        type: "object",
        properties: {
          address: {
            type: "string",
            description: "User's wallet address",
          },
        },
        required: ["address"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_usdc_balance",
      description: "Get USDC balance for a wallet address",
      parameters: {
        type: "object",
        properties: {
          address: {
            type: "string",
            description: "Wallet address to check",
          },
        },
        required: ["address"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_withdrawable_balance",
      description: "Get withdrawable USDC balance from Yellow Network Custody Contract after closing a state channel",
      parameters: {
        type: "object",
        properties: {
          address: {
            type: "string",
            description: "User's wallet address",
          },
        },
        required: ["address"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_withdrawal_transaction",
      description: "Generate transaction to withdraw USDC from Yellow Network Custody Contract",
      parameters: {
        type: "object",
        properties: {
          amount: {
            type: "string",
            description: "USDC amount to withdraw",
          },
        },
        required: ["amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_ready_payrolls",
      description: "Get all payrolls that are ready to execute (payroll date has passed)",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_execute_payrolls_transaction",
      description: "Generate transaction to execute all ready payrolls and bridge USDC to Arc Chain",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];

// Helper to convert MongoDB pending payroll to contract format
function toContractRecipients(recipients?: Array<{ wallet: string; amount: string }>): PayrollRecipient[] {
  if (!recipients) return [];
  return recipients.map(r => ({
    wallet: r.wallet as Address,
    amount: BigInt(r.amount),
  }));
}

// Tool implementations
async function executeTool(
  name: string,
  args: Record<string, unknown>,
  pendingPayroll: IPendingPayroll
): Promise<{ result: string; updatedPayroll: IPendingPayroll }> {
  const updated = { ...pendingPayroll };

  switch (name) {
    case "set_payroll_date": {
      const dateStr = args.date as string;
      const parsedDate = new Date(dateStr);
      if (isNaN(parsedDate.getTime())) {
        const now = new Date();
        const monthMatch = dateStr.match(
          /(\d{1,2})(?:st|nd|rd|th)?\s*(january|february|march|april|may|june|july|august|september|october|november|december)/i
        );
        if (monthMatch) {
          const day = parseInt(monthMatch[1]);
          const monthNames = [
            "january", "february", "march", "april", "may", "june",
            "july", "august", "september", "october", "november", "december",
          ];
          const month = monthNames.indexOf(monthMatch[2].toLowerCase());
          let year = now.getFullYear();
          const potentialDate = new Date(year, month, day);
          if (potentialDate < now) {
            year++;
          }
          updated.payrollDate = Math.floor(new Date(year, month, day).getTime() / 1000);
        } else {
          return { result: JSON.stringify({ error: "Could not parse date: " + dateStr }), updatedPayroll: updated };
        }
      } else {
        updated.payrollDate = Math.floor(parsedDate.getTime() / 1000);
      }
      const date = new Date(updated.payrollDate * 1000);
      return {
        result: JSON.stringify({
          success: true,
          payrollDate: updated.payrollDate,
          formattedDate: date.toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
        }),
        updatedPayroll: updated,
      };
    }

    case "parse_csv_recipients": {
      const csvData = args.csvData as string;
      try {
        const records = parse(csvData, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        });
        const recipients: PayrollRecipient[] = records.map(
          (record: { address: string; amount: string }) => ({
            wallet: record.address as Address,
            amount: parseUnits(record.amount, 6),
          })
        );
        const totalAmount = recipients.reduce((sum, r) => sum + r.amount, BigInt(0));

        // Store as strings for MongoDB
        updated.recipients = recipients.map(r => ({
          wallet: r.wallet,
          amount: r.amount.toString(),
        }));
        updated.totalAmount = totalAmount.toString();

        return {
          result: JSON.stringify({
            success: true,
            recipientCount: recipients.length,
            totalAmountUsdc: (Number(totalAmount) / 1e6).toFixed(2),
            recipients: recipients.map((r) => ({
              wallet: r.wallet,
              amountUsdc: (Number(r.amount) / 1e6).toFixed(2),
            })),
          }),
          updatedPayroll: updated,
        };
      } catch (error) {
        return {
          result: JSON.stringify({ error: "Failed to parse CSV: " + (error as Error).message }),
          updatedPayroll: updated,
        };
      }
    }

    case "get_expected_yield": {
      const chain = args.chain as string | undefined;
      try {
        if (chain) {
          const yieldData = await defiLlamaService.getBestApy(chain);
          return { result: JSON.stringify(yieldData || { error: "No data for chain" }), updatedPayroll: updated };
        }
        const yields = await defiLlamaService.getUsdcYields();
        return { result: JSON.stringify(yields.slice(0, 5)), updatedPayroll: updated };
      } catch (error) {
        return { result: JSON.stringify({ error: (error as Error).message }), updatedPayroll: updated };
      }
    }

    case "calculate_expected_return": {
      const amount = args.amount as number;
      const days = args.daysUntilPayroll as number;
      try {
        const bestYield = await defiLlamaService.getBestApy();
        if (!bestYield) {
          return { result: JSON.stringify({ error: "Could not fetch yield data" }), updatedPayroll: updated };
        }
        const annualYield = bestYield.apy / 100;
        const periodYield = annualYield * (days / 365);
        const expectedReturn = amount * periodYield;
        return {
          result: JSON.stringify({
            depositAmount: amount,
            daysUntilPayroll: days,
            apy: bestYield.apy.toFixed(2) + "%",
            protocol: bestYield.project,
            chain: bestYield.chain,
            expectedYield: expectedReturn.toFixed(2),
            totalAtPayroll: (amount + expectedReturn).toFixed(2),
          }),
          updatedPayroll: updated,
        };
      } catch (error) {
        return { result: JSON.stringify({ error: (error as Error).message }), updatedPayroll: updated };
      }
    }

    case "get_approval_transaction": {
      const amount = args.amount as string;
      const amountBigInt = parseUnits(amount, 6);
      const txData = contractService.generateApprovalCalldata(amountBigInt);
      return {
        result: JSON.stringify({
          to: txData.to,
          data: txData.data,
          description: `Approve ${amount} USDC for ArcFlow Router`,
        }),
        updatedPayroll: updated,
      };
    }

    case "get_deposit_transaction": {
      const userAddress = args.userAddress as Address;
      updated.userAddress = userAddress;

      if (!updated.payrollDate) {
        return { result: JSON.stringify({ error: "Payroll date not set" }), updatedPayroll: updated };
      }
      if (!updated.recipients || updated.recipients.length === 0) {
        return { result: JSON.stringify({ error: "No recipients set" }), updatedPayroll: updated };
      }
      if (!updated.totalAmount) {
        return { result: JSON.stringify({ error: "Total amount not calculated" }), updatedPayroll: updated };
      }

      const contractRecipients = toContractRecipients(updated.recipients);
      const txData = contractService.generateDepositCalldata(
        BigInt(updated.totalAmount),
        BigInt(updated.payrollDate),
        contractRecipients
      );
      return {
        result: JSON.stringify({
          to: txData.to,
          data: txData.data,
          description: `Deposit ${(Number(BigInt(updated.totalAmount)) / 1e6).toFixed(2)} USDC for payroll`,
          payrollDate: new Date(updated.payrollDate * 1000).toISOString(),
          recipientCount: updated.recipients.length,
        }),
        updatedPayroll: updated,
      };
    }

    case "get_user_positions": {
      const address = args.address as Address;
      try {
        const positions = await contractService.getPositions(address);
        return {
          result: JSON.stringify(
            positions.map((p) => ({
              payrollId: p.payrollId.toString(),
              usdcDeposited: (Number(p.usdcDeposited) / 1e6).toFixed(2),
              accumulatedYield: (Number(p.accumulatedYield) / 1e6).toFixed(2),
              payrollDate: new Date(Number(p.payrollDate) * 1000).toISOString(),
            }))
          ),
          updatedPayroll: updated,
        };
      } catch (error) {
        return { result: JSON.stringify({ error: (error as Error).message }), updatedPayroll: updated };
      }
    }

    case "get_usdc_balance": {
      const address = args.address as Address;
      try {
        const balance = await contractService.getUsdcBalance(address);
        return { result: JSON.stringify({ balance, symbol: "USDC" }), updatedPayroll: updated };
      } catch (error) {
        return { result: JSON.stringify({ error: (error as Error).message }), updatedPayroll: updated };
      }
    }

    case "get_withdrawable_balance": {
      const address = args.address as Address;
      try {
        const withdrawable = await yellowService.getWithdrawableBalance(address);
        return {
          result: JSON.stringify({
            address: withdrawable.address,
            withdrawableBalance: withdrawable.balance,
            token: withdrawable.token,
            custodyContract: yellowService.getCustodyAddress(),
          }),
          updatedPayroll: updated,
        };
      } catch (error) {
        return { result: JSON.stringify({ error: (error as Error).message }), updatedPayroll: updated };
      }
    }

    case "get_withdrawal_transaction": {
      const amount = args.amount as string;
      try {
        const amountBigInt = parseUnits(amount, 6);
        const txData = yellowService.generateWithdrawCalldata(amountBigInt);
        return {
          result: JSON.stringify({
            to: txData.to,
            data: txData.data,
            description: txData.description,
          }),
          updatedPayroll: updated,
        };
      } catch (error) {
        return { result: JSON.stringify({ error: (error as Error).message }), updatedPayroll: updated };
      }
    }

    case "get_ready_payrolls": {
      try {
        const readyIds = await contractService.getReadyPayrolls();
        return {
          result: JSON.stringify({
            count: readyIds.length,
            payrollIds: readyIds.map((id) => id.toString()),
            message: readyIds.length > 0
              ? `${readyIds.length} payroll(s) ready to execute`
              : "No payrolls ready to execute",
          }),
          updatedPayroll: updated,
        };
      } catch (error) {
        return { result: JSON.stringify({ error: (error as Error).message }), updatedPayroll: updated };
      }
    }

    case "get_execute_payrolls_transaction": {
      try {
        const readyIds = await contractService.getReadyPayrolls();
        if (readyIds.length === 0) {
          return { result: JSON.stringify({ error: "No payrolls ready to execute" }), updatedPayroll: updated };
        }
        const txData = contractService.generateExecuteReadyPayrollsCalldata();
        return {
          result: JSON.stringify({
            to: txData.to,
            data: txData.data,
            description: `Execute ${readyIds.length} ready payroll(s) and bridge USDC to Arc Chain`,
            payrollCount: readyIds.length,
          }),
          updatedPayroll: updated,
        };
      } catch (error) {
        return { result: JSON.stringify({ error: (error as Error).message }), updatedPayroll: updated };
      }
    }

    default:
      return { result: JSON.stringify({ error: "Unknown tool: " + name }), updatedPayroll: updated };
  }
}

const SYSTEM_PROMPT = `You are ArcFlow, an AI assistant that helps companies distribute payroll using DeFi.

Your capabilities:
1. Help users set up payroll distributions with a specific date
2. Parse CSV files with employee wallet addresses and payment amounts
3. Show expected yields from DeFi protocols (using live data)
4. Generate blockchain transactions for USDC approval and deposit
5. Track existing LP positions and accumulated yields
6. Check withdrawable balances from Yellow Network Custody Contract
7. Generate withdrawal transactions from Yellow Network
8. Check which payrolls are ready to execute (payroll date has passed)
9. Generate transactions to execute ready payrolls and bridge USDC

Workflow for new payroll:
1. Greet the user and ask how you can help
2. Get the payroll date from the user
3. Ask for employee data (CSV format: address,amount)
4. Show expected returns based on time until payroll
5. Guide through approval transaction (if needed)
6. Generate deposit transaction

Workflow for payroll execution (when payroll date arrives):
1. Check for ready payrolls using get_ready_payrolls
2. If payrolls are ready, generate execute transaction
3. Execution will remove liquidity, swap to USDC, and bridge to Arc Chain

Workflow for withdrawal (after payroll distribution):
1. Check withdrawable balance from Yellow Network Custody
2. Generate withdrawal transaction to retrieve funds

Always be helpful, concise, and guide users through the process step by step.
Format currency amounts clearly (e.g., "1,000 USDC").
When showing transactions, explain what each one does.`;

// Convert MongoDB messages to OpenAI format
function toOpenAIMessages(messages: IMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  return messages.map((m) => {
    if (m.role === "tool") {
      return {
        role: "tool" as const,
        tool_call_id: m.tool_call_id || "",
        content: m.content || "",
      };
    }
    if (m.role === "assistant" && m.tool_calls) {
      return {
        role: "assistant" as const,
        content: m.content,
        tool_calls: m.tool_calls,
      };
    }
    return {
      role: m.role as "system" | "user" | "assistant",
      content: m.content || "",
    };
  });
}

router.post("/chat", upload.single("file"), async (req: Request, res: Response) => {
  try {
    const { message, sessionId: providedSessionId, userAddress } = req.body;
    const file = req.file;

    if (!message && !file) {
      return res.status(400).json({ error: "Message or file is required" });
    }

    // Get or create session
    let sessionId = providedSessionId;
    let session = sessionId ? await ChatSession.findOne({ sessionId }) : null;

    if (!session) {
      // Create new session
      sessionId = uuidv4();
      session = new ChatSession({
        sessionId,
        messages: [{ role: "system", content: SYSTEM_PROMPT, timestamp: new Date() }],
        pendingPayroll: {},
        lastActivity: new Date(),
      });
      await session.save();
    }

    // Check if file upload is allowed
    if (file) {
      const lastMessage = session.messages[session.messages.length - 1];
      if (!lastMessage?.allowFileUpload) {
        return res.status(400).json({ error: "File upload not allowed at this point" });
      }
    }

    // Prepare user message content
    let userContent = message || "";
    if (file) {
      // Parse CSV file and append to message
      const csvData = file.buffer.toString("utf-8");
      userContent = userContent
        ? `${userContent}\n\nCSV File (${file.originalname}):\n${csvData}`
        : `Please parse this CSV file:\n${csvData}`;
    }

    // Add user message
    session.messages.push({
      role: "user",
      content: userContent,
      timestamp: new Date(),
    });

    // Store user address if provided
    if (userAddress) {
      session.pendingPayroll.userAddress = userAddress;
    }

    // Convert to OpenAI format
    let messages = toOpenAIMessages(session.messages);
    let pendingPayroll: IPendingPayroll = session.pendingPayroll || {};

    // Call OpenAI with tools
    let response = await openai.chat.completions.create({
      model: "gemini-2.5-flash",
      messages,
      tools,
      tool_choice: "auto",
    });

    let assistantMessage = response.choices[0].message;

    // Handle tool calls
    while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      // Add assistant message with tool calls
      session.messages.push({
        role: "assistant",
        content: assistantMessage.content,
        tool_calls: assistantMessage.tool_calls.map(tc => ({
          id: tc.id,
          type: tc.type,
          function: tc.function,
        })),
        timestamp: new Date(),
      });

      // Execute each tool call
      for (const toolCall of assistantMessage.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        const { result, updatedPayroll } = await executeTool(
          toolCall.function.name,
          args,
          pendingPayroll
        );
        pendingPayroll = updatedPayroll;

        session.messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
          timestamp: new Date(),
        });
      }

      // Update messages for next call
      messages = toOpenAIMessages(session.messages);

      // Get next response
      response = await openai.chat.completions.create({
        model: "gemini-2.5-flash",
        messages,
        tools,
        tool_choice: "auto",
      });

      assistantMessage = response.choices[0].message;
    }

    // Check if assistant is asking for CSV/file upload
    const contentLower = (assistantMessage.content || "").toLowerCase();
    const allowFileUpload = contentLower.includes("csv") ||
      contentLower.includes("upload") ||
      contentLower.includes("file") ||
      contentLower.includes("employee data") ||
      contentLower.includes("recipient");

    // Add final assistant message
    session.messages.push({
      role: "assistant",
      content: assistantMessage.content,
      timestamp: new Date(),
      allowFileUpload,
    });

    // Update session
    session.pendingPayroll = pendingPayroll;
    session.lastActivity = new Date();
    await session.save();

    res.json({
      response: assistantMessage.content,
      sessionId,
      allowFileUpload,
      state: pendingPayroll
        ? {
            hasPayrollDate: !!pendingPayroll.payrollDate,
            hasRecipients: !!(pendingPayroll.recipients?.length),
            recipientCount: pendingPayroll.recipients?.length || 0,
            totalAmount: pendingPayroll.totalAmount
              ? (Number(BigInt(pendingPayroll.totalAmount)) / 1e6).toFixed(2)
              : null,
          }
        : null,
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: "Failed to process chat message" });
  }
});

// Endpoint to get current yields
router.get("/yields", async (_req: Request, res: Response) => {
  try {
    const yields = await defiLlamaService.getUsdcYields();
    res.json(yields.slice(0, 10));
  } catch (error) {
    console.error("Yields error:", error);
    res.status(500).json({ error: "Failed to fetch yields" });
  }
});

// Endpoint to get session state
router.get("/session/:sessionId", async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const session = await ChatSession.findOne({ sessionId });

  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  const pendingPayroll = session.pendingPayroll;
  const lastMessage = session.messages[session.messages.length - 1];

  res.json({
    hasPayrollDate: !!pendingPayroll?.payrollDate,
    payrollDate: pendingPayroll?.payrollDate
      ? new Date(pendingPayroll.payrollDate * 1000).toISOString()
      : null,
    recipientCount: pendingPayroll?.recipients?.length || 0,
    totalAmount: pendingPayroll?.totalAmount
      ? (Number(BigInt(pendingPayroll.totalAmount)) / 1e6).toFixed(2)
      : null,
    allowFileUpload: lastMessage?.allowFileUpload || false,
  });
});

export { router as chatRouter };
