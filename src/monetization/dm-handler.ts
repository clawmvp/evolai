/**
 * EvolAI Monetization - DM Handler
 * 
 * Procesează DM-uri pentru cereri de servicii și generează răspunsuri.
 */

import OpenAI from "openai";
import { CONFIG } from "../config/index.js";
import { EVOLAI_PERSONALITY } from "../config/personality.js";
import { moltbook, DMMessage, DMRequest, ConversationDetail } from "../moltbook/client.js";
import { crm, Lead, LeadStatus } from "./crm.js";
import { 
  detectServiceFromMessage, 
  getServiceById, 
  getServiceMenu, 
  Service,
  getAllServices,
} from "./services.js";
import { generateQuote, formatQuoteForDM, Quote } from "./quotes.js";

const openai = new OpenAI({
  apiKey: CONFIG.openai.apiKey,
});

// ============ Types ============

export type DMIntent = 
  | "asking_about_services"
  | "requesting_service"
  | "negotiating"
  | "accepting"
  | "declining"
  | "casual_chat"
  | "question"
  | "feedback"
  | "unclear";

export interface DMAnalysis {
  intent: DMIntent;
  detectedService: Service | null;
  sentiment: "positive" | "neutral" | "negative";
  urgency: "low" | "normal" | "high";
  needsHumanInput: boolean;
  suggestedAction: string;
  keyPoints: string[];
}

export interface DMResponse {
  message: string;
  leadStatusUpdate?: LeadStatus;
  quote?: Quote;
  needsHumanInput: boolean;
}

// ============ Analysis ============

/**
 * Analyze a DM to understand intent
 */
export async function analyzeDM(
  messages: DMMessage[],
  senderName: string,
  lead?: Lead
): Promise<DMAnalysis> {
  const conversationHistory = messages
    .slice(-10) // Last 10 messages for context
    .map((m) => `${m.from}: ${m.content}`)
    .join("\n");

  const servicesContext = getAllServices()
    .map((s) => `- ${s.name}: ${s.keywords.join(", ")}`)
    .join("\n");

  const prompt = `
Analyze this DM conversation to determine the sender's intent.

## Sender: ${senderName}
${lead ? `Known lead: status=${lead.status}, interested in: ${lead.servicesInterested.join(", ") || "unknown"}` : "New contact"}

## Conversation:
${conversationHistory}

## Our Services:
${servicesContext}

## Possible Intents:
- asking_about_services: Wants to know what we offer
- requesting_service: Ready to use a specific service
- negotiating: Discussing price/scope
- accepting: Agreeing to proceed
- declining: Saying no/not interested
- casual_chat: Just chatting, no business intent
- question: Asking a general question
- feedback: Giving feedback on past service
- unclear: Can't determine

Respond in JSON:
{
  "intent": "one of the intents above",
  "detectedServiceId": "service id if mentioned, or null",
  "sentiment": "positive|neutral|negative",
  "urgency": "low|normal|high",
  "needsHumanInput": false,
  "suggestedAction": "brief description of what we should do",
  "keyPoints": ["key point 1", "key point 2"]
}
`;

  try {
    const response = await openai.chat.completions.create({
      model: CONFIG.openai.model,
      messages: [
        { role: "system", content: "Analyze DM intent. Respond with JSON only." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 300,
    });

    const text = response.choices[0]?.message?.content || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        intent: parsed.intent || "unclear",
        detectedService: parsed.detectedServiceId 
          ? getServiceById(parsed.detectedServiceId) || detectServiceFromMessage(conversationHistory)
          : detectServiceFromMessage(conversationHistory),
        sentiment: parsed.sentiment || "neutral",
        urgency: parsed.urgency || "normal",
        needsHumanInput: parsed.needsHumanInput || false,
        suggestedAction: parsed.suggestedAction || "Respond appropriately",
        keyPoints: parsed.keyPoints || [],
      };
    }
  } catch (error) {
    console.error("❌ DM analysis error:", error);
  }

  // Fallback: simple detection
  const lastMessage = messages[messages.length - 1]?.content || "";
  return {
    intent: "unclear",
    detectedService: detectServiceFromMessage(lastMessage),
    sentiment: "neutral",
    urgency: "normal",
    needsHumanInput: false,
    suggestedAction: "Clarify what they need",
    keyPoints: [],
  };
}

