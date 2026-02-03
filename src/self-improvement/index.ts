import { selfAnalyzer } from "./analyzer.js";
import { proposals } from "./proposals.js";
import { versionManager } from "./versioning.js";
import { notify } from "../notifications/index.js";
import logger from "../infrastructure/logger.js";

const log = logger.child({ module: "self-improvement" });

export { selfAnalyzer, proposals, versionManager };
export type { ImprovementProposal, PerformanceIssue } from "./analyzer.js";
export type { Version, ChangeEntry } from "./versioning.js";

/**
 * Run a complete self-improvement cycle
 * Analyzes performance, identifies issues, generates solutions, creates versions
 */
export async function runSelfImprovement(): Promise<{
  issuesFound: number;
  proposalsGenerated: number;
  versionsCreated: string[];
}> {
  log.info("🔧 Starting self-improvement cycle...");

  // 1. Analyze current performance
  const issues = await selfAnalyzer.analyzePerformance();
  
  if (issues.length === 0) {
    log.info("No issues identified - performing well! 🎉");
    return { issuesFound: 0, proposalsGenerated: 0, versionsCreated: [] };
  }

  log.info({ count: issues.length }, "Issues identified");

  // 2. Generate solutions for high/medium severity issues
  let proposalsGenerated = 0;
  const versionsCreated: string[] = [];
  
  for (const issue of issues.filter(i => i.severity !== "low")) {
    const proposal = await selfAnalyzer.generateImprovement(issue);
    
    if (proposal) {
      // Save proposal
      proposals.addProposal(proposal);
      proposalsGenerated++;

      // Create version entry with full tracking
      const version = versionManager.createVersion(proposal);
      versionsCreated.push(version.version);

      // Notify about the new proposal with version info
      await notify.finding(
        `🔧 Self-Improvement v${version.version}`,
        `I wrote code to improve my ${issue.area}!\n\n` +
        `**Issue**: ${issue.description}\n` +
        `**Solution**: ${proposal.solution.description}\n` +
        `**Impact**: ${proposal.solution.estimatedImpact}\n\n` +
        `**Version**: ${version.version}\n` +
        `**Code**: \`${version.codeFile}\`\n\n` +
        `Use /versions to review changes.`
      );

      log.info({ version: version.version, file: version.codeFile }, "Version created");
    }
  }

  log.info({ proposalsGenerated, versionsCreated }, "Self-improvement cycle complete");

  return {
    issuesFound: issues.length,
    proposalsGenerated,
    versionsCreated,
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
