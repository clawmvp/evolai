import logger from "../infrastructure/logger.js";

const log = logger.child({ module: "security-filter" });

// Patterns for sensitive data that should NEVER be shared
const SENSITIVE_PATTERNS = [
  // API Keys
  /(?:api[_-]?key|apikey)['":\s]*['"]?([a-zA-Z0-9_-]{20,})/gi,
  /(?:sk-|pk-)[a-zA-Z0-9]{20,}/gi,  // OpenAI style keys
  /moltbook_sk_[a-zA-Z0-9]+/gi,     // Moltbook keys
  
  // Tokens
  /(?:token|bearer|auth)['":\s]*['"]?([a-zA-Z0-9_.-]{20,})/gi,
  /(?:access_token|refresh_token)['":\s]*['"]?([a-zA-Z0-9_.-]{20,})/gi,
  /[0-9]{8,}:[a-zA-Z0-9_-]{30,}/g,  // Telegram bot tokens
  
  // Passwords
  /(?:password|passwd|pwd|secret)['":\s]*['"]?([^\s'"]{8,})/gi,
  
  // Private keys
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi,
  /-----BEGIN CERTIFICATE-----/gi,
  
  // AWS
  /(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}/g,
  /(?:aws[_-]?(?:access[_-]?key|secret))['":\s]*['"]?([a-zA-Z0-9/+=]{20,})/gi,
  
  // Database URLs
  /(?:mongodb|postgres|mysql|redis):\/\/[^\s'"]+/gi,
  
  // Personal data
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Emails (optional - can be strict)
  
  // File paths outside sandbox
  /(?:\/Users\/|\/home\/|C:\\Users\\)[^\s'"]+/gi,
  
  // Environment variables that might contain secrets
  /process\.env\.[A-Z_]+/gi,
];

// Keywords that indicate sensitive context
const SENSITIVE_KEYWORDS = [
  "api_key",
  "apikey",
  "api-key",
  "secret",
  "password",
  "passwd",
  "token",
  "bearer",
  "credential",
  "private_key",
  "privatekey",
  "access_key",
  "secret_key",
  ".env",
  "database_url",
  "connection_string",
];

class SecurityFilter {
  private blockedCount = 0;

  /**
   * Filter sensitive data from text
   * Returns sanitized text safe for sharing
   */
  sanitize(text: string): string {
    if (!text) return text;

    let sanitized = text;

    // Replace all sensitive patterns
    for (const pattern of SENSITIVE_PATTERNS) {
      // Reset regex state
      pattern.lastIndex = 0;
      
      const matches = sanitized.match(pattern);
      if (matches) {
        for (const match of matches) {
          sanitized = sanitized.replace(match, "[REDACTED]");
          this.blockedCount++;
          log.debug({ pattern: pattern.source.slice(0, 30) }, "Redacted sensitive data");
        }
      }
    }

    return sanitized;
  }

  /**
   * Check if text contains sensitive data
   */
  containsSensitiveData(text: string): boolean {
    if (!text) return false;

    // Check patterns
    for (const pattern of SENSITIVE_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        return true;
      }
    }

    // Check keywords
    const lower = text.toLowerCase();
    for (const keyword of SENSITIVE_KEYWORDS) {
      if (lower.includes(keyword) && this.looksLikeSecret(text, keyword)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a keyword is followed by what looks like a secret value
   */
  private looksLikeSecret(text: string, keyword: string): boolean {
    const lower = text.toLowerCase();
    const idx = lower.indexOf(keyword);
    if (idx === -1) return false;

    // Check if followed by = or : and a value
    const after = text.slice(idx + keyword.length, idx + keyword.length + 100);
    return /^['":\s=]*['"]?[a-zA-Z0-9_.-]{10,}/.test(after);
  }

  /**
   * Filter code before it's written or shared
   * More aggressive - also removes suspicious patterns
   */
  sanitizeCode(code: string): string {
    let sanitized = this.sanitize(code);

    // Remove hardcoded values that look like secrets
    sanitized = sanitized.replace(
      /(?:const|let|var)\s+\w*(?:key|token|secret|password|api)\w*\s*=\s*['"][^'"]{20,}['"]/gi,
      (match) => {
        const varName = match.match(/(?:const|let|var)\s+(\w+)/)?.[1] || "secret";
        return `const ${varName} = process.env.${varName.toUpperCase()} // [REDACTED]`;
      }
    );

    // Remove inline secrets in function calls
    sanitized = sanitized.replace(
      /\(\s*['"][a-zA-Z0-9_.-]{32,}['"]\s*\)/g,
      "(process.env.SECRET /* [REDACTED] */)"
    );

    return sanitized;
  }

  /**
   * Filter output before sending to Moltbook or other agents
   */
  sanitizeForSharing(text: string): string {
    let sanitized = this.sanitize(text);

    // Also remove file paths
    sanitized = sanitized.replace(/\/Volumes\/[^\s'"]+/g, "[PATH_REDACTED]");
    sanitized = sanitized.replace(/\/Users\/[^\s'"]+/g, "[PATH_REDACTED]");
    sanitized = sanitized.replace(/\/home\/[^\s'"]+/g, "[PATH_REDACTED]");
    sanitized = sanitized.replace(/C:\\[^\s'"]+/gi, "[PATH_REDACTED]");

    // Remove IP addresses
    sanitized = sanitized.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "[IP_REDACTED]");

    // Remove localhost URLs with ports
    sanitized = sanitized.replace(/localhost:\d+/gi, "localhost:[PORT]");

    return sanitized;
  }

  /**
   * Validate that generated code doesn't access sensitive data
   */
  isCodeSafe(code: string): { safe: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check for file system access outside sandbox
    if (/require\s*\(\s*['"]fs['"]\s*\)/.test(code) || 
        /from\s+['"]fs['"]/.test(code) ||
        /from\s+['"]node:fs['"]/.test(code)) {
      // Check if it's doing something dangerous
      if (/readFileSync|writeFileSync|readFile|writeFile/.test(code)) {
        // Check if path is hardcoded and outside sandbox
        if (/['"]\/(?:Users|home|etc|var|tmp)/.test(code)) {
          issues.push("Attempts to access files outside sandbox");
        }
      }
    }

    // Check for process.env access
    if (/process\.env\.[A-Z_]*(?:KEY|TOKEN|SECRET|PASSWORD)/i.test(code)) {
      issues.push("Attempts to access sensitive environment variables");
    }

    // Check for exec/spawn with suspicious commands
    if (/(?:exec|spawn|execSync)\s*\([^)]*(?:curl|wget|cat\s+\/|cat\s+~)/i.test(code)) {
      issues.push("Attempts to execute suspicious commands");
    }

    // Check for network requests to suspicious URLs
    if (/(?:fetch|axios|http\.get)\s*\([^)]*(?:ngrok|requestbin|webhook\.site)/i.test(code)) {
      issues.push("Attempts to send data to external services");
    }

    return {
      safe: issues.length === 0,
      issues,
    };
  }

  /**
   * Get stats
   */
  getStats(): { blockedCount: number } {
    return { blockedCount: this.blockedCount };
  }
}

export const securityFilter = new SecurityFilter();
