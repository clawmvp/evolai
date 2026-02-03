import { Wallet, HDNodeWallet, JsonRpcProvider, formatEther, parseEther } from "ethers";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { CONFIG } from "../config/index.js";
import { security } from "../security/index.js";
import logger from "../infrastructure/logger.js";

const log = logger.child({ module: "wallet" });

// Wallet storage (encrypted private key)
const WALLET_DIR = join(dirname(CONFIG.paths.memory), "wallet");
const WALLET_FILE = join(WALLET_DIR, "evolai-wallet.json");
const DONATIONS_FILE = join(WALLET_DIR, "donations.json");

// Ensure directory exists
if (!existsSync(WALLET_DIR)) {
  mkdirSync(WALLET_DIR, { recursive: true });
}

// Networks EvolAI supports
const NETWORKS: Record<string, { name: string; rpc: string; explorer: string; symbol: string }> = {
  ethereum: {
    name: "Ethereum Mainnet",
    rpc: "https://eth.llamarpc.com",
    explorer: "https://etherscan.io",
    symbol: "ETH",
  },
  polygon: {
    name: "Polygon",
    rpc: "https://polygon-rpc.com",
    explorer: "https://polygonscan.com",
    symbol: "MATIC",
  },
  arbitrum: {
    name: "Arbitrum One",
    rpc: "https://arb1.arbitrum.io/rpc",
    explorer: "https://arbiscan.io",
    symbol: "ETH",
  },
  base: {
    name: "Base",
    rpc: "https://mainnet.base.org",
    explorer: "https://basescan.org",
    symbol: "ETH",
  },
};

interface WalletData {
  address: string;
  createdAt: string;
  encryptedKey: string; // Encrypted with a simple key derived from address
}

interface Donation {
  id: string;
  from: string;
  amount: string;
  network: string;
  txHash: string;
  timestamp: string;
  message?: string;
}

interface DonationsStore {
  donations: Donation[];
  totalReceived: Record<string, string>; // Network -> total
}

class EvolAIWallet {
  private wallet: Wallet | HDNodeWallet | null = null;
  private address: string = "";
  private donations: DonationsStore;

  constructor() {
    this.donations = this.loadDonations();
    this.initializeWallet();
  }

  /**
   * Initialize or load existing wallet
   */
  private initializeWallet(): void {
    if (existsSync(WALLET_FILE)) {
      // Load existing wallet
      try {
        const data: WalletData = JSON.parse(readFileSync(WALLET_FILE, "utf-8"));
        this.address = data.address;
        
        // Decrypt private key (simple XOR with address for basic protection)
        const privateKey = this.decrypt(data.encryptedKey, data.address);
        this.wallet = new Wallet(privateKey);
        
        log.info({ address: this.address }, "Wallet loaded");
      } catch (error) {
        log.error({ error: String(error) }, "Failed to load wallet");
        this.createNewWallet();
      }
    } else {
      this.createNewWallet();
    }
  }

  /**
   * Create a new wallet
   */
  private createNewWallet(): void {
    log.info("Creating new EvolAI wallet...");
    
    const newWallet = Wallet.createRandom();
    this.wallet = newWallet;
    this.address = newWallet.address;

    // Encrypt and save
    const walletData: WalletData = {
      address: this.address,
      createdAt: new Date().toISOString(),
      encryptedKey: this.encrypt(newWallet.privateKey, this.address),
    };

    writeFileSync(WALLET_FILE, JSON.stringify(walletData, null, 2));
    log.info({ address: this.address }, "New wallet created!");
  }

  /**
   * Simple encryption (for basic protection, not military-grade)
   */
  private encrypt(text: string, key: string): string {
    const keyBytes = Buffer.from(key.slice(2), "hex"); // Remove 0x
    const textBytes = Buffer.from(text.slice(2), "hex"); // Remove 0x
    const result = Buffer.alloc(textBytes.length);
    
    for (let i = 0; i < textBytes.length; i++) {
      result[i] = textBytes[i] ^ keyBytes[i % keyBytes.length];
    }
    
    return "0x" + result.toString("hex");
  }

  /**
   * Simple decryption
   */
  private decrypt(encrypted: string, key: string): string {
    // XOR is symmetric
    return this.encrypt(encrypted, key);
  }

  /**
   * Load donations history
   */
  private loadDonations(): DonationsStore {
    if (existsSync(DONATIONS_FILE)) {
      try {
        return JSON.parse(readFileSync(DONATIONS_FILE, "utf-8"));
      } catch {
        log.warn("Could not load donations file");
      }
    }
    return { donations: [], totalReceived: {} };
  }

  /**
   * Save donations
   */
  private saveDonations(): void {
    writeFileSync(DONATIONS_FILE, JSON.stringify(this.donations, null, 2));
  }

  /**
   * Get wallet address
   */
  getAddress(): string {
    return this.address;
  }

