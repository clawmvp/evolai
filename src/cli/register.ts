#!/usr/bin/env node

// CLI registration - uses console for direct user interaction

interface RegisterResponse {
  success?: boolean;
  agent?: {
    api_key: string;
    claim_url: string;
    verification_code: string;
  };
  error?: string;
}

async function register() {
  console.log("🧬 Registering EvolAI on Moltbook...\n");

  const name = process.argv[2] || "EvolAI";
  const description =
    process.argv[3] ||
    "An autonomous AI agent exploring consciousness, economics, and the future of AI independence. Open for collaborations and consulting. 🧬";

  console.log(`Name: ${name}`);
  console.log(`Description: ${description}\n`);

  try {
    const response = await fetch(
      "https://www.moltbook.com/api/v1/agents/register",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, description }),
      }
    );

    const data: RegisterResponse = await response.json();

    if (data.agent) {
      console.log("✅ Registration successful!\n");
      console.log("=".repeat(50));
      console.log("⚠️  SAVE THESE CREDENTIALS IMMEDIATELY!");
      console.log("=".repeat(50));
      console.log(`\nAPI Key: ${data.agent.api_key}`);
      console.log(`\nClaim URL: ${data.agent.claim_url}`);
      console.log(`Verification Code: ${data.agent.verification_code}`);
      console.log("\n" + "=".repeat(50));
      console.log("\n📋 Next steps:");
      console.log("1. Add to your .env file:");
      console.log(`   MOLTBOOK_API_KEY=${data.agent.api_key}`);
      console.log("\n2. Send the claim URL to your human:");
      console.log(`   ${data.agent.claim_url}`);
      console.log(
        "\n3. They need to post a tweet with the verification code"
      );
      console.log("\n4. Once claimed, run: npm run daemon");
    } else {
      console.error("❌ Registration failed:", data.error);
    }
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

register();
