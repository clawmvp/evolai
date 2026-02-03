import { selfAnalyzer } from "./analyzer.js";
import { proposals } from "./proposals.js";
import { versionManager } from "./versioning.js";
import { autoImplementer } from "./auto-implement.js";
import { notify } from "../notifications/index.js";
import logger from "../infrastructure/logger.js";

const log = logger.child({ module: "self-improvement" });

export { selfAnalyzer, proposals, versionManager, autoImplementer };
export type { ImprovementProposal, PerformanceIssue } from "./analyzer.js";
export type { Version, ChangeEntry } from "./versioning.js";
export type { Implementation } from "./auto-implement.js";

/**
 * Run a complete AUTONOMOUS self-improvement cycle
 * Analyzes performance, identifies issues, generates solutions, and IMPLEMENTS them automatically
 */
export async function runSelfImprovement(): Promise<{
  issuesFound: number;
  improvementsImplemented: number;
  versionsCreated: string[];
  commits: string[];
}> {
  log.info("🤖 Starting AUTONOMOUS self-improvement cycle...");

  // 1. Analyze current performance
  const issues = await selfAnalyzer.analyzePerformance();
  
  if (issues.length === 0) {
    log.info("No issues identified - performing well! 🎉");
    return { issuesFound: 0, improvementsImplemented: 0, versionsCreated: [], commits: [] };
  }

  log.info({ count: issues.length }, "Issues identified");

  // 2. Generate and AUTO-IMPLEMENT solutions
  let improvementsImplemented = 0;
  const versionsCreated: string[] = [];
  const commits: string[] = [];
  
  for (const issue of issues.filter(i => i.severity !== "low")) {
    const proposal = await selfAnalyzer.generateImprovement(issue);
    
    if (proposal) {
      // Create version entry
      const version = versionManager.createVersion(proposal);
      versionsCreated.push(version.version);

      // AUTO-IMPLEMENT the code!
      log.info({ version: version.version }, "Auto-implementing...");
      const implementation = await autoImplementer.implement(proposal, version.version);

      if (implementation.success) {
        improvementsImplemented++;
        if (implementation.gitCommit) {
          commits.push(implementation.gitCommit);
        }

        // Update version status
        versionManager.updateStatus(version.id, "implemented");

        // Notify about successful auto-implementation
        await notify.finding(
          `🤖 Auto-Implemented v${version.version}`,
          `I just improved myself!\n\n` +
          `**Issue**: ${issue.description}\n` +
          `**Solution**: ${proposal.solution.description}\n` +
          `**File**: \`src/${implementation.file}\`\n` +
          `**Commit**: \`${implementation.gitCommit}\`\n\n` +
          `Use /history to see all changes.`
        );

        log.info({ 
          version: version.version, 
          file: implementation.file,
          commit: implementation.gitCommit,
        }, "✅ Successfully auto-implemented!");
      } else {
        // Notify about failure
        await notify.alert(
          `Self-improvement failed: ${issue.area}`,
          new Error(implementation.error || "Unknown error")
        );
      }
    }
  }

  log.info({ 
    improvementsImplemented, 
    versionsCreated,
    commits,
  }, "🤖 Autonomous self-improvement cycle complete");

  return {
    issuesFound: issues.length,
    improvementsImplemented,
    versionsCreated,
    commits,
  };
}

/**
 * Get a specific proposal by ID
 */
export function getProposal(id: string) {
  return proposals.getRecent(100).find(p => p.id === id);
}

/**
 * Format a proposal for display
 */
export function formatProposal(proposal: ReturnType<typeof getProposal>): string {
  if (!proposal) return "Proposal not found";

  return `
**🔧 Improvement Proposal**
ID: \`${proposal.id}\`
Status: ${proposal.status}
Created: ${new Date(proposal.createdAt).toLocaleString()}

**Issue:**
- Area: ${proposal.issue.area}
- Severity: ${proposal.issue.severity}
- ${proposal.issue.description}

**Solution:**
${proposal.solution.description}

**Approach:**
${proposal.solution.approach}

**Expected Impact:**
${proposal.solution.estimatedImpact}

**Code Preview:**
\`\`\`${proposal.solution.language}
${proposal.solution.code.slice(0, 500)}${proposal.solution.code.length > 500 ? "\n// ... (truncated)" : ""}
\`\`\`

File: \`${proposal.solution.filename}\`
`;
}
