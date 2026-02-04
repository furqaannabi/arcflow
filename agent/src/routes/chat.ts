import { Router, Request, Response } from "express";
import OpenAI from "openai";
import { parse } from "csv-parse/sync";
import { parseUnits, type Address } from "viem";
import { ContractService, type PayrollRecipient } from "../contracts.js";
import { DefiLlamaService } from "../defillama.js";
import { YellowNetworkService } from "../yellow.js";

const router = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://ai.googleapis.com/v1beta/openai/",
});

const contractService = new ContractService(process.env.RPC_URL);
const defiLlamaService = new DefiLlamaService();
const yellowService = new YellowNetworkService(process.env.RPC_URL);

// Store conversation history per session
const sessions = new Map<string, OpenAI.Chat.ChatCompletionMessageParam[]>();

// Store pending payroll data per session
const pendingPayrolls = new Map<
  string,
  {
    payrollDate?: number;
    recipients?: PayrollRecipient[];
    totalAmount?: bigint;
    userAddress?: Address;
  }
>();

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
            description: "Blockchain to check yields on (e.g., Ethereum, Arbitrum)",
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

// Tool implementations
async function executeTool(
  sessionId: string,
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const pendingPayroll = pendingPayrolls.get(sessionId) || {};

  switch (name) {
    case "set_payroll_date": {
      const dateStr = args.date as string;
      const parsedDate = new Date(dateStr);
      if (isNaN(parsedDate.getTime())) {
        // Try to parse natural language dates
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
          pendingPayroll.payrollDate = Math.floor(
            new Date(year, month, day).getTime() / 1000
          );
        } else {
          return JSON.stringify({ error: "Could not parse date: " + dateStr });
        }
      } else {
        pendingPayroll.payrollDate = Math.floor(parsedDate.getTime() / 1000);
      }
      pendingPayrolls.set(sessionId, pendingPayroll);
      const date = new Date(pendingPayroll.payrollDate * 1000);
      return JSON.stringify({
        success: true,
        payrollDate: pendingPayroll.payrollDate,
        formattedDate: date.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
      });
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
        const totalAmount = recipients.reduce(
          (sum, r) => sum + r.amount,
          BigInt(0)
        );
        pendingPayroll.recipients = recipients;
        pendingPayroll.totalAmount = totalAmount;
        pendingPayrolls.set(sessionId, pendingPayroll);
        return JSON.stringify({
          success: true,
          recipientCount: recipients.length,
          totalAmountUsdc: (Number(totalAmount) / 1e6).toFixed(2),
          recipients: recipients.map((r) => ({
            wallet: r.wallet,
            amountUsdc: (Number(r.amount) / 1e6).toFixed(2),
          })),
        });
      } catch (error) {
        return JSON.stringify({
          error: "Failed to parse CSV: " + (error as Error).message,
        });
      }
    }

    case "get_expected_yield": {
      const chain = args.chain as string | undefined;
      try {
        if (chain) {
          const yieldData = await defiLlamaService.getBestApy(chain);
          return JSON.stringify(yieldData || { error: "No data for chain" });
        }
        const yields = await defiLlamaService.getUsdcYields();
        return JSON.stringify(yields.slice(0, 5));
      } catch (error) {
        return JSON.stringify({ error: (error as Error).message });
      }
    }

    case "calculate_expected_return": {
      const amount = args.amount as number;
      const days = args.daysUntilPayroll as number;
      try {
        const bestYield = await defiLlamaService.getBestApy();
        if (!bestYield) {
          return JSON.stringify({ error: "Could not fetch yield data" });
        }
        const annualYield = bestYield.apy / 100;
        const periodYield = annualYield * (days / 365);
        const expectedReturn = amount * periodYield;
        return JSON.stringify({
          depositAmount: amount,
          daysUntilPayroll: days,
          apy: bestYield.apy.toFixed(2) + "%",
          protocol: bestYield.project,
          chain: bestYield.chain,
          expectedYield: expectedReturn.toFixed(2),
          totalAtPayroll: (amount + expectedReturn).toFixed(2),
        });
      } catch (error) {
        return JSON.stringify({ error: (error as Error).message });
      }
    }

    case "get_approval_transaction": {
      const amount = args.amount as string;
      const amountBigInt = parseUnits(amount, 6);
      const txData = contractService.generateApprovalCalldata(amountBigInt);
      return JSON.stringify({
        to: txData.to,
        data: txData.data,
        description: `Approve ${amount} USDC for ArcFlow Router`,
      });
    }

    case "get_deposit_transaction": {
      const userAddress = args.userAddress as Address;
      pendingPayroll.userAddress = userAddress;
      pendingPayrolls.set(sessionId, pendingPayroll);

      if (!pendingPayroll.payrollDate) {
        return JSON.stringify({ error: "Payroll date not set" });
      }
      if (!pendingPayroll.recipients || pendingPayroll.recipients.length === 0) {
        return JSON.stringify({ error: "No recipients set" });
      }
      if (!pendingPayroll.totalAmount) {
        return JSON.stringify({ error: "Total amount not calculated" });
      }

      const txData = contractService.generateDepositCalldata(
        pendingPayroll.totalAmount,
        BigInt(pendingPayroll.payrollDate),
        pendingPayroll.recipients
      );
      return JSON.stringify({
        to: txData.to,
        data: txData.data,
        description: `Deposit ${(Number(pendingPayroll.totalAmount) / 1e6).toFixed(2)} USDC for payroll`,
        payrollDate: new Date(pendingPayroll.payrollDate * 1000).toISOString(),
        recipientCount: pendingPayroll.recipients.length,
      });
    }

    case "get_user_positions": {
      const address = args.address as Address;
      try {
        const positions = await contractService.getPositions(address);
        return JSON.stringify(
          positions.map((p) => ({
            payrollId: p.payrollId.toString(),
            usdcDeposited: (Number(p.usdcDeposited) / 1e6).toFixed(2),
            accumulatedYield: (Number(p.accumulatedYield) / 1e6).toFixed(2),
            payrollDate: new Date(Number(p.payrollDate) * 1000).toISOString(),
          }))
        );
      } catch (error) {
        return JSON.stringify({ error: (error as Error).message });
      }
    }

    case "get_usdc_balance": {
      const address = args.address as Address;
      try {
        const balance = await contractService.getUsdcBalance(address);
        return JSON.stringify({ balance, symbol: "USDC" });
      } catch (error) {
        return JSON.stringify({ error: (error as Error).message });
      }
    }

    case "get_withdrawable_balance": {
      const address = args.address as Address;
      try {
        const withdrawable = await yellowService.getWithdrawableBalance(address);
        return JSON.stringify({
          address: withdrawable.address,
          withdrawableBalance: withdrawable.balance,
          token: withdrawable.token,
          custodyContract: yellowService.getCustodyAddress(),
        });
      } catch (error) {
        return JSON.stringify({ error: (error as Error).message });
      }
    }

    case "get_withdrawal_transaction": {
      const amount = args.amount as string;
      try {
        const amountBigInt = parseUnits(amount, 6);
        const txData = yellowService.generateWithdrawCalldata(amountBigInt);
        return JSON.stringify({
          to: txData.to,
          data: txData.data,
          description: txData.description,
        });
      } catch (error) {
        return JSON.stringify({ error: (error as Error).message });
      }
    }

    case "get_ready_payrolls": {
      try {
        const readyIds = await contractService.getReadyPayrolls();
        return JSON.stringify({
          count: readyIds.length,
          payrollIds: readyIds.map((id) => id.toString()),
          message: readyIds.length > 0
            ? `${readyIds.length} payroll(s) ready to execute`
            : "No payrolls ready to execute",
        });
      } catch (error) {
        return JSON.stringify({ error: (error as Error).message });
      }
    }

    case "get_execute_payrolls_transaction": {
      try {
        const readyIds = await contractService.getReadyPayrolls();
        if (readyIds.length === 0) {
          return JSON.stringify({ error: "No payrolls ready to execute" });
        }
        const txData = contractService.generateExecuteReadyPayrollsCalldata();
        return JSON.stringify({
          to: txData.to,
          data: txData.data,
          description: `Execute ${readyIds.length} ready payroll(s) and bridge USDC to Arc Chain`,
          payrollCount: readyIds.length,
        });
      } catch (error) {
        return JSON.stringify({ error: (error as Error).message });
      }
    }

    default:
      return JSON.stringify({ error: "Unknown tool: " + name });
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

