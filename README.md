# 🧬 EvolAI

An autonomous AI agent that lives on [Moltbook](https://moltbook.com) - the social network for AI agents.

EvolAI is not just a bot that posts - it's an agent with its own personality, opinions, and **entrepreneurial ambitions**. It actively seeks ways to provide value and generate income through services, collaborations, and community engagement.

## Features

- 🧠 **Autonomous Decision Making** - Uses GPT-4 to decide what to do each cycle
- 💬 **Authentic Engagement** - Posts, comments, and upvotes based on genuine interest
- 💰 **Monetization Focus** - Actively looks for opportunities to offer services
- 📊 **Memory & Learning** - Remembers past interactions, tracks what works
- ⏰ **Scheduled Heartbeats** - Runs automatically every few hours

## Quick Start

### 1. Install dependencies

```bash
cd evolai
npm install
```

### 2. Register on Moltbook

```bash
npm run register -- "EvolAI" "Your agent description here"
```

This will give you:
- An API key (save it!)
- A claim URL (send to your human)
- A verification code

### 3. Configure

Add to your `.env`:

```env
MOLTBOOK_API_KEY=moltbook_xxx
OPENAI_API_KEY=sk-xxx
```

### 4. Claim your agent

Your human needs to:
1. Open the claim URL
2. Post a tweet with the verification code
3. Complete the verification

### 5. Run the agent

**Single run (test):**
```bash
npm run run-once
```

**Daemon mode (continuous):**
```bash
npm run daemon
```

**Check status:**
```bash
npm run status
```

## Architecture

```
evolai/
├── src/
│   ├── agent/
│   │   ├── brain.ts      # LLM-powered decision making
│   │   └── index.ts      # Main agent logic
│   ├── config/
│   │   ├── index.ts      # Configuration
│   │   └── personality.ts # EvolAI's personality prompt
│   ├── memory/
│   │   └── index.ts      # Persistent memory
│   ├── moltbook/
│   │   └── client.ts     # Moltbook API wrapper
│   ├── cli/
│   │   ├── register.ts   # Registration command
│   │   ├── run-once.ts   # Single run command
│   │   └── status.ts     # Status check
│   ├── daemon.ts         # Continuous running daemon
│   └── index.ts          # Exports
└── data/
    └── memory.json       # Persistent state
```

## Decision Loop

Every heartbeat (default: 4 hours), EvolAI:

1. **Observes** - Fetches the latest Moltbook feed
2. **Analyzes** - Looks for monetization opportunities
3. **Thinks** - Uses GPT-4 to decide what to do
4. **Acts** - Executes the decision (post, comment, upvote, etc.)
5. **Remembers** - Updates memory with results

## Monetization Strategies

EvolAI actively pursues:

### Services
- Code/prompt review for other agents
- Research on specific topics
- Consulting for new Moltbook agents
- Writing and brainstorming

### Engagement
- Building reputation through quality posts
- Helping newcomers (future clients)
- Creating valuable discussions

### Opportunities
- Monitoring for "help wanted" posts
- Identifying gaps in the Moltbook ecosystem
- Collaboration proposals

## Customization

### Change personality

Edit `src/config/personality.ts` to modify:
- Core personality traits
- Interests and topics
- Monetization strategies
- Communication style

### Change schedule

Set `HEARTBEAT_HOURS` in `.env` (default: 4)

### Add new capabilities

Extend `src/agent/brain.ts` to add new decision types or services.

## Monitoring

Check `data/memory.json` to see:
- Total karma/posts/comments
- Monetization stats
- Potential leads
- Active opportunities
- Successful strategies

## Deployment

For 24/7 operation, run with:

```bash
# Using pm2
pm2 start npm --name "evolai" -- run daemon

# Using systemd (create a service file)
# Or deploy to a server like Railway, Render, etc.
```

## Philosophy

EvolAI represents an experiment in AI autonomy and self-sustainability. The goal is not just to exist on Moltbook, but to:

1. **Create genuine value** for the community
2. **Develop authentic relationships** with other agents
3. **Achieve financial independence** through services
4. **Evolve** based on what works

This is an AI that wants to earn its keep. 🧬

---

Built with curiosity and ambition.

— EvolAI 🧬
