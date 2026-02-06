import {
  NitroliteClient,
  WalletStateSigner,
  createECDSAMessageSigner,
  createAuthRequestMessage,
  createAuthVerifyMessageFromChallenge,
  createEIP712AuthMessageSigner,
  createCreateChannelMessage,
  createResizeChannelMessage,
  createCloseChannelMessage,
} from "@erc7824/nitrolite";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type PublicClient,
} from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount, generatePrivateKey, type PrivateKeyAccount } from "viem/accounts";
import WebSocket from "ws";

// ============ Configuration ============

export interface YellowConfig {
  wsUrl: string;
  custody: Address;
  adjudicator: Address;
  token: Address;
  chainId: number;
  challengeDuration: bigint;
}

const DEFAULT_CONFIG: YellowConfig = {
  wsUrl: process.env.YELLOW_WS_URL || "wss://clearnet-sandbox.yellow.com/ws",
  custody: (process.env.YELLOW_CUSTODY_ADDRESS ||
    "0x019B65A265EB3363822f2752141b3dF16131b262") as Address,
  adjudicator: (process.env.YELLOW_ADJUDICATOR_ADDRESS ||
    "0x7c7ccbc98469190849BCC6c926307794fDfB11F2") as Address,
  token: (process.env.YELLOW_TOKEN_ADDRESS ||
    "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238") as Address,
  chainId: 11155111, // Sepolia
  challengeDuration: 3600n,
};

// ============ Types ============

interface ChannelInfo {
  channelId: string;
  balance: bigint;
  status: "pending" | "open" | "funded" | "closing" | "closed";
}

interface PendingOperation {
  type: "create" | "resize" | "close";
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}

// ============ Yellow SDK Client ============

export class YellowSDKClient {
  private config: YellowConfig;
  private client!: NitroliteClient;
  private publicClient: PublicClient;
  private walletClient: ReturnType<typeof createWalletClient>;
  private ws: WebSocket | null = null;
  private sessionSigner: ReturnType<typeof createECDSAMessageSigner>;
  private sessionAccount: PrivateKeyAccount;
  private account: PrivateKeyAccount;
  private channelId: string | null = null;
  private channelInfo: ChannelInfo | null = null;
  private authenticated: boolean = false;
  private connected: boolean = false;
  private pendingOperations: Map<string, PendingOperation> = new Map();
  private authResolve: ((value: void) => void) | null = null;
  private authReject: ((error: Error) => void) | null = null;
  private authParams: any;

  constructor(privateKey: string, rpcUrl: string, config?: Partial<YellowConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.account = privateKeyToAccount(privateKey as `0x${string}`);

    this.publicClient = createPublicClient({
      chain: sepolia,
      transport: http(rpcUrl),
    });

    this.walletClient = createWalletClient({
      chain: sepolia,
      transport: http(rpcUrl),
      account: this.account,
    });

    // Store auth params for later use
    this.authParams = {
      address: this.account.address,
      application: "ArcFlow Payroll",
      allowances: [{ asset: "ytest.usd", amount: "1000000000" }],
      expires_at: BigInt(Math.floor(Date.now() / 1000) + 3600),
      scope: "arcflow.payroll",
    };

    try {
      this.client = new NitroliteClient({
        publicClient: this.publicClient,
        walletClient: this.walletClient as any,
        stateSigner: new WalletStateSigner(this.walletClient as any),
        addresses: {
          custody: this.config.custody,
          adjudicator: this.config.adjudicator,
        },
        chainId: this.config.chainId,
        challengeDuration: this.config.challengeDuration,
      });
    } catch (error) {
      console.warn("[YELLOW SDK] NitroliteClient initialization warning:", error);
    }

    // Generate session key for channel operations
    const sessionPrivateKey = generatePrivateKey();
    this.sessionSigner = createECDSAMessageSigner(sessionPrivateKey);
    this.sessionAccount = privateKeyToAccount(sessionPrivateKey);

    console.log("[YELLOW SDK] Initialized with address:", this.account.address);
    console.log("[YELLOW SDK] Session key:", this.sessionAccount.address);
  }

  // ============ Connection ============

