# Zuik Cloud Server

Node server that runs scheduled workflows, agent decisions, voice APIs, and Telegram hooks against Supabase. Deploy to Railway for 24/7 execution, or run locally while building.

## What it does

- Polls `workflow_schedules` and executes headless flows (DCA, alerts, AI agent blocks)
- Routes agent spends through the Guardian contract (`sendAuthorizedPayment`)
- Proxies Groq chat for the frontend (`/api/ai/chat`)
- Voice STT/TTS when `GROQ_API_KEY` and/or `ELEVENLABS_API_KEY` are set
- x402 premium market data and facilitator endpoints for agent-paid API calls
- Telegram bot and webhook for notifications and voice workflows

## Quick start (local)

```bash
cd projects/server
npm install
cp .env.example .env
# fill in SUPABASE_URL, SUPABASE_SERVICE_KEY, GROQ_API_KEY
npm run dev
```

Default port is **4021** (`PORT` in `.env`). Voice runs inline when `NODE_ENV=production`, or on port **3002** in dev (`npm run voice`).

```bash
curl http://localhost:4021/health
```

## Deploy (Railway)

```bash
cd projects/server
railway login
railway init
railway up
```

Set at least:

```bash
railway variables set SUPABASE_URL="https://your-project.supabase.co"
railway variables set SUPABASE_SERVICE_KEY="eyJ..."
railway variables set GROQ_API_KEY="gsk_..."
railway variables set NODE_ENV="production"
```

Optional: `ELEVENLABS_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_URL`, `CORS_ORIGIN`, `GUARDIAN_APP_ID`.

## Environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `SUPABASE_URL` | yes | Project URL |
| `SUPABASE_SERVICE_KEY` or `SUPABASE_SECRET_KEY` | yes | Service role, not anon |
| `GROQ_API_KEY` | yes for AI/voice STT | Free tier at console.groq.com |
| `PORT` | no | Default 4021 |
| `POLL_INTERVAL_MS` | no | Schedule poll interval (default 15000) |
| `NODE_ENV` | no | `production` mounts voice on main app |
| `VOICE_SERVER_PORT` | no | Standalone voice server in dev (3002) |
| `ELEVENLABS_API_KEY` | no | TTS |
| `TELEGRAM_BOT_TOKEN` | no | Bot mode |
| `CORS_ORIGIN` | no | Comma-separated origins for API |
| `GUARDIAN_APP_ID` | no | Guardian app on Algorand |
| `ZUIK_AGENT_KEYS` or `.keystore.json` | no | Agent mnemonics (server only) |

See `.env.example` for the full list.

## API routes

### Core

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness check |
| POST | `/webhook/:workflowId` | Trigger a saved workflow |
| POST | `/api/workflows/execute` | Run a flow JSON with agent context |
| POST | `/telegram/webhook` | Telegram update handler |

### Mounted routers

| Prefix | Purpose |
|--------|---------|
| `/api/voice` | Transcribe, synthesize, voices, detect-language |
| `/api/ai` | Groq chat proxy |
| `/api/market` | Market data proxy |
| `/api/x402` | Premium paid endpoints |
| `/api/x402/facilitator` | x402 facilitator |
| `/api/agent-wallets` | Register agent keys, balances |
| `/api/agent-management` | Policy templates, agent lifecycle |

Voice paths (when mounted): `POST /api/voice/transcribe`, `POST /api/voice/synthesize`, `GET /api/voice/voices`, `POST /api/voice/detect-language`.

## npm scripts

```bash
npm start              # Main server
npm run dev            # Main server with watch
npm run agent          # Legacy agent-only entry (agent.ts)
npm run voice          # Standalone voice server (dev)
npm run setup:agent-wallets   # Supabase table setup
npm run renew:guardian        # Renew Guardian policy on-chain
npm run check:guardian        # Inspect Guardian box state
npm run test:x402             # x402 premium integration test
npm run test:x402:unit        # x402 unit checks
```

## Layout

```
index.ts              Main server (schedules, webhooks, routers)
agent.ts              Standalone scheduler entry (no HTTP stack)
voiceServer.ts        Voice router + optional standalone server
workflowRunner.ts     Block execution and Guardian payments
guardianExecutor.ts   Signed payment groups
aiAgent.ts            AgentLoop entry for ai-agent blocks
agent/                Loop, memory, tools, multi-agent coordination
scripts/              Guardian and x402 maintenance scripts
```

Agent mnemonics stay in `.keystore.json` or `ZUIK_AGENT_KEYS`. Never commit them.

## Troubleshooting

**Workflows not firing** - Check `railway logs` or local console for Supabase errors. Confirm schedules have `requires_signer=false` and `next_run_at` in the past.

**Voice 503** - Set `GROQ_API_KEY` (STT) and/or `ELEVENLABS_API_KEY` (TTS). In dev, run `npm run voice` if `NODE_ENV` is not `production`.

**Agent payments fail** - Agent needs a key in keystore, Guardian policy registered, and enough ALGO. Run `npm run check:guardian`.

## Related docs

- `../reference_docs/ZUIK_DEVELOPMENT_PLAN.md`
- `../docs/testing/README.md`
