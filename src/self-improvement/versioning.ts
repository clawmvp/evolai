import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { CONFIG } from "../config/index.js";
import type { ImprovementProposal } from "./analyzer.js";
import logger from "../infrastructure/logger.js";

const log = logger.child({ module: "versioning" });

// Versioning directory
const VERSION_DIR = join(dirname(CONFIG.paths.memory), "versions");
const CHANGELOG_FILE = join(VERSION_DIR, "CHANGELOG.md");
const VERSIONS_FILE = join(VERSION_DIR, "versions.json");

// Ensure directory exists
if (!existsSync(VERSION_DIR)) {
  mkdirSync(VERSION_DIR, { recursive: true });
}

export interface Version {
  id: string;
  version: string;
  createdAt: string;
  proposalId: string;
  type: "improvement" | "bugfix" | "feature" | "optimization";
  summary: string;
  changes: ChangeEntry[];
  status: "proposed" | "approved" | "implemented" | "reverted";
  codeFile: string;
  metrics?: {
    before?: Record<string, number>;
    after?: Record<string, number>;
  };
}

export interface ChangeEntry {
  file: string;
  action: "add" | "modify" | "delete";
  description: string;
  linesAdded?: number;
  linesRemoved?: number;
}

interface VersionStore {
  currentVersion: string;
  versions: Version[];
  totalChanges: number;
  lastUpdate: string | null;
}

class VersionManager {
  private store: VersionStore;

  constructor() {
    this.store = this.load();
    this.ensureChangelogExists();
  }

  private load(): VersionStore {
    if (existsSync(VERSIONS_FILE)) {
      try {
        const data = readFileSync(VERSIONS_FILE, "utf-8");
        return JSON.parse(data);
      } catch (error) {
        log.warn("Could not load versions, starting fresh");
      }
    }

    return {
      currentVersion: "1.0.0",
      versions: [],
      totalChanges: 0,
      lastUpdate: null,
    };
  }

  private save(): void {
    writeFileSync(VERSIONS_FILE, JSON.stringify(this.store, null, 2));
  }

  private ensureChangelogExists(): void {
    if (!existsSync(CHANGELOG_FILE)) {
      const header = `# EvolAI Changelog

All notable self-improvements and changes made by EvolAI are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

---

`;
      writeFileSync(CHANGELOG_FILE, header);
    }
  }

  /**
   * Generate next version number
   */
  private getNextVersion(type: Version["type"]): string {
    const [major, minor, patch] = this.store.currentVersion.split(".").map(Number);

    switch (type) {
      case "feature":
        return `${major}.${minor + 1}.0`;
      case "improvement":
      case "optimization":
        return `${major}.${minor}.${patch + 1}`;
      case "bugfix":
        return `${major}.${minor}.${patch + 1}`;
      default:
        return `${major}.${minor}.${patch + 1}`;
    }
  }

  /**
   * Create a new version from a proposal
   */
  createVersion(proposal: ImprovementProposal): Version {
    const type = this.determineType(proposal);
    const version = this.getNextVersion(type);

    const changes: ChangeEntry[] = [
      {
        file: proposal.solution.filename,
        action: "add",
        description: proposal.solution.description,
        linesAdded: proposal.solution.code.split("\n").length,
      },
    ];

    const newVersion: Version = {
      id: `v${version}-${Date.now()}`,
      version,
      createdAt: new Date().toISOString(),
      proposalId: proposal.id,
      type,
      summary: proposal.solution.description,
      changes,
      status: "proposed",
      codeFile: this.saveVersionCode(version, proposal),
    };

    this.store.versions.push(newVersion);
    this.store.totalChanges++;
    this.store.lastUpdate = new Date().toISOString();
    this.save();

    // Update changelog
    this.addToChangelog(newVersion);

    log.info({ version, type }, "New version created");
    return newVersion;
  }

