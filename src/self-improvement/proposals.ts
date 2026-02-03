import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { CONFIG } from "../config/index.js";
import type { ImprovementProposal } from "./analyzer.js";
import logger from "../infrastructure/logger.js";

const log = logger.child({ module: "proposals" });

// Store proposals in the data directory
const PROPOSALS_DIR = join(dirname(CONFIG.paths.memory), "proposals");
const PROPOSALS_FILE = join(PROPOSALS_DIR, "improvements.json");

// Ensure directory exists
if (!existsSync(PROPOSALS_DIR)) {
  mkdirSync(PROPOSALS_DIR, { recursive: true });
}

interface ProposalsStore {
  proposals: ImprovementProposal[];
  lastAnalysis: string | null;
  totalProposed: number;
  totalImplemented: number;
}

class ProposalManager {
  private store: ProposalsStore;

  constructor() {
    this.store = this.load();
  }

  private load(): ProposalsStore {
    if (existsSync(PROPOSALS_FILE)) {
      try {
        const data = readFileSync(PROPOSALS_FILE, "utf-8");
        return JSON.parse(data);
      } catch (error) {
        log.warn("Could not load proposals, starting fresh");
      }
    }

    return {
      proposals: [],
      lastAnalysis: null,
      totalProposed: 0,
      totalImplemented: 0,
    };
  }

  private save(): void {
    writeFileSync(PROPOSALS_FILE, JSON.stringify(this.store, null, 2));
  }

  /**
   * Add a new improvement proposal
   */
  addProposal(proposal: ImprovementProposal): void {
    this.store.proposals.push(proposal);
    this.store.totalProposed++;
    this.store.lastAnalysis = new Date().toISOString();
    this.save();

    // Also save the code to a separate file for easy review
    this.saveCodeFile(proposal);

    log.info({ id: proposal.id }, "Proposal saved");
  }

  /**
   * Save the proposed code to a file for human review
   */
  private saveCodeFile(proposal: ImprovementProposal): void {
    const codeDir = join(PROPOSALS_DIR, "code");
    if (!existsSync(codeDir)) {
      mkdirSync(codeDir, { recursive: true });
    }

    const filename = `${proposal.id}-${proposal.solution.filename}`;
    const filepath = join(codeDir, filename);

    const content = `/**
 * EvolAI Self-Improvement Proposal
 * ================================
 * ID: ${proposal.id}
 * Created: ${proposal.createdAt}
 * Status: ${proposal.status}
 * 
 * Issue:
 * ------
 * Area: ${proposal.issue.area}
 * Severity: ${proposal.issue.severity}
 * Description: ${proposal.issue.description}
 * 
 * Solution:
 * ---------
 * ${proposal.solution.description}
 * 
 * Approach:
 * ---------
 * ${proposal.solution.approach}
 * 
 * Expected Impact:
 * ----------------
 * ${proposal.solution.estimatedImpact}
 */

${proposal.solution.code}
`;

    writeFileSync(filepath, content);
    log.info({ filepath }, "Code file saved for review");
  }

  /**
   * Get all pending proposals
   */
  getPending(): ImprovementProposal[] {
    return this.store.proposals.filter((p) => p.status === "proposed");
  }

  /**
   * Get recent proposals
   */
  getRecent(limit = 5): ImprovementProposal[] {
    return this.store.proposals
      .slice(-limit)
      .reverse();
  }

  /**
   * Update proposal status
   */
  updateStatus(id: string, status: ImprovementProposal["status"]): boolean {
    const proposal = this.store.proposals.find((p) => p.id === id);
    if (!proposal) return false;

    proposal.status = status;
    if (status === "implemented") {
      this.store.totalImplemented++;
    }
    this.save();
    return true;
  }

  /**
   * Get stats
   */
  getStats(): {
    total: number;
    pending: number;
    implemented: number;
    rejected: number;
    lastAnalysis: string | null;
  } {
    return {
      total: this.store.totalProposed,
      pending: this.store.proposals.filter((p) => p.status === "proposed").length,
      implemented: this.store.totalImplemented,
      rejected: this.store.proposals.filter((p) => p.status === "rejected").length,
      lastAnalysis: this.store.lastAnalysis,
    };
  }

  /**
   * Get summary for display
   */
  getSummary(): string {
    const stats = this.getStats();
    const pending = this.getPending();

    let summary = `## 🔧 Self-Improvement Status\n\n`;
    summary += `**Stats:**\n`;
    summary += `- Total proposals: ${stats.total}\n`;
    summary += `- Pending review: ${stats.pending}\n`;
    summary += `- Implemented: ${stats.implemented}\n`;
    summary += `- Last analysis: ${stats.lastAnalysis ? new Date(stats.lastAnalysis).toLocaleDateString() : "never"}\n\n`;

    if (pending.length > 0) {
      summary += `**Pending Proposals:**\n`;
      for (const p of pending.slice(0, 3)) {
        summary += `- [${p.issue.severity.toUpperCase()}] ${p.issue.area}: ${p.issue.description.slice(0, 50)}...\n`;
      }
    }

    return summary;
  }
}

export const proposals = new ProposalManager();