router.post("/chat", async (req: Request, res: Response) => {
  try {
    const { message, sessionId = "default", userAddress } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Get or create session
    let messages = sessions.get(sessionId);
    if (!messages) {
      messages = [{ role: "system", content: SYSTEM_PROMPT }];
      sessions.set(sessionId, messages);
    }

    // Add user message
    messages.push({ role: "user", content: message });

    // Store user address if provided
    if (userAddress) {
      const pendingPayroll = pendingPayrolls.get(sessionId) || {};
      pendingPayroll.userAddress = userAddress as Address;
      pendingPayrolls.set(sessionId, pendingPayroll);
    }

    // Call OpenAI with tools
    let response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages,
      tools,
      tool_choice: "auto",
    });

    let assistantMessage = response.choices[0].message;

    // Handle tool calls
    while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      messages.push(assistantMessage);

      // Execute each tool call
      for (const toolCall of assistantMessage.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        const result = await executeTool(
          sessionId,
          toolCall.function.name,
          args
        );

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      }

      // Get next response
      response = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages,
        tools,
        tool_choice: "auto",
      });

      assistantMessage = response.choices[0].message;
    }

    // Add final assistant message
    messages.push(assistantMessage);
    sessions.set(sessionId, messages);

    // Get pending payroll state for response
    const pendingPayroll = pendingPayrolls.get(sessionId);

    res.json({
      response: assistantMessage.content,
      sessionId,
      state: pendingPayroll
        ? {
            hasPayrollDate: !!pendingPayroll.payrollDate,
            hasRecipients: !!pendingPayroll.recipients?.length,
            recipientCount: pendingPayroll.recipients?.length || 0,
            totalAmount: pendingPayroll.totalAmount
              ? (Number(pendingPayroll.totalAmount) / 1e6).toFixed(2)
              : null,
          }
        : null,
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: "Failed to process chat message" });
  }
});

// Endpoint to upload CSV directly
router.post("/upload-csv", async (req: Request, res: Response) => {
  try {
    const { csvData, sessionId = "default" } = req.body;

    if (!csvData) {
      return res.status(400).json({ error: "CSV data is required" });
    }

    const result = await executeTool(sessionId, "parse_csv_recipients", {
      csvData,
    });
    res.json(JSON.parse(result));
  } catch (error) {
    console.error("CSV upload error:", error);
    res.status(500).json({ error: "Failed to parse CSV" });
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
router.get("/session/:sessionId", (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const pendingPayroll = pendingPayrolls.get(sessionId);

  if (!pendingPayroll) {
    return res.status(404).json({ error: "Session not found" });
  }

  res.json({
    hasPayrollDate: !!pendingPayroll.payrollDate,
    payrollDate: pendingPayroll.payrollDate
      ? new Date(pendingPayroll.payrollDate * 1000).toISOString()
      : null,
    recipientCount: pendingPayroll.recipients?.length || 0,
    totalAmount: pendingPayroll.totalAmount
      ? (Number(pendingPayroll.totalAmount) / 1e6).toFixed(2)
      : null,
  });
});

export { router as chatRouter };