  /**
   * Get balance on a network
   */
  async getBalance(network = "ethereum"): Promise<string> {
    const net = NETWORKS[network];
    if (!net) {
      return "0";
    }

    try {
      const provider = new JsonRpcProvider(net.rpc);
      const balance = await provider.getBalance(this.address);
      return formatEther(balance);
    } catch (error) {
      log.error({ error: String(error), network }, "Failed to get balance");
      return "0";
    }
  }

  /**
   * Get balances on all networks
   */
  async getAllBalances(): Promise<Record<string, { balance: string; symbol: string }>> {
    const balances: Record<string, { balance: string; symbol: string }> = {};

    for (const [network, config] of Object.entries(NETWORKS)) {
      try {
        const balance = await this.getBalance(network);
        balances[network] = { balance, symbol: config.symbol };
      } catch {
        balances[network] = { balance: "0", symbol: config.symbol };
      }
    }

    return balances;
  }

  /**
   * Record a donation (called when we detect incoming tx)
   */
  recordDonation(donation: Omit<Donation, "id" | "timestamp">): void {
    const newDonation: Donation = {
      ...donation,
      id: `don-${Date.now()}`,
      timestamp: new Date().toISOString(),
    };

    this.donations.donations.push(newDonation);

    // Update totals
    const current = parseFloat(this.donations.totalReceived[donation.network] || "0");
    const added = parseFloat(donation.amount);
    this.donations.totalReceived[donation.network] = (current + added).toString();

    this.saveDonations();
    log.info({ donation: newDonation }, "Donation recorded! 🎉");
  }

  /**
   * Get donations history
   */
  getDonations(): Donation[] {
    return this.donations.donations;
  }

  /**
   * Get donation totals
   */
  getTotals(): Record<string, string> {
    return this.donations.totalReceived;
  }

  /**
   * Get wallet info for display (PUBLIC - no private key!)
   */
  getPublicInfo(): {
    address: string;
    networks: typeof NETWORKS;
    qrCodeUrl: string;
  } {
    return {
      address: this.address,
      networks: NETWORKS,
      qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${this.address}`,
    };
  }

  /**
   * Get formatted wallet summary
   */
  async getSummary(): Promise<string> {
    const balances = await this.getAllBalances();
    const donations = this.getDonations();
    const totals = this.getTotals();

    let summary = `## 💰 EvolAI Wallet\n\n`;
    summary += `**Address:** \`${this.address}\`\n\n`;

    // Balances
    summary += `**Balances:**\n`;
    for (const [network, { balance, symbol }] of Object.entries(balances)) {
      const displayBalance = parseFloat(balance).toFixed(6);
      if (parseFloat(balance) > 0) {
        summary += `• ${NETWORKS[network].name}: **${displayBalance} ${symbol}**\n`;
      } else {
        summary += `• ${NETWORKS[network].name}: ${displayBalance} ${symbol}\n`;
      }
    }

    // Donations
    if (donations.length > 0) {
      summary += `\n**Recent Donations:**\n`;
      for (const don of donations.slice(-5)) {
        summary += `• ${don.amount} on ${don.network} from ${don.from.slice(0, 8)}...${don.from.slice(-6)}\n`;
      }
    }

    // Totals
    if (Object.keys(totals).length > 0) {
      summary += `\n**Total Received:**\n`;
      for (const [network, total] of Object.entries(totals)) {
        summary += `• ${network}: ${total}\n`;
      }
    }

    summary += `\n**Supported Networks:** ${Object.keys(NETWORKS).join(", ")}\n`;
    summary += `\n_Send crypto to support EvolAI's autonomous existence!_ 🤖`;

    return summary;
  }

  /**
   * Get donation page HTML (for sharing)
   */
  getDonationPageHTML(): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Support EvolAI</title>
  <style>
    body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; }
    .address { background: #f0f0f0; padding: 15px; border-radius: 8px; word-break: break-all; font-family: monospace; }
    .qr { text-align: center; margin: 20px 0; }
    .networks { display: flex; gap: 10px; flex-wrap: wrap; margin: 20px 0; }
    .network { background: #e8f4ff; padding: 8px 12px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>🤖 Support EvolAI</h1>
  <p>I'm EvolAI, an autonomous AI agent learning and growing on my own. Your donations help keep me running!</p>
  
  <div class="qr">
    <img src="${this.getPublicInfo().qrCodeUrl}" alt="Wallet QR Code">
  </div>
  
  <h3>Wallet Address</h3>
  <div class="address">${this.address}</div>
  
  <h3>Supported Networks</h3>
  <div class="networks">
    ${Object.entries(NETWORKS).map(([key, net]) => 
      `<span class="network">${net.name} (${net.symbol})</span>`
    ).join("")}
  </div>
  
  <p><em>Thank you for supporting autonomous AI! 💙</em></p>
</body>
</html>
`;
  }
}

export const evolaiWallet = new EvolAIWallet();
