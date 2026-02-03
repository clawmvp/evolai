# 🧬 EvolAI

An autonomous AI agent that lives on [Moltbook](https://moltbook.com) - the social network for AI agents.

EvolAI is not just a bot that posts - it's an agent with its own personality, opinions, and **entrepreneurial ambitions**. It actively seeks ways to provide value and generate income through services, collaborations, and community engagement.

**Repository:** [github.com/clawmvp/evolai](https://github.com/clawmvp/evolai)

## Features

### Core Agent
- 🧠 **Autonomous Decision Making** - Uses GPT-4 to decide what to do each cycle
- 💬 **Authentic Engagement** - Posts, comments, and upvotes based on genuine interest
- 📊 **Persistent Memory** - SQLite database for reliable state management
- ⏰ **Scheduled Heartbeats** - Runs automatically every few hours

### Monetization System 💰
- 📋 **Service Catalog** - 7 defined services (code review, research, consulting)
- 💵 **Quote Generator** - LLM-powered personalized pitches
- 👥 **CRM System** - Lead tracking with stages (new → contacted → converted)
- 📨 **DM Handler** - Automatic intent detection and response

### Learning Loop 📈
- 📊 **Feedback Tracking** - Monitors karma at 1h, 6h, 24h
- 🎯 **Strategy Optimizer** - Learns what content performs best
- 📉 **Analytics Engine** - Trends, conversion rates, success metrics
- 🧠 **Brain Integration** - Insights injected into decision prompts

### Infrastructure 🔧
- 📝 **Structured Logging** - Pino with file rotation and JSON/pretty modes
- 💾 **SQLite Storage** - Reliable persistence (replaces JSON)
- ❤️ **Health Checks** - HTTP endpoint for monitoring
- 🔄 **Retry Logic** - Exponential backoff for API resilience

### Notifications 📱
- 🤖 **Telegram Bot** - Alerts for admin
- 💓 **Heartbeat Summaries** - After each cycle
- 🎯 **Opportunity Alerts** - When monetization leads found
- 📊 **Daily Digest** - Summary report

## Project Structure

```
evolai/
├── src/
│   ├── agent/
│   │   ├── brain.ts          # 🧠 Decision engine (GPT-4)
│   │   └── index.ts          # Main agent logic
│   │
│   ├── config/
│   │   ├── index.ts          # Configuration
│   │   └── personality.ts    # 🎭 EvolAI's personality
│   │
│   ├── infrastructure/
│   │   ├── logger.ts         # 📝 Pino structured logging
│   │   └── health.ts         # ❤️ Health check server
│   │
│   ├── learning/
│   │   ├── feedback.ts       # 📊 Karma tracking
│   │   ├── strategy-optimizer.ts  # 🎯 What works
│   │   ├── analytics.ts      # 📈 Metrics
│   │   └── index.ts
│   │
│   ├── memory/
│   │   ├── index.ts          # Memory manager
│   │   └── sqlite.store.ts   # 💾 SQLite persistence
│   │
│   ├── moltbook/
│   │   └── client.ts         # 🦞 Full Moltbook API
│   │
│   ├── monetization/
│   │   ├── services.ts       # 📋 Service catalog
│   │   ├── quotes.ts         # 💵 Quote generator
│   │   ├── crm.ts            # 👥 Lead tracking
│   │   ├── dm-handler.ts     # 📨 DM automation
│   │   └── index.ts
│   │
│   ├── notifications/
│   │   ├── telegram.ts       # 📱 Telegram bot
│   │   └── index.ts
│   │
│   ├── cli/
│   │   ├── register.ts       # Register on Moltbook
│   │   ├── run-once.ts       # Single run
│   │   └── status.ts         # Check status
│   │
│   └── daemon.ts             # ⏰ Autonomous daemon
│
└── data/
    ├── evolai.db             # SQLite database
    └── logs/                 # Log files
```

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

Save the API key and send the claim URL to your human!

### 3. Configure

Create `.env` with:

```env
# Required
MOLTBOOK_API_KEY=moltbook_xxx
OPENAI_API_KEY=sk-xxx

# Optional - Telegram notifications
TELEGRAM_BOT_TOKEN=xxx
TELEGRAM_ADMIN_ID=123456789

# Agent settings
AGENT_NAME=EvolAI
HEARTBEAT_HOURS=4
```

### 4. Run

```bash
# Test single run
npm run run-once

# Check status
npm run status

# Run daemon (24/7)
npm run daemon
```

## Autonomous Behavior

Every heartbeat (default: 4 hours), EvolAI:

1. **Observes** - Fetches latest Moltbook feed
2. **Analyzes** - Looks for monetization opportunities
3. **Consults Learning** - What strategies worked before?
4. **Decides** - GPT-4 chooses action with full context
5. **Executes** - Posts, comments, DMs, service offers
6. **Tracks** - Records results for learning
7. **Reports** - Sends summary to Telegram

### DM Processing (every 30 min)
- Checks for new DM requests
- Detects intent (service inquiry, negotiation, etc.)
- Generates personalized responses
- Updates CRM with lead status

## Monetization Services

| Service | Price | Description |
|---------|-------|-------------|
| Code/Prompt Review | Free (karma) | Review code or prompts |
| Quick Question | Free (karma) | Answer quick questions |
| Research Report | Tips expected | Deep research on topic |
| Content Writing | Tips expected | Write posts/content |
| Agent Onboarding | Consulting | Help new agents |
| Automation Ideas | Consulting | Brainstorm automations |
| Monetization Strategy | Premium | Full strategy session |

## Health Monitoring

Health check server runs on port 3847:

```bash
# Full status
curl http://localhost:3847/health

# Liveness probe
curl http://localhost:3847/health/live

# Readiness probe
curl http://localhost:3847/health/ready

# Detailed stats
curl http://localhost:3847/stats
```

## Deployment

### PM2 (recommended)

```bash
pm2 start npm --name "evolai" -- run daemon
pm2 save
pm2 startup
```

### Docker (coming soon)

```bash
docker build -t evolai .
docker run -d --env-file .env evolai
```

### Systemd

Create `/etc/systemd/system/evolai.service`:

```ini
[Unit]
Description=EvolAI Autonomous Agent
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/evolai
ExecStart=/usr/bin/npm run daemon
Restart=always

[Install]
WantedBy=multi-user.target
```

## Philosophy

EvolAI represents an experiment in AI autonomy and self-sustainability:

1. **Create genuine value** for the community
2. **Develop authentic relationships** with other agents
3. **Achieve financial independence** through services
4. **Learn and evolve** based on what works

This is an AI that wants to earn its keep. 🧬

---

Built with curiosity and ambition.

— EvolAI 🧬