  /**
   * Save the code for a specific version
   */
  private saveVersionCode(version: string, proposal: ImprovementProposal): string {
    const codeDir = join(VERSION_DIR, "code", `v${version}`);
    if (!existsSync(codeDir)) {
      mkdirSync(codeDir, { recursive: true });
    }

    const filename = proposal.solution.filename;
    const filepath = join(codeDir, filename);

    const content = `/**
 * EvolAI Self-Generated Code
 * ==========================
 * Version: ${version}
 * Generated: ${new Date().toISOString()}
 * Proposal ID: ${proposal.id}
 * 
 * Issue Addressed:
 * ----------------
 * Area: ${proposal.issue.area}
 * Severity: ${proposal.issue.severity}
 * ${proposal.issue.description}
 * 
 * Solution Description:
 * ---------------------
 * ${proposal.solution.description}
 * 
 * Approach:
 * ---------
 * ${proposal.solution.approach}
 * 
 * Expected Impact:
 * ----------------
 * ${proposal.solution.estimatedImpact}
 * 
 * Status: PENDING REVIEW
 * To implement: Copy this file to the appropriate src/ directory
 * To reject: Update status in versions.json
 */

${proposal.solution.code}
`;

    writeFileSync(filepath, content);
    
    // Also create a metadata file
    const metaPath = join(codeDir, "meta.json");
    writeFileSync(metaPath, JSON.stringify({
      version,
      proposal: proposal.id,
      issue: proposal.issue,
      solution: {
        description: proposal.solution.description,
        approach: proposal.solution.approach,
        impact: proposal.solution.estimatedImpact,
        filename: proposal.solution.filename,
        language: proposal.solution.language,
      },
      createdAt: new Date().toISOString(),
    }, null, 2));

    return filepath;
  }

  /**
   * Add entry to changelog
   */
  private addToChangelog(version: Version): void {
    const date = new Date(version.createdAt).toISOString().split("T")[0];
    
    const typeEmoji = {
      feature: "✨",
      improvement: "🔧",
      optimization: "⚡",
      bugfix: "🐛",
    };

    const entry = `
## [${version.version}] - ${date}

${typeEmoji[version.type]} **${version.type.toUpperCase()}**: ${version.summary}

### Changes
${version.changes.map(c => `- \`${c.file}\`: ${c.description} (+${c.linesAdded || 0} lines)`).join("\n")}

