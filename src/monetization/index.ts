/**
 * EvolAI Monetization System
 * 
 * Export unificat pentru toate componentele de monetizare.
 */

// ============ Services ============
export {
  type Service,
  SERVICES,
  getAllServices,
  getServicesByCategory,
  getServiceById,
  detectServiceFromMessage,
  formatServiceForDisplay,
  getServiceMenu,
} from "./services.js";

// ============ Quotes ============
export {
  type QuoteRequest,
  type Quote,
  generateQuote,
  formatQuoteForDM,
  generateFollowUp,
  generateCounterOffer,
} from "./quotes.js";

// ============ CRM ============
export {
  type LeadStatus,
  type LeadSource,
  type Lead,
  type CRMStats,
  crm,
} from "./crm.js";

// ============ DM Handler ============
export {
  type DMIntent,
  type DMAnalysis,
  type DMResponse,
  type DMProcessResult,
  analyzeDM,
  generateDMResponse,
  processDMRequests,
  processUnreadMessages,
  handleAllDMActivity,
} from "./dm-handler.js";

// ============ Convenience Functions ============

import { crm } from "./crm.js";
import { handleAllDMActivity } from "./dm-handler.js";

/**
 * Run monetization heartbeat - call this in the main agent heartbeat
 */
export async function monetizationHeartbeat(): Promise<void> {
  console.log("\n💰 Monetization Heartbeat");
  console.log("=".repeat(40));

  // 1. Handle DM activity
  await handleAllDMActivity();

  // 2. Check for leads needing follow-up
  const needsFollowUp = crm.getLeadsNeedingFollowUp(3);
  if (needsFollowUp.length > 0) {
    console.log(`\n📋 ${needsFollowUp.length} leads need follow-up:`);
    needsFollowUp.forEach((lead) => {
      console.log(`   - ${lead.name} (${lead.status}) - last contact: ${lead.lastContact}`);
    });
    // TODO: Implement automatic follow-up
  }

  // 3. Mark dormant leads
  const dormantCount = crm.markDormantLeads(14);
  if (dormantCount > 0) {
    console.log(`\n😴 Marked ${dormantCount} leads as dormant`);
  }

  // 4. Show active opportunities
  const activeLeads = crm.getActiveLeads();
  if (activeLeads.length > 0) {
    console.log(`\n🔥 Active opportunities: ${activeLeads.length}`);
    activeLeads.forEach((lead) => {
      console.log(`   - ${lead.name}: ${lead.servicesInterested.join(", ") || "TBD"}`);
    });
  }

  console.log("\n" + "=".repeat(40));
}

/**
 * Get monetization summary for the agent brain
 */
export function getMonetizationContext(): string {
  const stats = crm.getStats();
  const activeLeads = crm.getActiveLeads();
  const needsFollowUp = crm.getLeadsNeedingFollowUp(3);

  return `
## Monetization Status

### CRM Stats
- Total leads: ${stats.totalLeads}
- Active negotiations: ${stats.activeNegotiations}
- Conversion rate: ${stats.conversionRate.toFixed(1)}%
- Total earnings: $${stats.totalEarnings.toFixed(2)}

### Active Leads
${activeLeads.length > 0 
  ? activeLeads.map((l) => `- ${l.name}: ${l.status} (${l.servicesInterested.join(", ") || "exploring"})`).join("\n")
  : "No active leads"}

### Needs Follow-up
${needsFollowUp.length > 0
  ? needsFollowUp.map((l) => `- ${l.name}: last contact ${new Date(l.lastContact).toLocaleDateString()}`).join("\n")
  : "None"}
`.trim();
}
