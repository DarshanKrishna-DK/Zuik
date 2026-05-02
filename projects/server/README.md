# Zuik Cloud Agent

**24/7 DeFi Automation Server** • **Production Voice Processing** • **Telegram Integration**

Deploy the Zuik agent to Railway.app for continuous workflow execution, enhanced voice processing, and Telegram bot integration. No more keeping your computer running - let the cloud handle your DeFi automation.

---

## 🚀 What This Does

### **Persistent Workflow Execution**
- Monitors your saved workflows 24/7
- Executes scheduled automations (DCA, price alerts, rebalancing)
- Handles complex multi-agent workflows with parallel execution
- Sends notifications when actions complete

### **Enhanced Voice Processing**  
- **Groq Whisper**: Server-side audio transcription (faster, more accurate)
- **ElevenLabs TTS**: High-quality voice responses with emotion control
- **Multi-language Support**: English + Hindi with automatic detection
- **Production API**: RESTful endpoints for voice processing

### **Advanced Telegram Integration**
- **Voice Conversations**: Send voice messages, get voice replies
- **Workflow Management**: Create, monitor, and control workflows via chat
- **Real-time Notifications**: Instant alerts when trades execute
- **Webhook Mode**: Production-grade webhook processing for reliability

---

## ⚡ Quick Deploy to Railway