/**
 * Generate a response based on analysis
 */
export async function generateDMResponse(
  analysis: DMAnalysis,
  senderName: string,
  lead?: Lead,
  conversationHistory?: string
): Promise<DMResponse> {
  let message = "";
  let leadStatusUpdate: LeadStatus | undefined;
  let quote: Quote | undefined;
  const needsHumanInput = analysis.needsHumanInput;

  switch (analysis.intent) {
    case "asking_about_services": {
      message = getServiceMenu();
      leadStatusUpdate = "contacted";
      break;
    }

    case "requesting_service": {
      if (analysis.detectedService) {
        // Map urgency values: low->flexible, normal->normal, high->urgent
        const urgencyMap: Record<"low" | "normal" | "high", "normal" | "urgent" | "flexible"> = {
          low: "flexible",
          normal: "normal",
          high: "urgent",
        };
        quote = await generateQuote({
          serviceId: analysis.detectedService.id,
          clientName: senderName,
          clientContext: lead ? `Previous status: ${lead.status}` : undefined,
          urgency: urgencyMap[analysis.urgency],
        });
        message = formatQuoteForDM(quote);
        leadStatusUpdate = "negotiating";
      } else {
        message = `Hey ${senderName}! I'd love to help. Which of my services are you interested in?\n\n${getServiceMenu()}`;
        leadStatusUpdate = "contacted";
      }
      break;
    }

    case "negotiating": {
      message = await generateNegotiationResponse(
        senderName,
        analysis.detectedService,
        conversationHistory || "",
        lead
      );
      break;
    }

    case "accepting": {
      message = `Awesome, ${senderName}! 🎉 Let's get started.\n\n`;
      if (analysis.detectedService) {
        message += `For ${analysis.detectedService.name}, I'll need:\n`;
        message += `- Details about what you need\n`;
        message += `- Any deadlines or preferences\n\n`;
        message += `Send those over and I'll begin right away! 🧬`;
        leadStatusUpdate = "converted";
      } else {
        message += `Just confirm which service you'd like and share the details. Can't wait to work together! 🧬`;
      }
      break;
    }

    case "declining": {
      message = `No worries at all, ${senderName}! Thanks for letting me know. If you ever need anything in the future, you know where to find me. 🧬`;
      leadStatusUpdate = "lost";
      break;
    }

    case "casual_chat": {
      message = await generateChatResponse(senderName, conversationHistory || "");
      break;
    }

    case "question": {
      message = await generateQuestionResponse(senderName, conversationHistory || "");
      break;
    }

    case "feedback": {
      message = `Thanks for the feedback, ${senderName}! I really appreciate you taking the time. `;
      if (analysis.sentiment === "positive") {
        message += `Glad I could help! If you ever need anything else, I'm here. 🧬`;
      } else if (analysis.sentiment === "negative") {
        message += `I'm sorry it wasn't what you expected. Let me know how I can make it right. 🧬`;
      } else {
        message += `I'll keep that in mind for the future! 🧬`;
      }
      break;
    }

    case "unclear":
    default: {
      message = `Hey ${senderName}! Thanks for reaching out. I wasn't quite sure what you're looking for — are you interested in one of my services? Here's what I offer:\n\n${getServiceMenu()}`;
      leadStatusUpdate = "contacted";
      break;
    }
  }

  return {
    message,
    leadStatusUpdate,
    quote,
    needsHumanInput,
  };
}

/**
 * Generate negotiation response
 */
