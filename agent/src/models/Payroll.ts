import mongoose, { Schema, Document } from "mongoose";

export interface IRecipient {
  wallet: string;
  amount: string; // stored as string for BigInt compat
}

export interface IPayroll extends Document {
  payrollId: number;
  employerWallet: string;
  recipients: IRecipient[];
  totalAmount: string;
  payrollDate: number; // unix timestamp
  chainId: number;
  txHash?: string;
  status: "pending" | "deposited" | "executed" | "settled";
  createdAt: Date;
  updatedAt: Date;
}

const RecipientSchema = new Schema<IRecipient>(
  {
    wallet: { type: String, required: true },
    amount: { type: String, required: true },
  },
  { _id: false }
);

const PayrollSchema = new Schema<IPayroll>(
  {
    payrollId: { type: Number, index: true },
    employerWallet: { type: String, required: true, index: true },
    recipients: { type: [RecipientSchema], required: true },
    totalAmount: { type: String, required: true },
    payrollDate: { type: Number, required: true },
    chainId: { type: Number, default: 84532 },
    txHash: { type: String },
    status: {
      type: String,
      enum: ["pending", "deposited", "executed", "settled"],
      default: "pending",
    },
  },
  { timestamps: true }
);

PayrollSchema.index({ employerWallet: 1, status: 1 });

export const Payroll = mongoose.model<IPayroll>("Payroll", PayrollSchema);