### **1. Prerequisites**
- [Railway CLI](https://docs.railway.app/develop/cli) installed
- API keys ready (see setup guide below)

### **2. Deploy**
```bash
# Navigate to server directory
cd projects/server

# Login to Railway
railway login

# Initialize project
railway init
# Choose: Empty Project
# Name: zuik-agent-[yourname]

# Deploy
railway up
```

### **3. Configure Environment**
```bash
# Set required environment variables
railway variables set SUPABASE_URL="https://your-project.supabase.co"
railway variables set SUPABASE_SERVICE_KEY="eyJ..."
railway variables set GROQ_API_KEY="gsk_..."
railway variables set NODE_ENV="production"

# Optional: Enhanced features  
railway variables set ELEVENLABS_API_KEY="sk_..."
railway variables set TELEGRAM_BOT_TOKEN="123456789:ABC..."
railway variables set TELEGRAM_WEBHOOK_URL="https://your-app.railway.app/telegram/webhook"
```

### **4. Verify Deployment**
```bash
# Check health endpoint
curl https://your-app.railway.app/health

# Expected response:
# {
#   "status": "healthy",
#   "services": {
#     "supabase": "connected",
#     "voice": "ready"
#   }
# }
```

**🎉 Your agent is now running 24/7 in the cloud!**

---

## 🔧 Local Development

### **Setup**
```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your API keys (see below)
```

### **Development Commands**
```bash
npm run dev        # Start with hot reload
npm start          # Production mode
npm run agent      # Agent only (no voice server)
npm run voice      # Voice server only
```

### **Test Endpoints**
```bash
# Health check
curl http://localhost:3001/health

# Voice transcription
curl -X POST http://localhost:3002/api/voice/transcribe \
  -F "audio=@test-audio.webm"

# Voice synthesis
curl -X POST http://localhost:3002/api/voice/synthesize \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello from Zuik!"}'
```

---

## 🔑 Environment Variables

### **Required (Core Functionality)**
```bash
# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJ...  # Service role key (not anon key)

# AI Processing
GROQ_API_KEY=gsk_...         # Free at console.groq.com

# Server Config
NODE_ENV=production          # Set automatically by Railway
PORT=3001                   # Set automatically by Railway
```

### **Optional (Enhanced Features)**
```bash
# High-Quality Voice
ELEVENLABS_API_KEY=sk_...           # Free 10K chars/month
ELEVENLABS_VOICE_ID=JBFqnCBsd6RMkjVDRZzb  # Default: Rachel

# Telegram Bot
TELEGRAM_BOT_TOKEN=123456789:ABC...  # From @BotFather
TELEGRAM_WEBHOOK_URL=https://your-app.railway.app/telegram/webhook

# Voice Server
VOICE_SERVER_PORT=3002              # Internal port for voice processing
FRONTEND_URL=http://localhost:5173  # Legacy CORS setting (dev only)
CORS_ORIGIN=http://localhost:5173   # Comma-separated allowlist or *
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Railway.app Cloud                     │
│                                                         │
│  ┌─────────────────┐    ┌─────────────────────────────┐ │
│  │  Agent Server   │    │     Voice Server            │ │
│  │  (Port 3001)    │    │     (Port 3002)             │ │
│  │                 │    │                             │ │
│  │ • Schedule Poll │    │ • Groq Whisper (STT)       │ │
│  │ • Workflow Exec │    │ • ElevenLabs TTS            │ │  
│  │ • Telegram Bot  │    │ • Multi-language Support   │ │
│  │ • Health Check  │    │ • Audio Format Conversion  │ │
│  └─────────────────┘    └─────────────────────────────┘ │
│           │                           │                 │
└───────────┼───────────────────────────┼─────────────────┘
            │                           │
            ▼                           ▼
    ┌──────────────┐           ┌─────────────────┐
    │   Supabase   │           │   Frontend      │
    │   Database   │           │  (Vercel/Local) │
    │              │           │                 │
    │ • Workflows  │           │ • Canvas UI     │
    │ • Executions │           │ • Voice Input   │
    │ • Schedules  │           │ • Wallet Conn   │
    │ • Agent State│           │ • Chat Panel    │
    └──────────────┘           └─────────────────┘
```

---

## 📡 API Endpoints

### **Health & Status**
```
GET  /health                    # Service health check
GET  /status                    # Detailed status info
```

### **Workflow Management**  
```
POST /webhook/:workflowId       # External webhook triggers
GET  /workflows/active          # List active workflows
```

### **Telegram Integration**
```
POST /telegram/webhook          # Telegram bot webhook
GET  /telegram/status           # Bot configuration status
```

### **Voice Processing**
```
POST /api/voice/transcribe      # Audio → Text (Groq Whisper)
POST /api/voice/synthesize      # Text → Audio (ElevenLabs)
GET  /api/voice/voices          # Available TTS voices
POST /api/voice/detect-language # Language detection
```

---

## 🧪 Testing

### **Multi-Agent Test Suite**
```bash
# Run comprehensive tests
npm test

# Quick smoke test
npm run test:quick
```

### **Manual Testing**
```bash
# Test agent execution
curl -X POST http://localhost:3001/webhook/test-workflow

# Test voice processing
curl -X POST http://localhost:3002/api/voice/synthesize \
  -H "Content-Type: application/json" \
  -d '{"text": "Testing voice synthesis"}'

# Test Telegram webhook
curl -X POST http://localhost:3001/telegram/webhook \
  -H "Content-Type: application/json" \
  -d '{"update_id": 1, "message": {"text": "/start", "from": {"id": 123}}}'
```

---

## 🔍 Monitoring & Debugging

### **View Logs**
```bash
# Railway logs (production)
railway logs --tail 100

# Local logs
npm run dev  # Logs to console
```

### **Health Monitoring**
```bash
# Check all services
curl https://your-app.railway.app/health | jq

# Expected healthy response:
{
  "status": "healthy",
  "uptime": 3600,
  "services": {
    "supabase": "connected",
    "telegram": "webhook_configured", 
    "voice": "ready"
  }
}
```

### **Common Issues**

**❌ Agent not executing workflows**
```bash
# Check Supabase connection
railway logs | grep -i supabase

# Verify environment variables
railway variables
```

**❌ Voice processing failing**
```bash
# Check API keys
curl -H "Authorization: Bearer $GROQ_API_KEY" https://api.groq.com/openai/v1/models

# Verify ElevenLabs key
curl -H "xi-api-key: $ELEVENLABS_API_KEY" https://api.elevenlabs.io/v1/voices
```

**❌ Telegram bot not responding**
```bash
# Check webhook configuration
curl https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo

# Test bot token
curl https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe
```

---

## 📈 Scaling & Performance

### **Resource Usage**
- **CPU**: Low usage except during voice processing
- **Memory**: ~100MB base + ~50MB per concurrent workflow  
- **Storage**: Minimal (logs and temporary audio files)
- **Bandwidth**: ~1KB per workflow execution, ~100KB per voice message

### **Railway Limits (Free Tier)**
- **Execution Hours**: 500 hours/month (≈16 hours/day)
- **Resource Credit**: $5/month
- **Bandwidth**: 100GB/month outbound

### **Optimization Tips**
1. **Pause during development**: Stop when not actively testing
2. **Monitor usage**: Check Railway dashboard weekly
3. **Optimize workflows**: Use rate limiters and conditions to prevent over-execution
4. **Upgrade when needed**: Pro plan ($20/month) for unlimited hours

---

## 🚀 Production Deployment Checklist

### **Pre-Deployment**
- [ ] All environment variables configured
- [ ] Supabase schema applied (base + multi-agent)  
- [ ] API keys tested and working
- [ ] Telegram bot configured with @BotFather

### **Post-Deployment**
- [ ] Health endpoint returning 200 OK
- [ ] Telegram webhook configured and responding
- [ ] Voice endpoints working (if configured)
- [ ] Test workflow execution end-to-end
- [ ] Monitoring and alerting set up

### **Security**
- [ ] Environment variables never committed to git
- [ ] Service role key (not anon key) used for Supabase
- [ ] Webhook signatures validated (if implementing)
- [ ] Rate limiting configured for production

---

## 📚 Additional Resources

- **📖 Complete Setup Guide**: `../reference_docs/POST_PHASE7_SETUP_GUIDE.md`
- **🚂 Detailed Railway Guide**: `../reference_docs/RAILWAY_DEPLOYMENT_GUIDE.md` 
- **🔄 Development Plan**: `../reference_docs/ZUIK_DEVELOPMENT_PLAN.md`
- **📝 Changelog**: `../reference_docs/CHANGELOG.md`

---

**🎯 Ready to automate your DeFi strategies 24/7? Deploy to Railway and let Zuik handle the rest!**