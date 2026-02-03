import { execSync, spawn } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { CONFIG } from "../config/index.js";
import { notify } from "../notifications/index.js";
import logger from "../infrastructure/logger.js";

const log = logger.child({ module: "self-update" });

// Project paths
const PROJECT_ROOT = join(dirname(CONFIG.paths.memory), "..");
const PACKAGE_JSON = join(PROJECT_ROOT, "package.json");
const UPDATE_LOCK = join(dirname(CONFIG.paths.memory), "update.lock");

export interface UpdateResult {
  updated: boolean;
  previousVersion: string;
  newVersion: string;
  changes: string[];
  restarted: boolean;
  error?: string;
}

class SelfUpdater {
  /**
   * Check if there are updates available on the remote
   */
  async checkForUpdates(): Promise<{
    hasUpdates: boolean;
    behind: number;
    commits: string[];
  }> {
    try {
      log.info("Checking for updates on remote...");

      // Fetch latest
      execSync("git fetch origin", { cwd: PROJECT_ROOT, stdio: "pipe" });

      // Check if behind
      const status = execSync("git rev-list HEAD..origin/main --count", {
        cwd: PROJECT_ROOT,
        encoding: "utf-8",
      }).trim();

      const behind = parseInt(status, 10);

      if (behind === 0) {
        return { hasUpdates: false, behind: 0, commits: [] };
      }

      // Get commit messages
      const commits = execSync("git log HEAD..origin/main --oneline", {
        cwd: PROJECT_ROOT,
        encoding: "utf-8",
      })
        .trim()
        .split("\n")
        .filter(Boolean);

      log.info({ behind, commits }, "Updates available!");

      return { hasUpdates: true, behind, commits };
    } catch (error) {
      log.error({ error: String(error) }, "Failed to check for updates");
      return { hasUpdates: false, behind: 0, commits: [] };
    }
  }

  /**
   * Pull updates from remote and rebuild
   */
  async pullAndRebuild(): Promise<UpdateResult> {
    const result: UpdateResult = {
      updated: false,
      previousVersion: this.getCurrentVersion(),
      newVersion: "",
      changes: [],
      restarted: false,
    };

    // Prevent concurrent updates
    if (existsSync(UPDATE_LOCK)) {
      result.error = "Update already in progress";
      return result;
    }

    try {
      // Create lock
      writeFileSync(UPDATE_LOCK, new Date().toISOString());
      log.info("Starting self-update...");

      // 1. Stash any local changes
      try {
        execSync("git stash", { cwd: PROJECT_ROOT, stdio: "pipe" });
        log.info("Stashed local changes");
      } catch {
        // No changes to stash
      }

      // 2. Pull updates
      const pullOutput = execSync("git pull origin main", {
        cwd: PROJECT_ROOT,
        encoding: "utf-8",
      });

      log.info({ output: pullOutput.slice(0, 200) }, "Pulled updates");

      // 3. Get changed files
      const changedFiles = execSync("git diff HEAD~1 --name-only", {
        cwd: PROJECT_ROOT,
        encoding: "utf-8",
      })
        .trim()
        .split("\n")
        .filter(Boolean);

      result.changes = changedFiles;

      // 4. Check if rebuild needed (if src/ files changed)
      const needsRebuild = changedFiles.some(
        (f) => f.startsWith("src/") || f === "package.json" || f === "tsconfig.json"
      );

      if (needsRebuild) {
        log.info("Rebuilding...");

        // Install deps if package.json changed
        if (changedFiles.includes("package.json")) {
          execSync("npm install", { cwd: PROJECT_ROOT, stdio: "pipe" });
          log.info("Installed dependencies");
        }

        // Rebuild TypeScript
        execSync("npm run build", { cwd: PROJECT_ROOT, stdio: "pipe" });
        log.info("Build complete");
      }

      result.newVersion = this.getCurrentVersion();
      result.updated = true;

      // Notify about update
      await notify.finding(
        "🔄 I updated myself!",
        `Updated from ${result.previousVersion} to ${result.newVersion}\n\n` +
          `Changed files:\n${result.changes.slice(0, 10).map((f) => `• ${f}`).join("\n")}`
      );

      log.info(result, "Self-update successful!");

      return result;
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      log.error({ error: result.error }, "Self-update failed");
      return result;
    } finally {
      // Remove lock
      if (existsSync(UPDATE_LOCK)) {
        execSync(`rm "${UPDATE_LOCK}"`);
      }
    }
  }

  /**
   * Restart the daemon after updates
   */
  async restart(): Promise<boolean> {
    try {
      log.info("🔄 Scheduling restart...");

      await notify.finding(
        "🔄 Restarting...",
        "I'm restarting to apply updates. Be right back!"
      );

      // Use PM2 to restart gracefully
      // This needs to be done in a detached process so we don't kill ourselves
      spawn("pm2", ["restart", "evolai", "--update-env"], {
        detached: true,
        stdio: "ignore",
        cwd: PROJECT_ROOT,
      }).unref();

      return true;
    } catch (error) {
      log.error({ error: String(error) }, "Restart failed");
      return false;
    }
  }

  /**
   * Full update cycle: check, pull, rebuild, restart
   */
  async runFullUpdate(): Promise<UpdateResult> {
    // 1. Check for updates
    const check = await this.checkForUpdates();

    if (!check.hasUpdates) {
      log.info("No updates available");
      return {
        updated: false,
        previousVersion: this.getCurrentVersion(),
        newVersion: this.getCurrentVersion(),
        changes: [],
        restarted: false,
      };
    }

    // 2. Pull and rebuild
    const result = await this.pullAndRebuild();

    if (!result.updated) {
      return result;
    }

    // 3. Restart if src/ changed
    const needsRestart = result.changes.some((f) => f.startsWith("src/"));

    if (needsRestart) {
      result.restarted = await this.restart();
    }

    return result;
  }

  /**
   * Get current version from package.json
   */
  private getCurrentVersion(): string {
    try {
      const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf-8"));
      return pkg.version || "0.0.0";
    } catch {
      return "unknown";
    }
  }

  /**
   * Get update status summary
   */
  async getStatus(): Promise<string> {
    const check = await this.checkForUpdates();
    const version = this.getCurrentVersion();

    let status = `## 🔄 Update Status\n\n`;
    status += `**Current Version:** ${version}\n`;
    status += `**Updates Available:** ${check.hasUpdates ? "Yes" : "No"}\n`;

    if (check.hasUpdates) {
      status += `**Behind by:** ${check.behind} commits\n\n`;
      status += `**Pending Updates:**\n`;
      for (const commit of check.commits.slice(0, 5)) {
        status += `• ${commit}\n`;
      }
    }

    return status;
  }
}

export const selfUpdater = new SelfUpdater();