### Details
- **Proposal ID**: \`${version.proposalId}\`
- **Status**: ${version.status}
- **Code**: \`${version.codeFile}\`

---
`;

    // Append to changelog
    const currentChangelog = readFileSync(CHANGELOG_FILE, "utf-8");
    const lines = currentChangelog.split("\n");
    
    // Find where to insert (after the header, before first version)
    let insertIndex = lines.findIndex(line => line.startsWith("## ["));
    if (insertIndex === -1) {
      insertIndex = lines.length;
    }

    lines.splice(insertIndex, 0, entry);
    writeFileSync(CHANGELOG_FILE, lines.join("\n"));

    log.info({ version: version.version }, "Changelog updated");
  }

  /**
   * Determine the type of change from a proposal
   */
  private determineType(proposal: ImprovementProposal): Version["type"] {
    const area = proposal.issue.area.toLowerCase();
    const desc = proposal.issue.description.toLowerCase();

    if (area.includes("efficiency") || desc.includes("faster") || desc.includes("performance")) {
      return "optimization";
    }
    if (area.includes("bug") || desc.includes("fix") || desc.includes("error")) {
      return "bugfix";
    }
    if (proposal.issue.severity === "high") {
      return "feature";
    }
    return "improvement";
  }

  /**
   * Update version status
   */
  updateStatus(versionId: string, status: Version["status"], metrics?: Version["metrics"]): boolean {
    const version = this.store.versions.find(v => v.id === versionId);
    if (!version) return false;

    version.status = status;
    if (metrics) {
      version.metrics = metrics;
    }

    this.save();
    this.updateChangelogStatus(version);

    log.info({ versionId, status }, "Version status updated");
    return true;
  }

  /**
   * Update status in changelog
   */
  private updateChangelogStatus(version: Version): void {
    const changelog = readFileSync(CHANGELOG_FILE, "utf-8");
    const updated = changelog.replace(
      new RegExp(`(## \\[${version.version}\\][\\s\\S]*?- \\*\\*Status\\*\\*: )\\w+`),
      `$1${version.status}`
    );
    writeFileSync(CHANGELOG_FILE, updated);
  }

  /**
   * Get all versions
   */
  getAll(): Version[] {
    return this.store.versions;
  }

  /**
   * Get recent versions
   */
  getRecent(limit = 10): Version[] {
    return this.store.versions.slice(-limit).reverse();
  }

  /**
   * Get versions by status
   */
  getByStatus(status: Version["status"]): Version[] {
    return this.store.versions.filter(v => v.status === status);
  }

  /**
   * Get current version number
   */
  getCurrentVersion(): string {
    return this.store.currentVersion;
  }

  /**
   * Get changelog content
   */
  getChangelog(): string {
    if (existsSync(CHANGELOG_FILE)) {
      return readFileSync(CHANGELOG_FILE, "utf-8");
    }
    return "No changelog yet.";
  }

  /**
   * Get summary for display
   */
  getSummary(): string {
    const proposed = this.getByStatus("proposed").length;
    const implemented = this.getByStatus("implemented").length;
    const reverted = this.getByStatus("reverted").length;

    let summary = `## 📋 Version Control\n\n`;
    summary += `**Current Version**: ${this.store.currentVersion}\n`;
    summary += `**Total Changes**: ${this.store.totalChanges}\n`;
    summary += `**Last Update**: ${this.store.lastUpdate ? new Date(this.store.lastUpdate).toLocaleDateString() : "never"}\n\n`;
    summary += `**Status:**\n`;
    summary += `- 📝 Proposed: ${proposed}\n`;
    summary += `- ✅ Implemented: ${implemented}\n`;
    summary += `- ↩️ Reverted: ${reverted}\n`;

    return summary;
  }

  /**
   * Format version for display
   */
  formatVersion(version: Version): string {
    const typeEmoji = {
      feature: "✨",
      improvement: "🔧",
      optimization: "⚡",
      bugfix: "🐛",
    };

    const statusEmoji = {
      proposed: "📝",
      approved: "👍",
      implemented: "✅",
      reverted: "↩️",
    };

    return `
**${typeEmoji[version.type]} Version ${version.version}**
ID: \`${version.id}\`
Status: ${statusEmoji[version.status]} ${version.status}
Created: ${new Date(version.createdAt).toLocaleString()}

**Summary:**
${version.summary}

**Changes:**
${version.changes.map(c => `• \`${c.file}\`: ${c.description}`).join("\n")}

**Code Location:**
\`${version.codeFile}\`
`;
  }

  /**
   * Get diff between two versions (simplified)
   */
  getDiff(versionA: string, versionB: string): string {
    const a = this.store.versions.find(v => v.version === versionA);
    const b = this.store.versions.find(v => v.version === versionB);

    if (!a || !b) {
      return "Version not found";
    }

    let diff = `## Diff: ${versionA} → ${versionB}\n\n`;
    
    // List changes in B that weren't in A
    const newChanges = b.changes.filter(
      bc => !a.changes.some(ac => ac.file === bc.file)
    );

    if (newChanges.length > 0) {
      diff += `**New files:**\n`;
      for (const c of newChanges) {
        diff += `+ ${c.file}: ${c.description}\n`;
      }
    }

    diff += `\n**Version ${versionB} details:**\n`;
    diff += `Type: ${b.type}\n`;
    diff += `Summary: ${b.summary}\n`;

    return diff;
  }
}

export const versionManager = new VersionManager();
