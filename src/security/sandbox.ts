import { resolve, normalize, relative } from "path";
import { existsSync, statSync } from "fs";
import logger from "../infrastructure/logger.js";

const log = logger.child({ module: "sandbox" });

// EvolAI's sandbox - can ONLY access files within this directory
const SANDBOX_ROOT = resolve(process.cwd());

// Explicitly blocked paths (even within sandbox)
const BLOCKED_PATHS = [
  ".env",
  ".env.local",
  ".env.production",
  "credentials",
  "secrets",
  ".git/config",
  "id_rsa",
  "id_ed25519",
  ".ssh",
  ".aws",
  ".npmrc",
  ".pypirc",
];

// Blocked file extensions
const BLOCKED_EXTENSIONS = [
  ".pem",
  ".key",
  ".p12",
  ".pfx",
  ".keystore",
];

class Sandbox {
  private root: string;
  private violations: Array<{ path: string; timestamp: string; action: string }> = [];

  constructor() {
    this.root = SANDBOX_ROOT;
    log.info({ root: this.root }, "Sandbox initialized");
  }

  /**
   * Check if a path is within the sandbox
   */
  isPathAllowed(targetPath: string): boolean {
    try {
      const resolved = resolve(targetPath);
      const normalized = normalize(resolved);
      const rel = relative(this.root, normalized);

      // Path is outside sandbox if it starts with .. or is absolute
      if (rel.startsWith("..") || resolve(rel) === normalized) {
        this.logViolation(targetPath, "outside_sandbox");
        return false;
      }

      // Check blocked paths
      const lowerPath = normalized.toLowerCase();
      for (const blocked of BLOCKED_PATHS) {
        if (lowerPath.includes(blocked.toLowerCase())) {
          this.logViolation(targetPath, "blocked_path");
          return false;
        }
      }

      // Check blocked extensions
      for (const ext of BLOCKED_EXTENSIONS) {
        if (lowerPath.endsWith(ext)) {
          this.logViolation(targetPath, "blocked_extension");
          return false;
        }
      }

      return true;
    } catch (error) {
      this.logViolation(targetPath, "invalid_path");
      return false;
    }
  }

  /**
   * Validate and resolve a path within sandbox
   * Returns null if path is not allowed
   */
  resolvePath(targetPath: string): string | null {
    if (!this.isPathAllowed(targetPath)) {
      return null;
    }
    return resolve(this.root, targetPath);
  }

  /**
   * Check if a path exists AND is allowed
   */
  pathExists(targetPath: string): boolean {
    const resolved = this.resolvePath(targetPath);
    if (!resolved) return false;
    return existsSync(resolved);
  }

  /**
   * Get sandbox root
   */
  getRoot(): string {
    return this.root;
  }

  /**
   * Log a security violation
   */
  private logViolation(path: string, action: string): void {
    const violation = {
      path,
      timestamp: new Date().toISOString(),
      action,
    };
    this.violations.push(violation);
    log.warn({ violation }, "🚨 Sandbox violation attempted!");
  }

  /**
   * Get all violations
   */
  getViolations(): typeof this.violations {
    return this.violations;
  }

  /**
   * Get stats
   */
  getStats(): { root: string; violations: number } {
    return {
      root: this.root,
      violations: this.violations.length,
    };
  }
}

export const sandbox = new Sandbox();
