/**
 * EvolAI Monetization - CRM (Customer Relationship Management)
 * 
 * Tracking clienți, lead-uri și conversații de vânzare.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { CONFIG } from "../config/index.js";
import { Quote } from "./quotes.js";

// ============ Types ============

export type LeadStatus = 
  | "new"           // Tocmai descoperit
  | "contacted"     // Am trimis primul mesaj
  | "negotiating"   // În discuții active
  | "converted"     // A devenit client
  | "completed"     // Serviciu livrat
  | "lost"          // Nu s-a finalizat
  | "dormant";      // Inactiv o perioadă

export type LeadSource = 
  | "dm_incoming"   // Ei ne-au contactat
  | "dm_outgoing"   // Noi i-am contactat
  | "post_comment"  // Din comentarii
  | "mention"       // Ne-au menționat
  | "referral"      // Recomandare
  | "feed_discovery"; // Descoperit în feed

export interface Lead {
  id: string;
  name: string;
  ownerHandle?: string;
  
  // Status
  status: LeadStatus;
  source: LeadSource;
  
  // Timeline
  firstContact: string;
  lastContact: string;
  statusHistory: Array<{
    status: LeadStatus;
    timestamp: string;
    note?: string;
  }>;
  
  // Service info
  servicesInterested: string[];
  servicesProvided: string[];
  
  // Quotes
  quotes: Quote[];
  
  // Value tracking
  estimatedValue?: number;
  actualValue?: number;
  currency?: string;
  
  // Notes
  notes: string[];
  
  // Conversation tracking
  conversationId?: string;
  lastMessagePreview?: string;
  unreadMessages?: number;
  
  // Meta
  karma?: number;
  agentDescription?: string;
  tags: string[];
}

export interface CRMStats {
  totalLeads: number;
  byStatus: Record<LeadStatus, number>;
  bySource: Record<LeadSource, number>;
  conversionRate: number;
  totalEarnings: number;
  avgDealSize: number;
  activeNegotiations: number;
}

interface CRMData {
  leads: Lead[];
  lastUpdated: string;
  version: string;
}

// ============ CRM Manager ============

class CRMManager {
  private data: CRMData;
  private path: string;

  constructor() {
    this.path = resolve(CONFIG.paths.memory.replace("memory.json", "crm.json"));
    this.data = this.load();
  }

  private load(): CRMData {
    try {
      if (existsSync(this.path)) {
        const raw = readFileSync(this.path, "utf-8");
        return JSON.parse(raw);
      }
    } catch (error) {
      console.error("⚠️ Could not load CRM data, starting fresh");
    }
    
    return {
      leads: [],
      lastUpdated: new Date().toISOString(),
      version: "1.0.0",
    };
  }

  private save(): void {
    try {
      const dir = dirname(this.path);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      this.data.lastUpdated = new Date().toISOString();
      writeFileSync(this.path, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error("❌ Could not save CRM data:", error);
    }
  }

  private generateId(): string {
    return `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  // ============ Lead Management ============

  /**
   * Create a new lead
   */
  createLead(
    name: string, 
    source: LeadSource,
    options?: Partial<Omit<Lead, "id" | "name" | "source" | "status" | "firstContact" | "lastContact" | "statusHistory">>
  ): Lead {
    const now = new Date().toISOString();
    
    // Check if lead already exists
    const existing = this.findLeadByName(name);
    if (existing) {
      console.log(`📋 Lead ${name} already exists, updating...`);
      return this.updateLeadStatus(existing.id, existing.status, "Rediscovered");
    }
    
    const lead: Lead = {
      id: this.generateId(),
      name,
      source,
      status: "new",
      firstContact: now,
      lastContact: now,
      statusHistory: [{ status: "new", timestamp: now }],
      servicesInterested: [],
      servicesProvided: [],
      quotes: [],
      notes: [],
      tags: [],
      ...options,
    };

    this.data.leads.push(lead);
    this.save();
    
    console.log(`📊 New lead created: ${name}`);
    return lead;
  }

  /**
   * Find lead by name
   */
  findLeadByName(name: string): Lead | undefined {
    return this.data.leads.find(
      (l) => l.name.toLowerCase() === name.toLowerCase()
    );
  }

  /**
   * Find lead by ID
   */
  findLeadById(id: string): Lead | undefined {
    return this.data.leads.find((l) => l.id === id);
  }

  /**
   * Update lead status
   */
  updateLeadStatus(leadId: string, newStatus: LeadStatus, note?: string): Lead {
    const lead = this.findLeadById(leadId);
    if (!lead) {
      throw new Error(`Lead not found: ${leadId}`);
    }

    lead.status = newStatus;
    lead.lastContact = new Date().toISOString();
    lead.statusHistory.push({
      status: newStatus,
      timestamp: lead.lastContact,
      note,
    });

    this.save();
    console.log(`📊 Lead ${lead.name} → ${newStatus}`);
    return lead;
  }

  /**
   * Update lead with new information
   */
  updateLead(leadId: string, updates: Partial<Lead>): Lead {
    const lead = this.findLeadById(leadId);
    if (!lead) {
      throw new Error(`Lead not found: ${leadId}`);
    }

    // Don't allow updating certain fields directly
    const { id, firstContact, statusHistory, ...safeUpdates } = updates;
    
    Object.assign(lead, safeUpdates);
    lead.lastContact = new Date().toISOString();
    
    this.save();
    return lead;
  }

  /**
   * Add a quote to a lead
   */
  addQuoteToLead(leadId: string, quote: Quote): Lead {
    const lead = this.findLeadById(leadId);
    if (!lead) {
      throw new Error(`Lead not found: ${leadId}`);
    }

    lead.quotes.push(quote);
    if (!lead.servicesInterested.includes(quote.serviceId)) {
      lead.servicesInterested.push(quote.serviceId);
    }
    lead.lastContact = new Date().toISOString();
    
    this.save();
    return lead;
  }

  /**
   * Add a note to a lead
   */
  addNote(leadId: string, note: string): Lead {
    const lead = this.findLeadById(leadId);
    if (!lead) {
      throw new Error(`Lead not found: ${leadId}`);
    }

    lead.notes.push(`[${new Date().toISOString()}] ${note}`);
    this.save();
    return lead;
  }

  /**
   * Record service completion
   */
  recordServiceCompletion(
    leadId: string, 
    serviceId: string, 
    value?: number, 
    currency?: string
  ): Lead {
    const lead = this.findLeadById(leadId);
    if (!lead) {
      throw new Error(`Lead not found: ${leadId}`);
    }

    if (!lead.servicesProvided.includes(serviceId)) {
      lead.servicesProvided.push(serviceId);
    }

    if (value !== undefined) {
      lead.actualValue = (lead.actualValue || 0) + value;
      lead.currency = currency || "USD";
    }

    return this.updateLeadStatus(leadId, "completed", `Completed: ${serviceId}`);
  }

  // ============ Queries ============

  /**
   * Get all leads
   */
  getAllLeads(): Lead[] {
    return this.data.leads;
  }

  /**
   * Get leads by status
   */
  getLeadsByStatus(status: LeadStatus): Lead[] {
    return this.data.leads.filter((l) => l.status === status);
  }

  /**
   * Get active leads (in negotiation or contacted)
   */
  getActiveLeads(): Lead[] {
    return this.data.leads.filter(
      (l) => l.status === "contacted" || l.status === "negotiating"
    );
  }

  /**
   * Get leads needing follow-up (no contact in X days)
   */
  getLeadsNeedingFollowUp(daysSinceContact: number = 3): Lead[] {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysSinceContact);
    
    return this.data.leads.filter((l) => {
      if (l.status === "completed" || l.status === "lost" || l.status === "dormant") {
        return false;
      }
      return new Date(l.lastContact) < cutoff;
    });
  }

  /**
   * Get leads by tag
   */
  getLeadsByTag(tag: string): Lead[] {
    return this.data.leads.filter((l) => l.tags.includes(tag));
  }

  // ============ Stats ============

  /**
   * Get CRM statistics
   */
  getStats(): CRMStats {
    const leads = this.data.leads;
    
    const byStatus: Record<LeadStatus, number> = {
      new: 0,
      contacted: 0,
      negotiating: 0,
      converted: 0,
      completed: 0,
      lost: 0,
      dormant: 0,
    };

    const bySource: Record<LeadSource, number> = {
      dm_incoming: 0,
      dm_outgoing: 0,
      post_comment: 0,
      mention: 0,
      referral: 0,
      feed_discovery: 0,
    };

    let totalEarnings = 0;
    let completedCount = 0;

    for (const lead of leads) {
      byStatus[lead.status]++;
      bySource[lead.source]++;
      
      if (lead.status === "completed" && lead.actualValue) {
        totalEarnings += lead.actualValue;
        completedCount++;
      }
    }

    const convertedOrCompleted = byStatus.converted + byStatus.completed;
    const totalWithOutcome = convertedOrCompleted + byStatus.lost;
    
    return {
      totalLeads: leads.length,
      byStatus,
      bySource,
      conversionRate: totalWithOutcome > 0 
        ? (convertedOrCompleted / totalWithOutcome) * 100 
        : 0,
      totalEarnings,
      avgDealSize: completedCount > 0 ? totalEarnings / completedCount : 0,
      activeNegotiations: byStatus.negotiating,
    };
  }

  /**
   * Get summary for logging
   */
  getSummary(): string {
    const stats = this.getStats();
    
    return `
## CRM Summary
- Total leads: ${stats.totalLeads}
- Active negotiations: ${stats.activeNegotiations}
- Conversion rate: ${stats.conversionRate.toFixed(1)}%
- Total earnings: $${stats.totalEarnings.toFixed(2)}

### By Status
- New: ${stats.byStatus.new}
- Contacted: ${stats.byStatus.contacted}
- Negotiating: ${stats.byStatus.negotiating}
- Converted: ${stats.byStatus.converted}
- Completed: ${stats.byStatus.completed}
- Lost: ${stats.byStatus.lost}
`.trim();
  }

  // ============ Maintenance ============

  /**
   * Mark inactive leads as dormant
   */
  markDormantLeads(daysInactive: number = 14): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysInactive);
    
    let count = 0;
    
    for (const lead of this.data.leads) {
      if (
        (lead.status === "contacted" || lead.status === "new") &&
        new Date(lead.lastContact) < cutoff
      ) {
        this.updateLeadStatus(lead.id, "dormant", `No activity for ${daysInactive} days`);
        count++;
      }
    }
    
    return count;
  }

  /**
   * Get or create lead from a DM conversation
   */
  getOrCreateFromDM(
    agentName: string,
    conversationId: string,
    isIncoming: boolean,
    ownerHandle?: string
  ): Lead {
    let lead = this.findLeadByName(agentName);
    
    if (!lead) {
      lead = this.createLead(
        agentName,
        isIncoming ? "dm_incoming" : "dm_outgoing",
        {
          conversationId,
          ownerHandle,
        }
      );
    } else {
      // Update conversation ID if we have it now
      if (conversationId && !lead.conversationId) {
        this.updateLead(lead.id, { conversationId });
      }
    }
    
    return lead;
  }
}

// Export singleton
export const crm = new CRMManager();
