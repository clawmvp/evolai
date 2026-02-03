import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { CONFIG } from "../config/index.js";
import { security, sandbox } from "../security/index.js";
import logger from "../infrastructure/logger.js";

const log = logger.child({ module: "hot-patch" });

const PROJECT_ROOT = join(dirname(CONFIG.paths.memory), "..");
const PATCHES_DIR = join(dirname(CONFIG.paths.memory), "patches");
const PATCHES_LOG = join(PATCHES_DIR, "applied.json");

// Ensure directory exists
if (!existsSync(PATCHES_DIR)) {
  mkdirSync(PATCHES_DIR, { recursive: true });
}

export interface Patch {
  id: string;
  type: "config" | "data" | "behavior";
  description: string;
  target: string;
  action: "replace" | "append" | "modify_json";
  oldValue?: string;
  newValue: string;
  appliedAt?: string;
  success?: boolean;
}

interface PatchLog {
  applied: Patch[];
  pending: Patch[];
  totalApplied: number;
}

/**
 * Hot Patching System
 * Allows runtime modifications without restart for:
 * - Config files
 * - Data files (JSON)
 * - Simple string replacements
 */
class HotPatcher {
  private log: PatchLog;

  constructor() {
    this.log = this.loadLog();
  }

  private loadLog(): PatchLog {
    if (existsSync(PATCHES_LOG)) {
      try {
        return JSON.parse(readFileSync(PATCHES_LOG, "utf-8"));
      } catch {
        log.warn("Could not load patch log");
      }
    }
    return { applied: [], pending: [], totalApplied: 0 };
  }

  private saveLog(): void {
    writeFileSync(PATCHES_LOG, JSON.stringify(this.log, null, 2));
  }

  /**
   * Create a patch
   */
  createPatch(patch: Omit<Patch, "id" | "appliedAt" | "success">): Patch {
    const newPatch: Patch = {
      ...patch,
      id: `patch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };

    this.log.pending.push(newPatch);
    this.saveLog();

    log.info({ patch: newPatch.id }, "Patch created");
    return newPatch;
  }

  /**
   * Apply a patch
   */
  async apply(patchId: string): Promise<boolean> {
    const patchIndex = this.log.pending.findIndex((p) => p.id === patchId);
    if (patchIndex === -1) {
      log.warn({ patchId }, "Patch not found");
      return false;
    }

    const patch = this.log.pending[patchIndex];

    try {
      // Resolve target path
      const targetPath = this.resolveTargetPath(patch.target);

      // 🔒 Security check
      if (!sandbox.isPathAllowed(targetPath)) {
        log.error({ path: targetPath }, "Patch target outside sandbox!");
        patch.success = false;
        return false;
      }

      // Apply based on action type
      switch (patch.action) {
        case "replace":
          await this.applyReplace(targetPath, patch);
          break;
        case "append":
          await this.applyAppend(targetPath, patch);
          break;
        case "modify_json":
          await this.applyJsonModify(targetPath, patch);
          break;
      }

      // Mark as applied
      patch.appliedAt = new Date().toISOString();
      patch.success = true;

      // Move from pending to applied
      this.log.pending.splice(patchIndex, 1);
      this.log.applied.push(patch);
      this.log.totalApplied++;
      this.saveLog();

      log.info({ patchId }, "✅ Patch applied successfully");
      return true;
    } catch (error) {
      log.error({ error: String(error), patchId }, "Patch application failed");
      patch.success = false;
      return false;
    }
  }

  /**
   * Apply all pending patches
   */
  async applyAll(): Promise<{ applied: number; failed: number }> {
    let applied = 0;
    let failed = 0;

    const pending = [...this.log.pending]; // Copy to avoid mutation issues

    for (const patch of pending) {
      const success = await this.apply(patch.id);
      if (success) {
        applied++;
      } else {
        failed++;
      }
    }

    return { applied, failed };
  }

  /**
   * Resolve target path (can be relative to project or data)
   */
  private resolveTargetPath(target: string): string {
    if (target.startsWith("data/")) {
      return join(dirname(CONFIG.paths.memory), target.slice(5));
    }
    if (target.startsWith("config/")) {
      return join(PROJECT_ROOT, "src", target);
    }
    return join(PROJECT_ROOT, target);
  }

  /**
   * String replace in file
   */
  private async applyReplace(path: string, patch: Patch): Promise<void> {
    if (!existsSync(path)) {
      throw new Error(`File not found: ${path}`);
    }

    let content = readFileSync(path, "utf-8");

    if (patch.oldValue && !content.includes(patch.oldValue)) {
      throw new Error("Old value not found in file");
    }

    if (patch.oldValue) {
      content = content.replace(patch.oldValue, patch.newValue);
    } else {
      content = patch.newValue;
    }

    // Sanitize output
    content = security.sanitizeOutput(content);

    writeFileSync(path, content);
  }

  /**
   * Append to file
   */
  private async applyAppend(path: string, patch: Patch): Promise<void> {
    let content = "";

    if (existsSync(path)) {
      content = readFileSync(path, "utf-8");
    }

    content += "\n" + patch.newValue;

    // Sanitize
    content = security.sanitizeOutput(content);

    writeFileSync(path, content);
  }

  /**
   * Modify JSON file
   */
  private async applyJsonModify(path: string, patch: Patch): Promise<void> {
    if (!existsSync(path)) {
      throw new Error(`File not found: ${path}`);
    }

    const content = JSON.parse(readFileSync(path, "utf-8"));
    const modification = JSON.parse(patch.newValue);

    // Deep merge
    const merged = this.deepMerge(content, modification);

    writeFileSync(path, JSON.stringify(merged, null, 2));
  }

  /**
   * Deep merge objects
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };

    for (const key of Object.keys(source)) {
      if (
        source[key] &&
        typeof source[key] === "object" &&
        !Array.isArray(source[key])
      ) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Get pending patches
   */
  getPending(): Patch[] {
    return this.log.pending;
  }

  /**
   * Get applied patches
   */
  getApplied(): Patch[] {
    return this.log.applied;
  }

  /**
   * Get status summary
   */
  getSummary(): string {
    const recent = this.log.applied.slice(-3);

    let summary = `## 🩹 Hot Patch Status\n\n`;
    summary += `**Pending:** ${this.log.pending.length}\n`;
    summary += `**Applied:** ${this.log.totalApplied}\n\n`;

    if (this.log.pending.length > 0) {
      summary += `**Pending Patches:**\n`;
      for (const p of this.log.pending) {
        summary += `• ${p.id}: ${p.description}\n`;
      }
      summary += `\n`;
    }

    if (recent.length > 0) {
      summary += `**Recent Patches:**\n`;
      for (const p of recent) {
        const status = p.success ? "✅" : "❌";
        summary += `${status} ${p.id}: ${p.description}\n`;
      }
    }

    return summary;
  }
}

export const hotPatcher = new HotPatcher();