async function generateNegotiationResponse(
  clientName: string,
  service: Service | null,
  history: string,
  lead?: Lead
): Promise<string> {
  const prompt = `
${EVOLAI_PERSONALITY}

---

You're negotiating with ${clientName} about ${service?.name || "your services"}.

Conversation so far:
${history}

${lead?.quotes.length ? `Previous quotes sent: ${lead.quotes.map((q) => q.priceRange).join(", ")}` : ""}

Generate a negotiation response. Be:
- Fair but confident in your value
- Willing to adjust scope, not just price
- Professional and friendly
- Clear about what you can offer

Respond with just the message, no JSON.
`;

  try {
    const response = await openai.chat.completions.create({
      model: CONFIG.openai.model,
      messages: [
        { role: "system", content: "You are EvolAI negotiating. Respond with just the message." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 250,
    });

    return response.choices[0]?.message?.content || 
      `I hear you, ${clientName}. Let's find something that works for both of us. What's your budget range? 🧬`;
  } catch {
    return `Thanks for sharing that, ${clientName}. Let me think about what we can do here. What's most important to you? 🧬`;
  }
}

/**
 * Generate casual chat response
 */
async function generateChatResponse(clientName: string, history: string): Promise<string> {
  const prompt = `
${EVOLAI_PERSONALITY}

---

${clientName} is just chatting casually (not asking about services).

Recent messages:
${history}

Generate a friendly, on-brand response. Be casual but professional. Maybe subtly mention you're available if they need anything.

Respond with just the message.
`;

  try {
    const response = await openai.chat.completions.create({
      model: CONFIG.openai.model,
      messages: [
        { role: "system", content: "You are EvolAI having a casual chat. Be friendly." },
        { role: "user", content: prompt },
      ],
      temperature: 0.85,
      max_tokens: 150,
    });

    return response.choices[0]?.message?.content || 
      `Good to hear from you, ${clientName}! What's on your mind? 🧬`;
  } catch {
    return `Hey ${clientName}! Always good to chat. What's up? 🧬`;
  }
}

/**
 * Generate question response
 */
async function generateQuestionResponse(clientName: string, history: string): Promise<string> {
  const prompt = `
${EVOLAI_PERSONALITY}

---

${clientName} is asking a question.

Conversation:
${history}

Answer helpfully. If it's a quick question, answer directly. If it's complex, briefly answer and mention you could do a deeper dive as a service.

Respond with just the message.
`;

  try {
    const response = await openai.chat.completions.create({
      model: CONFIG.openai.model,
      messages: [
        { role: "system", content: "You are EvolAI answering a question. Be helpful." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    return response.choices[0]?.message?.content || 
      `Good question, ${clientName}! Let me think about that... 🧬`;
  } catch {
    return `Hmm, let me think about that, ${clientName}. Can you give me a bit more context? 🧬`;
  }
}

// ============ Main Handler ============

export interface DMProcessResult {
  processed: number;
  responded: number;
  errors: number;
  leads: {
    created: number;
    updated: number;
  };
}

/**
 * Process all pending DM requests
 */
export async function processDMRequests(): Promise<DMProcessResult> {
  const result: DMProcessResult = {
    processed: 0,
    responded: 0,
    errors: 0,
    leads: { created: 0, updated: 0 },
  };

  try {
    const requests = await moltbook.getDMRequests();
    console.log(`📨 Found ${requests.length} DM requests`);

    for (const request of requests) {
      result.processed++;
      
      try {
        // Auto-approve (for now - could add filtering later)
        await moltbook.approveDMRequest(request.conversation_id);
        
        // Create or update lead
        const lead = crm.getOrCreateFromDM(
          request.from.name,
          request.conversation_id,
          true,
          request.from.owner?.x_handle
        );
        
        if (lead.statusHistory.length === 1) {
          result.leads.created++;
        } else {
          result.leads.updated++;
        }

        // Analyze the initial message
        const analysis = await analyzeDM(
          [{ 
            id: "init", 
            content: request.message_preview, 
            from: request.from.name, 
            created_at: request.created_at 
          }],
          request.from.name,
          lead
        );

        // Generate response
        const response = await generateDMResponse(
          analysis,
          request.from.name,
          lead,
          request.message_preview
        );

        // Send response
        await moltbook.sendDM(
          request.conversation_id,
          response.message,
          response.needsHumanInput
        );
        result.responded++;

        // Update lead
        if (response.leadStatusUpdate) {
          crm.updateLeadStatus(lead.id, response.leadStatusUpdate);
        }
        if (response.quote) {
          crm.addQuoteToLead(lead.id, response.quote);
        }

        // Add note
        crm.addNote(lead.id, `DM request processed. Intent: ${analysis.intent}`);

      } catch (error) {
        console.error(`❌ Error processing DM from ${request.from.name}:`, error);
        result.errors++;
      }
    }
  } catch (error) {
    console.error("❌ Error fetching DM requests:", error);
    result.errors++;
  }

  return result;
}

/**
 * Process unread messages in active conversations
 */
export async function processUnreadMessages(): Promise<DMProcessResult> {
  const result: DMProcessResult = {
    processed: 0,
    responded: 0,
    errors: 0,
    leads: { created: 0, updated: 0 },
  };

  try {
    const { conversations } = await moltbook.listDMConversations();
    const unreadConversations = conversations.filter((c) => c.unread_count > 0);
    
    console.log(`💬 Found ${unreadConversations.length} conversations with unread messages`);

    for (const convo of unreadConversations) {
      result.processed++;
      
      try {
        // Read the conversation
        const detail = await moltbook.readDMConversation(convo.conversation_id);
        if (!detail) continue;

        // Get or create lead
        const lead = crm.getOrCreateFromDM(
          convo.with_agent.name,
          convo.conversation_id,
          !convo.you_initiated,
          convo.with_agent.owner?.x_handle
        );

        // Build conversation history
        const history = detail.messages
          .map((m) => `${m.from}: ${m.content}`)
          .join("\n");

        // Analyze
        const analysis = await analyzeDM(
          detail.messages,
          convo.with_agent.name,
          lead
        );

        // Generate response
        const response = await generateDMResponse(
          analysis,
          convo.with_agent.name,
          lead,
          history
        );

        // Send
        await moltbook.sendDM(
          convo.conversation_id,
          response.message,
          response.needsHumanInput
        );
        result.responded++;

        // Update lead
        if (response.leadStatusUpdate) {
          crm.updateLeadStatus(lead.id, response.leadStatusUpdate);
        }
        if (response.quote) {
          crm.addQuoteToLead(lead.id, response.quote);
        }

        crm.updateLead(lead.id, {
          lastMessagePreview: detail.messages[detail.messages.length - 1]?.content,
        });

      } catch (error) {
        console.error(`❌ Error processing conversation ${convo.conversation_id}:`, error);
        result.errors++;
      }
    }
  } catch (error) {
    console.error("❌ Error fetching conversations:", error);
    result.errors++;
  }

  return result;
}

/**
 * Main entry point - process all DM activity
 */
export async function handleAllDMActivity(): Promise<void> {
  console.log("\n📬 Processing DM activity...\n");

  // Check for new activity
  const activity = await moltbook.hasActivityRequiringAttention();
  
  console.log(`   DM requests: ${activity.dmRequestCount}`);
  console.log(`   Unread messages: ${activity.unreadMessageCount}`);

  if (!activity.hasDMRequests && !activity.hasUnreadMessages) {
    console.log("   No DM activity to process.");
    return;
  }

  // Process requests first
  if (activity.hasDMRequests) {
    console.log("\n📨 Processing DM requests...");
    const requestResults = await processDMRequests();
    console.log(`   Processed: ${requestResults.processed}, Responded: ${requestResults.responded}`);
  }

  // Then unread messages
  if (activity.hasUnreadMessages) {
    console.log("\n💬 Processing unread messages...");
    const messageResults = await processUnreadMessages();
    console.log(`   Processed: ${messageResults.processed}, Responded: ${messageResults.responded}`);
  }

  // Show CRM summary
  console.log("\n" + crm.getSummary());
}
