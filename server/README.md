# Zuik Cloud Agent & Voice Server

A Node.js cloud service that provides:
- **Agent execution**: Executes notification-only workflows (Telegram alerts, price monitoring)
- **Voice processing**: Server-side audio transcription (Groq Whisper) and text-to-speech (ElevenLabs)
- **Telegram bot**: Enhanced bot with webhook support and AI conversation
- **Cloud deployment**: Production-ready for Railway.app, Render, or any cloud platform

## Features

### 🤖 Agent Execution
- **Price monitoring**: Fetches ALGO/USD from CoinGecko, evaluates conditions
- **Telegram notifications**: Sends formatted messages via Telegram Bot API
- **Discord webhooks**: Posts to Discord channels when triggered
- **Safe evaluation**: No `eval()` - uses whitelist of mathematical operators
- **Schedule polling**: Checks Supabase for due workflow executions

### 🎤 Voice Processing (Phase 7B)
- **Groq Whisper**: Server-side audio transcription with language detection
- **ElevenLabs TTS**: High-quality text-to-speech with multi-language support
- **Production-ready**: RESTful API with proper error handling and health checks

### 📱 Telegram Bot (Phase 7C)
- **Webhook mode**: Production webhook support for cloud deployment
- **AI conversation**: Natural language workflow creation via Groq
- **Enhanced commands**: Voice message support, workflow management
- **Multi-language**: Hindi + English support

## Quick Start

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

### Production Deployment

#### Railway.app (Recommended)
1. **Deploy to Railway:**
   ```bash
   railway login
   railway init
   railway up
   ```

2. **Set environment variables in Railway dashboard:**
   - `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
   - `TELEGRAM_BOT_TOKEN` (from @BotFather)
   - `GROQ_API_KEY` (for voice transcription)
   - `ELEVENLABS_API_KEY` (for voice synthesis)
   - `TELEGRAM_WEBHOOK_URL` (your Railway app URL + `/telegram/webhook`)

#### Render.com
1. **Create new web service**
2. **Connect GitHub repository**
3. **Set environment variables**
4. **Deploy**

## Environment Variables

### Required
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

### Optional - Telegram Bot
```env
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_WEBHOOK_URL=https://your-app.railway.app/telegram/webhook
```

### Optional - Voice Services (Phase 7B)
```env
GROQ_API_KEY=your-groq-api-key
ELEVENLABS_API_KEY=your-elevenlabs-api-key
ELEVENLABS_VOICE_ID=JBFqnCBsd6RMkjVDRZzb
```

### Optional - Configuration
```env
PORT=3001
VOICE_SERVER_PORT=3002
POLL_INTERVAL_MS=15000
NODE_ENV=production
```

## API Endpoints

### Health Check
```http
GET /health
```

### Voice Processing
```http
POST /api/voice/transcribe
POST /api/voice/synthesize
GET  /api/voice/voices
POST /api/voice/detect-language
```

### Webhooks
```http
POST /telegram/webhook
POST /webhook/:workflowId
```

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Main Server   │    │  Voice Server   │    │ Telegram Bot    │
│   (index.ts)    │    │ (voiceServer.ts)│    │ (telegram.ts)   │
│                 │    │                 │    │                 │
│ • Health checks │    │ • Groq Whisper  │    │ • Webhook mode  │
│ • Webhooks      │    │ • ElevenLabs    │    │ • AI chat       │
│ • Scheduling    │    │ • Multi-language│    │ • Commands      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Supabase      │
                    │   Database      │
                    └─────────────────┘
```

## Workflow Support

| Block | Support | Notes |
|-------|---------|-------|
| timer-loop | ✅ Trigger | Cloud-ready scheduling |
| price-feed, get-quote | ✅ | CoinGecko integration |
| comparator, filter | ✅ | Safe condition evaluation |
| send-telegram | ✅ | Bot API + webhook mode |
| send-discord | ✅ | Webhook URLs |
| delay | ✅ | Production timeouts |
| log, http-request | ✅ | Cloud logging |
| **wallet blocks** | ❌ | Requires user signatures |

## Phase 7 Implementation Status

### ✅ Completed
- [x] Bug fixes (BUG-001 through BUG-010)
- [x] Basic voice conversation (browser TTS/STT)
- [x] Local agent with Telegram bot

### 🚧 In Progress (Phase 7B & 7C)
- [x] Groq Whisper server-side transcription
- [x] ElevenLabs TTS server-side synthesis
- [x] Enhanced voice conversation loop
- [x] Multi-language support (Hindi + English)
- [x] Cloud deployment configuration (Railway/Render)
- [x] Telegram webhook mode
- [x] Production server architecture

### 🔄 Next Steps
- [ ] Deploy to Railway.app
- [ ] Set up production environment variables
- [ ] Test voice services in production
- [ ] Performance monitoring and scaling

## Development Scripts

```bash
npm run dev          # Development mode with auto-reload
npm start            # Production mode
npm run agent        # Agent only (local mode)
npm run voice        # Voice server only
npm run voice:dev    # Voice server development mode
```

## Troubleshooting

### Voice Services
- **No audio**: Check `ELEVENLABS_API_KEY` and account credits
- **Transcription fails**: Verify `GROQ_API_KEY` and audio format
- **Language detection**: Server auto-detects Hindi/English

### Telegram Bot
- **Commands not working**: Check bot token and webhook URL
- **Webhook issues**: Verify HTTPS and correct endpoint URL
- **AI chat failing**: Check `GROQ_API_KEY` in environment

### Deployment
- **Health check failing**: Ensure all required env vars are set
- **Service crash**: Check logs for missing dependencies or API keys
- **Port issues**: Verify `PORT` environment variable

## Telegram Commands

- `/start` - Register and link wallet
- `/link <algorand-address>` - Link Algorand wallet
- `/workflows` - List saved workflows
- `/run_workflow` - Execute a workflow
- `/status` - Active schedules
- `/price` - Current ALGO price
- `/help` - Show all commands