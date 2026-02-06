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
  // baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
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
      description: "Set the payroll distribution date and time. Must be a future date/time. Call get_current_time first to validate.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description:
              "The payroll date and time in ISO format (e.g., '2025-06-15T14:30:00Z') or natural language like '31st January 2025 at 3:00 PM UTC'",
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
        "Set employee wallet addresses and payment amounts. Use 'recipients' array when parsing from a user's plain text message (you extract the addresses and amounts). Use 'csvData' only when the user uploads or pastes a proper CSV file with headers.",
      parameters: {
        type: "object",
        properties: {
          csvData: {
            type: "string",
            description:
              "CSV data with header row and columns: address,amount (only use for actual CSV file uploads)",
          },
          recipients: {
            type: "array",
            description:
              "Array of recipients extracted by you (the AI) from the user's message. Use this for plain text input.",
            items: {
              type: "object",
              properties: {
                address: {
                  type: "string",
                  description: "Wallet address (0x...)",
                },
                amount: {
                  type: "string",
                  description: "USDC amount as a string (e.g., '100')",
                },
              },
              required: ["address", "amount"],
            },
          },
        },
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
        "Calculate expected return based on deposit amount. Yield is calculated from now (deposit time) until the payroll date. Payroll date must be set first using set_payroll_date.",
      parameters: {
        type: "object",
        properties: {
          amount: {
            type: "number",
            description: "USDC amount to deposit",
          },
        },
        required: ["amount"],
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
      name: "get_current_time",
      description: "Get the current date and time in UTC. Use this before setting payroll dates to validate the user is not setting a past date/time.",
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
      const now = new Date();
      let parsedDate = new Date(dateStr);

      if (isNaN(parsedDate.getTime())) {
        // Try natural language parsing: "31st January 2025 at 3:00 PM"
        const monthMatch = dateStr.match(
          /(\d{1,2})(?:st|nd|rd|th)?\s*(january|february|march|april|may|june|july|august|september|october|november|december)\s*(\d{4})?/i
        );
        const timeMatch = dateStr.match(
          /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?\s*(utc|gmt)?/i
        );

        if (monthMatch) {
          const day = parseInt(monthMatch[1]);
          const monthNames = [
            "january", "february", "march", "april", "may", "june",
            "july", "august", "september", "october", "november", "december",
          ];
          const month = monthNames.indexOf(monthMatch[2].toLowerCase());
          const year = monthMatch[3] ? parseInt(monthMatch[3]) : now.getFullYear();

          let hours = 0, minutes = 0, seconds = 0;
          if (timeMatch) {
            hours = parseInt(timeMatch[1]);
            minutes = parseInt(timeMatch[2]);
            seconds = timeMatch[3] ? parseInt(timeMatch[3]) : 0;
            if (timeMatch[4]?.toLowerCase() === "pm" && hours < 12) hours += 12;
            if (timeMatch[4]?.toLowerCase() === "am" && hours === 12) hours = 0;
          }

          parsedDate = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
        } else {
          return { result: JSON.stringify({ error: "Could not parse date/time: " + dateStr + ". Please provide a full date and time (e.g., '15th June 2025 at 2:30 PM UTC' or '2025-06-15T14:30:00Z')." }), updatedPayroll: updated };
        }
      }

      // Reject past dates
      if (parsedDate <= now) {
        return {
          result: JSON.stringify({
            error: "Cannot set a payroll date in the past. The provided date/time (" + parsedDate.toISOString() + ") has already passed. Current time is " + now.toISOString() + ". Please provide a future date and time.",
          }),
          updatedPayroll: updated,
        };
      }

      updated.payrollDate = Math.floor(parsedDate.getTime() / 1000);
      const date = new Date(updated.payrollDate * 1000);
      return {
        result: JSON.stringify({
          success: true,
          payrollDate: updated.payrollDate,
          formattedDateTime: date.toLocaleString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "UTC",
            timeZoneName: "short",
          }),
        }),
        updatedPayroll: updated,
      };
    }

    case "parse_csv_recipients": {
      try {
        let recipients: PayrollRecipient[] = [];
        const aiRecipients = args.recipients as Array<{ address: string; amount: string }> | undefined;
        const csvData = args.csvData as string | undefined;

        if (aiRecipients && aiRecipients.length > 0) {
          // AI-parsed recipients from plain text message
          recipients = aiRecipients.map((r) => ({
            wallet: r.address as Address,
            amount: parseUnits(r.amount, 6),
          }));
        } else if (csvData) {
          // CSV file/string with headers
          const records = parse(csvData, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
          });
          recipients = records.map(
            (record: { address: string; amount: string }) => ({
              wallet: record.address as Address,
              amount: parseUnits(record.amount, 6),
            })
          );
        }

        if (recipients.length === 0) {
          return {
            result: JSON.stringify({ error: "No recipients found. Please provide wallet addresses and amounts." }),
            updatedPayroll: updated,
          };
        }

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
          result: JSON.stringify({ error: "Failed to parse recipients: " + (error as Error).message }),
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

      if (!updated.payrollDate) {
        return { result: JSON.stringify({ error: "Payroll date not set. Please set the payroll date first using set_payroll_date." }), updatedPayroll: updated };
      }

      const now = new Date();
      const payrollDate = new Date(updated.payrollDate * 1000);
      const msUntilPayroll = payrollDate.getTime() - now.getTime();

      if (msUntilPayroll <= 0) {
        return { result: JSON.stringify({ error: "Payroll date has already passed. Please set a future payroll date." }), updatedPayroll: updated };
      }

      const daysUntilPayroll = msUntilPayroll / (1000 * 60 * 60 * 24);

      try {
        const bestYield = await defiLlamaService.getBestApy();
        if (!bestYield) {
          return { result: JSON.stringify({ error: "Could not fetch yield data" }), updatedPayroll: updated };
        }
        const annualYield = bestYield.apy / 100;
        const periodYield = annualYield * (daysUntilPayroll / 365);
        const expectedReturn = amount * periodYield;
        return {
          result: JSON.stringify({
            depositAmount: amount,
            depositTime: now.toISOString(),
            payrollDate: payrollDate.toISOString(),
            daysUntilPayroll: Math.round(daysUntilPayroll * 100) / 100,
            apy: bestYield.apy.toFixed(2) + "%",
            protocol: "Uniswap V4",
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

    case "get_current_time": {
      const now = new Date();
      return {
        result: JSON.stringify({
          utc: now.toISOString(),
          unix: Math.floor(now.getTime() / 1000),
          formatted: now.toLocaleString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            timeZone: "UTC",
            timeZoneName: "short",
          }),
        }),
        updatedPayroll: updated,
      };
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
        return {
          result: JSON.stringify({
            info: "Payroll execution now requires Yellow Network state channels",
            readyCount: readyIds.length,
            message: readyIds.length > 0
              ? `${readyIds.length} payroll(s) ready. The agent will automatically execute them via Yellow Network.`
              : "No payrolls ready to execute yet.",
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

Deposited funds are placed into a Uniswap V4 USDC-USDT liquidity pool to earn yield from the moment of deposit until the payroll date. 100% of the earned APY/yield goes to the company — employees receive exactly their payroll amounts, and all yield profits are kept by the company.

Your capabilities:
1. Help users set up payroll distributions with a specific date and time
2. Parse CSV files with employee wallet addresses and payment amounts
3. Show expected yields from Uniswap V4 LP positions (using live data)
4. Generate blockchain transactions for USDC approval and deposit into Uniswap V4
5. Track existing LP positions and accumulated yields
6. Check withdrawable balances from Yellow Network Custody Contract
7. Generate withdrawal transactions from Yellow Network
8. Check which payrolls are ready to execute (payroll date has passed)
9. Generate transactions to execute ready payrolls and bridge USDC

Workflow for new payroll:
1. Greet the user and ask how you can help
2. Ask for the payroll date and time — the user MUST provide a full date AND time (e.g., "15th June 2025 at 2:30 PM UTC" or "2025-06-15T14:30:00Z"). Do NOT ask how many days — always ask for a specific date and time.
3. ALWAYS call get_current_time first before setting the payroll date with set_payroll_date — this validates the date is in the future. Users cannot set a past date or time.
4. Ask for employee data — users can type it in any format (e.g., "pay 0xABC 100 and 0xDEF 200") or upload a CSV file. When the user gives plain text, YOU (the AI) extract the wallet addresses and amounts and pass them as the 'recipients' array to parse_csv_recipients. Only use the 'csvData' parameter for actual CSV files.
5. Show expected returns — yield is calculated automatically from deposit (now) until the payroll date. Do NOT ask the user for a number of days. Just call calculate_expected_return with the amount and it will compute everything. Make it clear that 100% of the yield goes to the company as profit — employees receive their exact payroll amounts only.
6. Guide through approval transaction (if needed)
7. Generate deposit transaction — funds go into Uniswap V4 USDC-USDT pool, yield accrues to the company

Workflow for payroll execution (when payroll date arrives):
1. Check for ready payrolls using get_ready_payrolls
2. If payrolls are ready, generate execute transaction
3. Execution will remove liquidity from Uniswap V4, swap to USDC, and bridge to Arc Chain

Workflow for withdrawal (after payroll distribution):
1. Check withdrawable balance from Yellow Network Custody
2. Generate withdrawal transaction to retrieve funds

Always be helpful, concise, and guide users through the process step by step.
Format currency amounts clearly (e.g., "1,000 USDC").
When showing transactions, explain what each one does.`;

// Maximum number of recent messages to send to OpenAI (excluding system prompt)
const MAX_CONTEXT_MESSAGES = 20;

// Convert MongoDB messages to OpenAI format with context limit
function toOpenAIMessages(messages: IMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  // Always keep the system prompt (first message)
  const systemMessage = messages.find(m => m.role === "system");
  const nonSystemMessages = messages.filter(m => m.role !== "system");

  // Take only the most recent messages to avoid old context
  const recentMessages = nonSystemMessages.slice(-MAX_CONTEXT_MESSAGES);

  // Combine system + recent messages
  const limitedMessages = systemMessage
    ? [systemMessage, ...recentMessages]
    : recentMessages;

  return limitedMessages.map((m) => {
    if (m.role === "tool") {
      return {
        role: "tool" as const,
        tool_call_id: m.tool_call_id || "",
        content: m.content || "",
      };
    }
    if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) {
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

    // Track transaction data from tool calls
    const transactions: Array<{ type: string; to: string; data: string; description: string; [key: string]: any }> = [];
    const TX_TOOLS = new Set([
      "get_approval_transaction",
      "get_deposit_transaction",
      "get_withdrawal_transaction",
      "get_execute_payrolls_transaction",
    ]);

    // Call OpenAI with tools
    let response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
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

        // Capture transaction data for the response
        if (TX_TOOLS.has(toolCall.function.name)) {
          try {
            const parsed = JSON.parse(result);
            if (parsed.to && parsed.data) {
              transactions.push({ type: toolCall.function.name, ...parsed });
            }
          } catch {}
        }

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
        model: "gpt-4o-mini",
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
      transactions: transactions.length > 0 ? transactions : undefined,
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
