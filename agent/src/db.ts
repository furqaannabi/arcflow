import mongoose from "mongoose";

let isConnected = false;

export async function connectDB(): Promise<void> {
  if (isConnected) {
    console.log("[DB] Already connected to MongoDB");
    return;
  }

  const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/arcflow";

  try {
    await mongoose.connect(mongoUri);
    isConnected = true;
    console.log("[DB] Connected to MongoDB:", mongoUri.split("@").pop() || mongoUri);

    mongoose.connection.on("error", (err) => {
      console.error("[DB] MongoDB error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.log("[DB] MongoDB disconnected");
      isConnected = false;
    });
  } catch (error) {
    console.error("[DB] Failed to connect to MongoDB:", error);
    throw error;
  }
}

export async function disconnectDB(): Promise<void> {
  if (!isConnected) return;

  try {
    await mongoose.disconnect();
    isConnected = false;
    console.log("[DB] Disconnected from MongoDB");
  } catch (error) {
    console.error("[DB] Error disconnecting from MongoDB:", error);
  }
}

export function isDBConnected(): boolean {
  return isConnected;
}