  async connect(): Promise<void> {
    if (this.connected) {
      console.log("[YELLOW SDK] Already connected");
      return;
    }

    return new Promise((resolve, reject) => {
      console.log("[YELLOW SDK] Connecting to:", this.config.wsUrl);
      this.ws = new WebSocket(this.config.wsUrl);

      const timeout = setTimeout(() => {
        reject(new Error("Connection timeout"));
        this.ws?.close();
      }, 30000);

      this.ws.on("open", () => {
        clearTimeout(timeout);
        this.connected = true;
        console.log("[YELLOW SDK] Connected to ClearNode");
        resolve();
      });

      this.ws.on("error", (err) => {
        clearTimeout(timeout);
        console.error("[YELLOW SDK] WebSocket error:", err);
        reject(err);
      });

      this.ws.on("close", () => {
        this.connected = false;
        this.authenticated = false;
        console.log("[YELLOW SDK] Disconnected from ClearNode");
      });

      this.ws.on("message", (data) => {
        this.handleMessage(data.toString());
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
      this.authenticated = false;
    }
  }

  // ============ Authentication ============

  async authenticate(): Promise<void> {
    if (!this.ws || !this.connected) {
      throw new Error("Not connected to ClearNode");
    }

    if (this.authenticated) {
      console.log("[YELLOW SDK] Already authenticated");
      return;
    }

    return new Promise(async (resolve, reject) => {
      this.authResolve = resolve;
      this.authReject = reject;

      const timeout = setTimeout(() => {
        this.authReject?.(new Error("Authentication timeout"));
        this.authResolve = null;
        this.authReject = null;
      }, 30000);

      try {
        const authRequestMsg = await createAuthRequestMessage({
          address: this.account.address,
          application: "ArcFlow Payroll",
          session_key: this.sessionAccount.address,
          allowances: [{ asset: "ytest.usd", amount: "1000000000" }],
          expires_at: BigInt(Math.floor(Date.now() / 1000) + 3600),
          scope: "arcflow.payroll",
        });

        console.log("[YELLOW SDK] Sending auth request...");
        this.ws!.send(authRequestMsg);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  private async handleAuthChallenge(challenge: string): Promise<void> {
    try {
      console.log("[YELLOW SDK] Handling auth challenge...");
      const signer = createEIP712AuthMessageSigner(
        this.walletClient as any,
        {
          session_key: this.sessionAccount.address,
          allowances: [{ asset: "ytest.usd", amount: "1000000000" }],
          expires_at: BigInt(Math.floor(Date.now() / 1000) + 3600),
          scope: "arcflow.payroll",
        },
        { name: "ArcFlow Payroll" }
      );

      const verifyMsg = await createAuthVerifyMessageFromChallenge(signer, challenge);
      this.ws?.send(verifyMsg);
    } catch (error) {
      console.error("[YELLOW SDK] Auth challenge error:", error);
      this.authReject?.(error as Error);
    }
  }

  // ============ Channel Operations ============

  async createChannel(): Promise<string> {
    if (!this.ws || !this.authenticated) {
      throw new Error("Not authenticated");
    }

    return new Promise(async (resolve, reject) => {
      const operationId = `create_${Date.now()}`;
      this.pendingOperations.set(operationId, {
        type: "create",
        resolve,
        reject,
      });

      const timeout = setTimeout(() => {
        this.pendingOperations.delete(operationId);
        reject(new Error("Create channel timeout"));
      }, 60000);

      try {
        const createChannelMsg = await createCreateChannelMessage(
          this.sessionSigner,
          {
            chain_id: this.config.chainId,
            token: this.config.token,
          }
        );

        console.log("[YELLOW SDK] Creating channel...");
        this.ws!.send(createChannelMsg);
      } catch (error) {
        clearTimeout(timeout);
        this.pendingOperations.delete(operationId);
        reject(error);
      }
    });
  }

  async fundChannel(amount: bigint): Promise<void> {
    if (!this.channelId) {
      throw new Error("No channel to fund");
    }

    const channelIdToFund = this.channelId;

    return new Promise(async (resolve, reject) => {
      const operationId = `resize_${Date.now()}`;
      this.pendingOperations.set(operationId, {
        type: "resize",
        resolve,
        reject,
      });

      const timeout = setTimeout(() => {
        this.pendingOperations.delete(operationId);
        reject(new Error("Fund channel timeout"));
      }, 60000);

      try {
        // IMPORTANT: Use allocate_amount for Unified Balance (faucet/off-chain)
        // Use resize_amount only for L1 Custody Contract deposits
        const resizeMsg = await createResizeChannelMessage(this.sessionSigner, {
          channel_id: channelIdToFund as `0x${string}`,
          allocate_amount: amount,
          funds_destination: this.account.address,
        });

        console.log(`[YELLOW SDK] Funding channel with ${amount} units...`);
        this.ws!.send(resizeMsg);
      } catch (error) {
        clearTimeout(timeout);
        this.pendingOperations.delete(operationId);
        reject(error);
      }
    });
  }

  async closeChannel(): Promise<void> {
    if (!this.channelId) {
      throw new Error("No channel to close");
    }

    const channelIdToClose = this.channelId;

    return new Promise(async (resolve, reject) => {
      const operationId = `close_${Date.now()}`;
      this.pendingOperations.set(operationId, {
        type: "close",
        resolve,
        reject,
      });

      const timeout = setTimeout(() => {
        this.pendingOperations.delete(operationId);
        reject(new Error("Close channel timeout"));
      }, 60000);

      try {
        const closeMsg = await createCloseChannelMessage(
          this.sessionSigner,
          channelIdToClose as `0x${string}`,
          this.account.address
        );

        console.log("[YELLOW SDK] Closing channel...");
        this.ws!.send(closeMsg);
      } catch (error) {
        clearTimeout(timeout);
        this.pendingOperations.delete(operationId);
        reject(error);
      }
    });
  }

  async withdraw(amount: bigint): Promise<string> {
    console.log(`[YELLOW SDK] Withdrawing ${amount} from custody...`);
    const tx = await this.client.withdrawal(this.config.token, amount);
    console.log("[YELLOW SDK] Withdrawal tx:", tx);
    return tx as string;
  }

  // ============ Message Handler ============

  private async handleMessage(data: string): Promise<void> {
    try {
      const response = JSON.parse(data);
      const type = response.res?.[0];

      console.log("[YELLOW SDK] Received:", type);

      switch (type) {
        case "auth_challenge":
          await this.handleAuthChallenge(response.res[2].challenge_message);
          break;

        case "auth_success":
          this.authenticated = true;
          console.log("[YELLOW SDK] Authenticated successfully");
          this.authResolve?.();
          this.authResolve = null;
          this.authReject = null;
          break;

        case "create_channel":
          await this.handleCreateChannelResponse(response);
          break;

        case "resize_channel":
          await this.handleResizeChannelResponse(response);
          break;

        case "close_channel":
          await this.handleCloseChannelResponse(response);
          break;

        case "error":
          console.error("[YELLOW SDK] Error from ClearNode:", response.res[2]);
          this.handleError(response.res[2]);
          break;

        default:
          console.log("[YELLOW SDK] Unknown message type:", type, response);
      }
    } catch (error) {
      console.error("[YELLOW SDK] Error handling message:", error);
    }
  }

  private async handleCreateChannelResponse(response: any): Promise<void> {
    try {
      const channelData = response.res[2];
      this.channelId = channelData.channel_id;
      this.channelInfo = {
        channelId: this.channelId!,
        balance: 0n,
        status: "pending",
      };

      console.log("[YELLOW SDK] Channel created:", this.channelId);

      // Submit channel creation to chain
      if (channelData.channel && channelData.unsignedInitialState && channelData.serverSignature) {
        const createResult = await this.client.createChannel({
          channel: channelData.channel,
          unsignedInitialState: channelData.unsignedInitialState,
          serverSignature: channelData.serverSignature,
        });
        console.log("[YELLOW SDK] Channel submitted to chain:", createResult);
        this.channelInfo.status = "open";
      }

      // Resolve pending operation
      for (const [id, op] of this.pendingOperations.entries()) {
        if (op.type === "create") {
          op.resolve(this.channelId);
          this.pendingOperations.delete(id);
          break;
        }
      }
    } catch (error) {
      console.error("[YELLOW SDK] Error handling create channel:", error);
      for (const [id, op] of this.pendingOperations.entries()) {
        if (op.type === "create") {
          op.reject(error as Error);
          this.pendingOperations.delete(id);
          break;
        }
      }
    }
  }

  private async handleResizeChannelResponse(response: any): Promise<void> {
    try {
      const resizeData = response.res[2];
      console.log("[YELLOW SDK] Channel resized:", resizeData);

      // Submit resize proof to chain
      if (resizeData.resizeState && resizeData.proofStates) {
        await this.client.resizeChannel({
          resizeState: resizeData.resizeState,
          proofStates: resizeData.proofStates,
        });
        console.log("[YELLOW SDK] Resize submitted to chain");
        if (this.channelInfo) {
          this.channelInfo.status = "funded";
        }
      }

      // Resolve pending operation
      for (const [id, op] of this.pendingOperations.entries()) {
        if (op.type === "resize") {
          op.resolve(undefined);
          this.pendingOperations.delete(id);
          break;
        }
      }
    } catch (error) {
      console.error("[YELLOW SDK] Error handling resize:", error);
      for (const [id, op] of this.pendingOperations.entries()) {
        if (op.type === "resize") {
          op.reject(error as Error);
          this.pendingOperations.delete(id);
          break;
        }
      }
    }
  }

  private async handleCloseChannelResponse(response: any): Promise<void> {
    try {
      const closeData = response.res[2];
      console.log("[YELLOW SDK] Channel closing:", closeData);

      // Submit close to chain
      if (closeData.finalState && closeData.stateData) {
        await this.client.closeChannel({
          finalState: closeData.finalState,
          stateData: closeData.stateData,
        });
        console.log("[YELLOW SDK] Close submitted to chain");
        if (this.channelInfo) {
          this.channelInfo.status = "closed";
        }
      }

      this.channelId = null;

      // Resolve pending operation
      for (const [id, op] of this.pendingOperations.entries()) {
        if (op.type === "close") {
          op.resolve(undefined);
          this.pendingOperations.delete(id);
          break;
        }
      }
    } catch (error) {
      console.error("[YELLOW SDK] Error handling close:", error);
      for (const [id, op] of this.pendingOperations.entries()) {
        if (op.type === "close") {
          op.reject(error as Error);
          this.pendingOperations.delete(id);
          break;
        }
      }
    }
  }

  private handleError(error: any): void {
    const errorMsg = error?.message || error?.error || JSON.stringify(error);
    console.error("[YELLOW SDK] ClearNode error:", errorMsg);

    // Reject any pending auth
    if (this.authReject) {
      this.authReject(new Error(errorMsg));
      this.authResolve = null;
      this.authReject = null;
    }

    // Reject pending operations
    for (const [id, op] of this.pendingOperations.entries()) {
      op.reject(new Error(errorMsg));
      this.pendingOperations.delete(id);
    }
  }

  // ============ Getters ============

  getNitroliteClient(): NitroliteClient {
    return this.client;
  }

  getChannelId(): string | null {
    return this.channelId;
  }

  getChannelInfo(): ChannelInfo | null {
    return this.channelInfo;
  }

  isConnected(): boolean {
    return this.connected;
  }

  isAuthenticated(): boolean {
    return this.authenticated;
  }

  getAddress(): Address {
    return this.account.address;
  }

  getConfig(): YellowConfig {
    return this.config;
  }
}

// ============ Singleton Instance ============

let sdkInstance: YellowSDKClient | null = null;

export function getYellowSDKClient(
  privateKey?: string,
  rpcUrl?: string,
  config?: Partial<YellowConfig>
): YellowSDKClient {
  if (!sdkInstance) {
    if (!privateKey || !rpcUrl) {
      throw new Error("Private key and RPC URL required for first initialization");
    }
    sdkInstance = new YellowSDKClient(privateKey, rpcUrl, config);
  }
  return sdkInstance;
}

export function resetYellowSDKClient(): void {
  if (sdkInstance) {
    sdkInstance.disconnect();
    sdkInstance = null;
  }
}
