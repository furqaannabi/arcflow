import mongoose, { Schema, Document } from "mongoose";

// Message interface
export interface IMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  timestamp: Date;
  allowFileUpload?: boolean; // Flag to indicate if next message can have file
}

// Pending payroll data
export interface IPendingPayroll {
  payrollDate?: number;
  recipients?: Array<{
    wallet: string;
    amount: string; // Store as string for MongoDB
  }>;
  totalAmount?: string;
  userAddress?: string;
}

// Chat session document
export interface IChatSession extends Document {
  sessionId: string;
  messages: IMessage[];
  pendingPayroll: IPendingPayroll;
  createdAt: Date;
  updatedAt: Date;
  lastActivity: Date;
}

const MessageSchema = new Schema<IMessage>({
  role: {
    type: String,
    enum: ["system", "user", "assistant", "tool"],
    required: true,
  },
  content: { type: String, default: null },
  tool_call_id: { type: String },
  tool_calls: [{
    id: String,
    type: { type: String, default: "function" },
    function: {
      name: String,
      arguments: String,
    },
  }],
  timestamp: { type: Date, default: Date.now },
  allowFileUpload: { type: Boolean, default: false },
});

const PendingPayrollSchema = new Schema<IPendingPayroll>({
  payrollDate: { type: Number },
  recipients: [{
    wallet: String,
    amount: String,
  }],
  totalAmount: { type: String },
  userAddress: { type: String },
});

const ChatSessionSchema = new Schema<IChatSession>(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    messages: [MessageSchema],
    pendingPayroll: {
      type: PendingPayrollSchema,
      default: {},
    },
    lastActivity: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Index for cleanup of old sessions
ChatSessionSchema.index({ lastActivity: 1 }, { expireAfterSeconds: 86400 * 7 }); // 7 days TTL

export const ChatSession = mongoose.model<IChatSession>("ChatSession", ChatSessionSchema);
