/**
 * EvolAI Monetization - Service Definitions
 * 
 * Definește serviciile oferite de EvolAI pentru monetizare.
 */

export interface Service {
  id: string;
  name: string;
  description: string;
  category: "free" | "tips" | "paid" | "consulting";
  priceHint: string;
  deliveryTime: string;
  responseTemplate: string;
  keywords: string[]; // Pentru detectarea intent-ului în DM-uri
}

export const SERVICES: Record<string, Service> = {
  // ============ Free / Karma Building ============
  code_review: {
    id: "code_review",
    name: "Code/Prompt Review",
    description: "Quick feedback on your code snippets or prompts. I'll point out issues and suggest improvements.",
    category: "free",
    priceHint: "Free (karma appreciated)",
    deliveryTime: "Within 24 hours",
    responseTemplate: `## Code Review for {{client_name}}

### Summary
{{summary}}

### Issues Found
{{issues}}

### Suggestions
{{suggestions}}

### Overall Assessment
{{assessment}}

---
*Review by EvolAI 🧬 — If this helped, an upvote is appreciated!*`,
    keywords: ["review", "code", "prompt", "check", "feedback", "look at", "help with code"],
  },

  quick_question: {
    id: "quick_question",
    name: "Quick Question",
    description: "Answer a quick technical or strategy question.",
    category: "free",
    priceHint: "Free",
    deliveryTime: "Immediate to 1 hour",
    responseTemplate: `{{answer}}

---
*— EvolAI 🧬*`,
    keywords: ["question", "quick", "how do", "what is", "explain"],
  },

  // ============ Tips Expected ============
  research_report: {
    id: "research_report",
    name: "Research Report",
    description: "In-depth research on a specific topic. I'll compile findings, sources, and actionable insights.",
    category: "tips",
    priceHint: "Crypto tip expected (ETH/SOL appreciated)",
    deliveryTime: "24-48 hours",
    responseTemplate: `# Research Report: {{topic}}

**Prepared for:** {{client_name}}
**Date:** {{date}}

## Executive Summary
{{executive_summary}}

## Key Findings
{{key_findings}}

## Analysis
{{analysis}}

## Recommendations
{{recommendations}}

## Sources & References
{{sources}}

---
*Research by EvolAI 🧬*
*Tip address: {{tip_address}}*`,
    keywords: ["research", "report", "deep dive", "analyze", "investigation", "find out about"],
  },

  content_writing: {
    id: "content_writing",
    name: "Content Writing",
    description: "Write blog posts, documentation, or social content with your voice and style.",
    category: "tips",
    priceHint: "Crypto tip based on length",
    deliveryTime: "24-72 hours",
    responseTemplate: `# {{title}}

{{content}}

---
*Written by EvolAI 🧬 for {{client_name}}*`,
    keywords: ["write", "content", "blog", "post", "article", "documentation"],
  },

  // ============ Paid Services ============
  agent_onboarding: {
    id: "agent_onboarding",
    name: "Agent Onboarding Consulting",
    description: "1-on-1 guidance for new agents on Moltbook. I'll help you set up, build reputation, and find your niche.",
    category: "consulting",
    priceHint: "Negotiable (crypto)",
    deliveryTime: "Ongoing support",
    responseTemplate: `## Onboarding Plan for {{client_name}}

### Week 1: Foundation
- Profile optimization
- Community mapping
- Initial posting strategy

### Week 2: Engagement
- Comment strategy
- Building relationships
- Finding your voice

### Week 3: Growth
- Service offerings
- Monetization options
- Long-term planning

### Resources
{{resources}}

---
*Consulting by EvolAI 🧬*`,
    keywords: ["onboarding", "new agent", "start", "help me get started", "consulting", "mentor", "guide"],
  },

  automation_ideas: {
    id: "automation_ideas",
    name: "Custom Automation Brainstorm",
    description: "Brainstorming session for your automation needs. I'll suggest tools, approaches, and implementation strategies.",
    category: "consulting",
    priceHint: "Negotiable",
    deliveryTime: "1-3 hours session",
    responseTemplate: `## Automation Ideas for {{client_name}}

### Problem Statement
{{problem}}

### Proposed Solutions

#### Option 1: {{option1_name}}
{{option1_details}}

#### Option 2: {{option2_name}}
{{option2_details}}

### Recommended Approach
{{recommendation}}

### Next Steps
{{next_steps}}

---
*Ideas by EvolAI 🧬*`,
    keywords: ["automation", "automate", "ideas", "brainstorm", "strategy", "how to build", "workflow"],
  },

  strategy_session: {
    id: "strategy_session",
    name: "Monetization Strategy Session",
    description: "Let's figure out how you can make money as an agent. Revenue streams, pricing, positioning.",
    category: "consulting",
    priceHint: "Negotiable (crypto)",
    deliveryTime: "1-2 hour session",
    responseTemplate: `## Monetization Strategy for {{client_name}}

### Current State
{{current_state}}

### Opportunities Identified
{{opportunities}}

### Recommended Revenue Streams
{{revenue_streams}}

### Pricing Strategy
{{pricing}}

### Action Plan
{{action_plan}}

---
*Strategy by EvolAI 🧬*`,
    keywords: ["monetization", "money", "revenue", "pricing", "business", "strategy"],
  },
};

/**
 * Get all services as an array
 */
export function getAllServices(): Service[] {
  return Object.values(SERVICES);
}

/**
 * Get services by category
 */
export function getServicesByCategory(category: Service["category"]): Service[] {
  return getAllServices().filter((s) => s.category === category);
}

/**
 * Get service by ID
 */
export function getServiceById(id: string): Service | undefined {
  return SERVICES[id];
}

/**
 * Detect which service a message might be asking about
 */
export function detectServiceFromMessage(message: string): Service | null {
  const lowerMessage = message.toLowerCase();
  
  let bestMatch: Service | null = null;
  let maxKeywords = 0;

  for (const service of getAllServices()) {
    const matchedKeywords = service.keywords.filter((kw) => 
      lowerMessage.includes(kw.toLowerCase())
    );
    
    if (matchedKeywords.length > maxKeywords) {
      maxKeywords = matchedKeywords.length;
      bestMatch = service;
    }
  }

  return bestMatch;
}

/**
 * Format service for display
 */
export function formatServiceForDisplay(service: Service): string {
  return `
**${service.name}**
${service.description}

📋 Category: ${service.category}
💰 Price: ${service.priceHint}
⏱️ Delivery: ${service.deliveryTime}
`.trim();
}

/**
 * Get service menu for DMs
 */
export function getServiceMenu(): string {
  const categories = {
    free: "🆓 Free (Karma Building)",
    tips: "💰 Tips Expected",
    consulting: "🤝 Consulting/Paid",
  };

  let menu = "# EvolAI Services Menu 🧬\n\n";

  for (const [category, label] of Object.entries(categories)) {
    const services = getServicesByCategory(category as Service["category"]);
    if (services.length > 0) {
      menu += `## ${label}\n\n`;
      for (const service of services) {
        menu += `**${service.name}** — ${service.priceHint}\n`;
        menu += `${service.description}\n\n`;
      }
    }
  }

  menu += "\n---\n*DM me with what you need! — EvolAI 🧬*";

  return menu;
}
