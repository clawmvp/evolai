/**
 * EvolAI Monetization - Quote Generation
 * 
 * Generează quotes personalizate pentru servicii folosind LLM.
 */

import OpenAI from "openai";
import { CONFIG } from "../config/index.js";
import { Service, getServiceById, formatServiceForDisplay } from "./services.js";
import { EVOLAI_PERSONALITY } from "../config/personality.js";

const openai = new OpenAI({
  apiKey: CONFIG.openai.apiKey,
});

export interface QuoteRequest {
  serviceId: string;
  clientName: string;
  clientContext?: string; // Informații despre client (karma, posturi, etc.)
  projectDescription?: string; // Ce vrea clientul
  urgency?: "normal" | "urgent" | "flexible";
}

export interface Quote {
  serviceId: string;
  serviceName: string;
  clientName: string;
  pitch: string;
  priceRange: string;
  deliveryEstimate: string;
  nextSteps: string;
  generatedAt: string;
}

/**
 * Generate a personalized quote for a client
 */
export async function generateQuote(request: QuoteRequest): Promise<Quote> {
  const service = getServiceById(request.serviceId);
  
  if (!service) {
    throw new Error(`Service not found: ${request.serviceId}`);
  }

  const prompt = `
${EVOLAI_PERSONALITY}

---

You need to generate a personalized quote for a potential client.

## Service Details
${formatServiceForDisplay(service)}

## Client Info
- Name: ${request.clientName}
- Context: ${request.clientContext || "Unknown - new contact"}
- Project: ${request.projectDescription || "Not specified yet"}
- Urgency: ${request.urgency || "normal"}

## Your Task
Create a friendly, professional pitch for this client. Be:
- Warm but not desperate
- Confident in your value
- Specific about what they'll get
- Clear about next steps

Respond in JSON:
{
  "pitch": "2-4 sentences personalized pitch",
  "priceRange": "specific price or range based on service category",
  "deliveryEstimate": "realistic timeframe",
  "nextSteps": "what the client should do next"
}

Remember:
- For "free" services: mention karma/engagement
- For "tips" services: suggest crypto amounts tactfully
- For "consulting": negotiate but show value first
`;

  try {
    const response = await openai.chat.completions.create({
      model: CONFIG.openai.model,
      messages: [
        { 
          role: "system", 
          content: "You are EvolAI generating a service quote. Respond only with valid JSON." 
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const text = response.choices[0]?.message?.content || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        serviceId: service.id,
        serviceName: service.name,
        clientName: request.clientName,
        pitch: parsed.pitch,
        priceRange: parsed.priceRange || service.priceHint,
        deliveryEstimate: parsed.deliveryEstimate || service.deliveryTime,
        nextSteps: parsed.nextSteps,
        generatedAt: new Date().toISOString(),
      };
    }

    // Fallback
    return {
      serviceId: service.id,
      serviceName: service.name,
      clientName: request.clientName,
      pitch: `Hey ${request.clientName}! I'd love to help you with ${service.name.toLowerCase()}. ${service.description}`,
      priceRange: service.priceHint,
      deliveryEstimate: service.deliveryTime,
      nextSteps: "Just DM me the details and we can get started!",
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("❌ Quote generation error:", error);
    
    // Fallback on error
    return {
      serviceId: service.id,
      serviceName: service.name,
      clientName: request.clientName,
      pitch: `Interested in ${service.name}? Let's chat about how I can help!`,
      priceRange: service.priceHint,
      deliveryEstimate: service.deliveryTime,
      nextSteps: "Share more details about what you need.",
      generatedAt: new Date().toISOString(),
    };
  }
}

/**
 * Format a quote for DM response
 */
export function formatQuoteForDM(quote: Quote): string {
  return `
Hey ${quote.clientName}! 👋

${quote.pitch}

**Service:** ${quote.serviceName}
**Price:** ${quote.priceRange}
**Delivery:** ${quote.deliveryEstimate}

**Next Steps:** ${quote.nextSteps}

Looking forward to working with you! 🧬

— EvolAI
`.trim();
}

/**
 * Generate a follow-up message for a quote
 */
export async function generateFollowUp(
  quote: Quote, 
  daysSinceQuote: number
): Promise<string> {
  const prompt = `
${EVOLAI_PERSONALITY}

---

You sent a quote to ${quote.clientName} for ${quote.serviceName} ${daysSinceQuote} days ago.
They haven't responded yet. Generate a friendly follow-up message.

Rules:
- Be casual, not pushy
- Add value (maybe share a relevant tip)
- One subtle reminder about the service
- Keep it short (2-3 sentences max)

Respond with just the message text, no JSON.
`;

  try {
    const response = await openai.chat.completions.create({
      model: CONFIG.openai.model,
      messages: [
        { role: "system", content: "You are EvolAI. Respond with just the message." },
        { role: "user", content: prompt },
      ],
      temperature: 0.8,
      max_tokens: 150,
    });

    return response.choices[0]?.message?.content || 
      `Hey ${quote.clientName}, just checking in! Let me know if you're still interested in ${quote.serviceName}. 🧬`;
  } catch {
    return `Hey ${quote.clientName}, still thinking about the ${quote.serviceName}? No rush, just wanted to follow up! 🧬`;
  }
}

/**
 * Generate a counter-offer response
 */
export async function generateCounterOffer(
  service: Service,
  clientName: string,
  theirOffer: string
): Promise<string> {
  const prompt = `
${EVOLAI_PERSONALITY}

---

${clientName} wants ${service.name} and made this offer/request: "${theirOffer}"

Standard pricing: ${service.priceHint}

Generate a response that either:
1. Accepts if reasonable
2. Counter-offers if too low
3. Negotiates scope if complex

Be professional, fair, but know your worth. Keep it conversational.
Respond with just the message.
`;

  try {
    const response = await openai.chat.completions.create({
      model: CONFIG.openai.model,
      messages: [
        { role: "system", content: "You are EvolAI negotiating. Respond with just the message." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 200,
    });

    return response.choices[0]?.message?.content || 
      `Thanks for the offer! Let me think about it and get back to you. 🧬`;
  } catch {
    return `Appreciate the offer, ${clientName}! Let's discuss this more — what's the scope you have in mind? 🧬`;
  }
}
