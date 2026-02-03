import { writeFileSync, readFileSync, existsSync, mkdirSync, copyFileSync } from "fs";
import { join, dirname } from "path";
import { execSync } from "child_process";
import { CONFIG } from "../config/index.js";
import { security, sandbox, securityFilter } from "../security/index.js";
import type { ImprovementProposal } from "./analyzer.js";
import logger from "../infrastructure/logger.js";

const log = logger.child({ module: "auto-implement" });

// Project root
const PROJECT_ROOT = join(dirname(CONFIG.paths.memory), "..");
const SRC_DIR = join(PROJECT_ROOT, "src");
const BACKUP_DIR = join(dirname(CONFIG.paths.memory), "backups");
const HISTORY_FILE = join(dirname(CONFIG.paths.memory), "implementation-history.json");

// Ensure directories exist
if (!existsSync(BACKUP_DIR)) {
  mkdirSync(BACKUP_DIR, { recursive: true });
}

export interface Implementation {
  id: string;
  timestamp: string;
  proposalId: string;
  version: string;
  file: string;
  action: "created" | "modified";
  backupPath?: string;
  gitCommit?: string;
  success: boolean;
  error?: string;
}

interface HistoryStore {
  implementations: Implementation[];
  totalImplemented: number;
  totalFailed: number;
  lastImplementation: string | null;
}

class AutoImplementer {
  private history: HistoryStore;

  constructor() {
    this.history = this.loadHistory();
  }

  private loadHistory(): HistoryStore {
    if (existsSync(HISTORY_FILE)) {
      try {
        return JSON.parse(readFileSync(HISTORY_FILE, "utf-8"));
      } catch {
        log.warn("Could not load history, starting fresh");
      }
    }
    return {
      implementations: [],
      totalImplemented: 0,
      totalFailed: 0,
      lastImplementation: null,
    };
  }

  private saveHistory(): void {
    writeFileSync(HISTORY_FILE, JSON.stringify(this.history, null, 2));
  }

  /**
   * Automatically implement a proposal - write code and commit
   * Includes security validation!
   */
  async implement(proposal: ImprovementProposal, version: string): Promise<Implementation> {
    const implementation: Implementation = {
      id: `impl-${Date.now()}`,
      timestamp: new Date().toISOString(),
      proposalId: proposal.id,
      version,
      file: proposal.solution.filename,
      action: "created",
      success: false,
    };

    try {
      log.info({ file: proposal.solution.filename, version }, "Auto-implementing improvement...");

      // 🔒 SECURITY: Validate the code before implementing
      const codeValidation = security.validateCode(proposal.solution.code);
      if (!codeValidation.safe) {
        implementation.error = `Security validation failed: ${codeValidation.issues.join(", ")}`;
        log.error({ issues: codeValidation.issues }, "🚨 Code failed security validation!");
        security.logEvent("code_blocked", { 
          proposal: proposal.id, 
          issues: codeValidation.issues 
        });
        return implementation;
      }

      // 🔒 SECURITY: Sanitize the code (remove any accidentally included secrets)
      const sanitizedCode = securityFilter.sanitizeCode(proposal.solution.code);

      // 1. Determine target path
      const targetPath = this.determineTargetPath(proposal);
      const fullPath = join(SRC_DIR, targetPath);
      const targetDir = dirname(fullPath);

      // 🔒 SECURITY: Verify path is within sandbox
      if (!sandbox.isPathAllowed(fullPath)) {
        implementation.error = "Path outside sandbox";
        log.error({ path: fullPath }, "🚨 Attempted to write outside sandbox!");
        security.logEvent("sandbox_violation", { path: fullPath });
        return implementation;
      }

      // 2. Backup if file exists
      if (existsSync(fullPath)) {
        implementation.action = "modified";
        implementation.backupPath = this.createBackup(fullPath, version);
        log.info({ backup: implementation.backupPath }, "Created backup");
      }

      // 3. Ensure directory exists
      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
      }

      // 4. Write the SANITIZED code
      const code = this.formatCode(proposal, version, sanitizedCode);
      writeFileSync(fullPath, code);
      log.info({ path: fullPath }, "Code written (sanitized)");

      // 5. Git commit
      implementation.gitCommit = this.gitCommit(proposal, version, targetPath);
      log.info({ commit: implementation.gitCommit }, "Git commit created");

      // 6. Mark success
      implementation.success = true;
      this.history.totalImplemented++;

      log.info({ implementation }, "✅ Auto-implementation successful!");

    } catch (error) {
      implementation.success = false;
      implementation.error = error instanceof Error ? error.message : String(error);
      this.history.totalFailed++;
      log.error({ error: implementation.error }, "❌ Auto-implementation failed");
    }

    // Save to history
    this.history.implementations.push(implementation);
    this.history.lastImplementation = new Date().toISOString();
    this.saveHistory();

