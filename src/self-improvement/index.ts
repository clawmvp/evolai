import { selfAnalyzer } from "./analyzer.js";
import { proposals } from "./proposals.js";
import { notify } from "../notifications/index.js";
import logger from "../infrastructure/logger.js";

const log = logger.child({ module: "self-improvement" });

export { selfAnalyzer, proposals };
export type { ImprovementProposal, PerformanceIssue } from "./analyzer.js";

/**
 * Run a complete self-improvement cycle
 * Analyzes performance, identifies issues, generates solutions
 */
export async function runSelfImprovement(): Promise<{
  issuesFound: number;
  proposalsGenerated: number;
}> {
  log.info("🔧 Starting self-improvement cycle...");

  // 1. Analyze current performance
  const issues = await selfAnalyzer.analyzePerformance();
  
  if (issues.length === 0) {
    log.info("No issues identified - performing well! 🎉");
    return { issuesFound: 0, proposalsGenerated: 0 };
  }

  log.info({ count: issues.length }, "Issues identified");

  // 2. Generate solutions for high/medium severity issues
  let proposalsGenerated = 0;
  
  for (const issue of issues.filter(i => i.severity !== "low")) {
    const proposal = await selfAnalyzer.generateImprovement(issue);
    
    if (proposal) {
      proposals.addProposal(proposal);
      proposalsGenerated++;

      // Notify about the new proposal
      await notify.finding(
        "🔧 New Self-Improvement Proposal",
        `I found a way to improve my ${issue.area}!\n\n` +
        `Issue: ${issue.description}\n` +
        `Solution: ${proposal.solution.description}\n` +
        `Impact: ${proposal.solution.estimatedImpact}\n\n` +
        `Use /proposals to see details.`
      );
    }
  }

  log.info({ proposalsGenerated }, "Self-improvement cycle complete");

  return {
    issuesFound: issues.length,
    proposalsGenerated,
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