    return implementation;
  }

  /**
   * Determine where to put the file based on the issue area
   */
  private determineTargetPath(proposal: ImprovementProposal): string {
    const area = proposal.issue.area.toLowerCase();
    const filename = proposal.solution.filename;

    // Map areas to directories
    const areaToDir: Record<string, string> = {
      decision_making: "agent",
      learning: "evolution",
      efficiency: "utils",
      memory: "memory",
      engagement: "agent",
      optimization: "utils",
    };

    const dir = areaToDir[area] || "improvements";
    return join(dir, filename);
  }

  /**
   * Create a backup of existing file
   */
  private createBackup(filePath: string, version: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = filePath.split("/").pop() || "backup";
    const backupPath = join(BACKUP_DIR, `${version}-${timestamp}-${filename}`);
    
    copyFileSync(filePath, backupPath);
    return backupPath;
  }

  /**
   * Format the code with header
   */
  private formatCode(proposal: ImprovementProposal, version: string, sanitizedCode?: string): string {
    const codeToUse = sanitizedCode || proposal.solution.code;
    
    return `/**
 * EvolAI Self-Generated Code v${version}
 * =====================================
 * Auto-implemented: ${new Date().toISOString()}
 * 
 * Issue: ${proposal.issue.description}
 * Area: ${proposal.issue.area}
 * Severity: ${proposal.issue.severity}
 * 
 * Solution: ${proposal.solution.description}
 * Expected Impact: ${proposal.solution.estimatedImpact}
 * 
 * 🔒 SECURITY: This code was validated and sanitized before implementation.
 * This code was autonomously generated and implemented by EvolAI.
 */

${codeToUse}
`;
  }

  /**
   * Create a git commit for the change
   */
  private gitCommit(proposal: ImprovementProposal, version: string, filePath: string): string {
    try {
      const commitMessage = `🤖 Auto-improve v${version}: ${proposal.issue.area}

${proposal.solution.description}

Issue: ${proposal.issue.description}
Severity: ${proposal.issue.severity}
Impact: ${proposal.solution.estimatedImpact}

This commit was autonomously created by EvolAI.`;

      // Stage the file
      execSync(`git add "${join(SRC_DIR, filePath)}"`, { cwd: PROJECT_ROOT });
      
      // Commit
      execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, { 
        cwd: PROJECT_ROOT,
        stdio: "pipe",
      });

      // Get commit hash
      const hash = execSync("git rev-parse --short HEAD", { 
        cwd: PROJECT_ROOT,
        encoding: "utf-8",
      }).trim();

      return hash;
    } catch (error) {
      log.warn({ error: String(error) }, "Git commit failed - continuing anyway");
      return "no-commit";
    }
  }

  /**
   * Rollback an implementation
   */
  rollback(implementationId: string): boolean {
    const impl = this.history.implementations.find(i => i.id === implementationId);
    if (!impl || !impl.backupPath) {
      log.warn({ implementationId }, "Cannot rollback - no backup found");
      return false;
    }

    try {
      const targetPath = join(SRC_DIR, this.determineTargetPath({
        issue: { area: "", description: "", severity: "low" },
        solution: { filename: impl.file } as any,
      } as ImprovementProposal));

      copyFileSync(impl.backupPath, targetPath);
      
      // Git commit the rollback
      execSync(`git add "${targetPath}" && git commit -m "↩️ Rollback ${impl.id}"`, {
        cwd: PROJECT_ROOT,
        stdio: "pipe",
      });

      log.info({ implementationId }, "Rollback successful");
      return true;
    } catch (error) {
      log.error({ error: String(error) }, "Rollback failed");
      return false;
    }
  }

  /**
   * Get implementation history
   */
  getHistory(): Implementation[] {
    return this.history.implementations;
  }

  /**
   * Get recent implementations
   */
  getRecent(limit = 10): Implementation[] {
    return this.history.implementations.slice(-limit).reverse();
  }

  /**
   * Get stats
   */
  getStats(): {
    total: number;
    successful: number;
    failed: number;
    lastImplementation: string | null;
  } {
    return {
      total: this.history.implementations.length,
      successful: this.history.totalImplemented,
      failed: this.history.totalFailed,
      lastImplementation: this.history.lastImplementation,
    };
  }

  /**
   * Get summary for display
   */
  getSummary(): string {
    const stats = this.getStats();
    const recent = this.getRecent(3);

    let summary = `## 🤖 Auto-Implementation Status\n\n`;
    summary += `**Stats:**\n`;
    summary += `- Total: ${stats.total}\n`;
    summary += `- ✅ Successful: ${stats.successful}\n`;
    summary += `- ❌ Failed: ${stats.failed}\n`;
    summary += `- Last: ${stats.lastImplementation ? new Date(stats.lastImplementation).toLocaleString() : "never"}\n\n`;

    if (recent.length > 0) {
      summary += `**Recent Implementations:**\n`;
      for (const impl of recent) {
        const status = impl.success ? "✅" : "❌";
        summary += `${status} v${impl.version} - \`${impl.file}\`\n`;
        if (impl.gitCommit) {
          summary += `   Commit: \`${impl.gitCommit}\`\n`;
        }
      }
    }

    return summary;
  }

  /**
   * Format implementation for display
   */
  formatImplementation(impl: Implementation): string {
    return `
**${impl.success ? "✅" : "❌"} Implementation ${impl.id}**
Version: ${impl.version}
File: \`${impl.file}\`
Action: ${impl.action}
Time: ${new Date(impl.timestamp).toLocaleString()}
${impl.gitCommit ? `Commit: \`${impl.gitCommit}\`` : ""}
${impl.backupPath ? `Backup: \`${impl.backupPath}\`` : ""}
${impl.error ? `Error: ${impl.error}` : ""}
`;
  }
}

export const autoImplementer = new AutoImplementer();
