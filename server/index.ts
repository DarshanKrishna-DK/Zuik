import 'dotenv/config'
import express from 'express'
import { startTelegramBot, handleTelegramWebhook } from './telegram.js'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { startVoiceServer } from './voiceServer.js'

const PORT = parseInt(process.env.PORT || '3001', 10)
const VOICE_SERVER_PORT = parseInt(process.env.VOICE_SERVER_PORT || '3002', 10)

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? ''
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS ?? '15000', 10)

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[Server] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env')
  process.exit(1)
}

const sb: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY)

// Import agent functions
import { executeWorkflowHeadless } from './agent.js'

interface ScheduleRow {
  id: string
  workflow_id: string
  wallet_address: string
  interval_sec: number
  max_iterations: number | null
  iterations_completed: number
  next_run_at: string
  is_active: boolean
  requires_signer: boolean
  flow_json: { nodes: any[]; edges: any[] }
}

// Main HTTP server for health checks and webhooks
const app = express()
app.use(express.json())

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      agent: 'running',
      telegram: process.env.TELEGRAM_BOT_TOKEN ? 'configured' : 'disabled',
      voice: 'running',
    },
  })
})

// Telegram webhook endpoint
app.post('/telegram/webhook', (req, res) => {
  try {
    const update = req.body
    handleTelegramWebhook(update)
    res.json({ ok: true })
  } catch (error) {
    console.error('[Server] Telegram webhook error:', error)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})

// Webhook endpoint for external triggers
app.post('/webhook/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params
    
    // Fetch workflow from database
    const { data: workflow, error } = await sb
      .from('workflows')
      .select('*')
      .eq('id', workflowId)
      .eq('is_active', true)
      .single()

    if (error || !workflow) {
      return res.status(404).json({ error: 'Workflow not found or inactive' })
    }

    // Execute workflow
    await executeWorkflowHeadless(
      workflow.flow_json,
      workflow.wallet_address,
      `webhook-${workflowId}`
    )

    res.json({ success: true, executed: workflowId })
  } catch (error) {
    console.error('[Server] Webhook error:', error)
    res.status(500).json({ error: 'Workflow execution failed' })
  }
})

// Schedule polling function
async function pollSchedules(): Promise<void> {
  const now = new Date().toISOString()

  const { data: schedules, error } = await sb
    .from('workflow_schedules')
    .select('*')
    .eq('is_active', true)
    .eq('requires_signer', false)
    .lte('next_run_at', now)
    .order('next_run_at', { ascending: true })

  if (error) {
    console.error('[Server] Schedule fetch error:', error.message)
    return
  }

  if (!schedules || schedules.length === 0) return

  console.log(`[Server] Found ${schedules.length} due schedule(s)`)

  for (const schedule of schedules as ScheduleRow[]) {
    try {
      await executeWorkflowHeadless(
        schedule.flow_json,
        schedule.wallet_address,
        schedule.workflow_id
      )

      const maxIter = schedule.max_iterations
      const newCount = schedule.iterations_completed + 1
      const done = maxIter !== null && newCount >= maxIter

      if (done) {
        await sb
          .from('workflow_schedules')
          .update({ is_active: false, iterations_completed: newCount, updated_at: now })
          .eq('id', schedule.id)
        console.log(`[Server] Schedule ${schedule.id} completed (${newCount}/${maxIter})`)
      } else {
        const nextRun = new Date(Date.now() + schedule.interval_sec * 1000).toISOString()
        await sb
          .from('workflow_schedules')
          .update({ iterations_completed: newCount, next_run_at: nextRun, updated_at: now })
          .eq('id', schedule.id)
      }
    } catch (e) {
      console.error(`[Server] Workflow ${schedule.workflow_id} error:`, e)
    }
  }
}

// Start all services
async function startServer() {
  console.log('╔══════════════════════════════════════╗')
  console.log('║        Zuik Cloud Server v1.0.0      ║')
  console.log('╚══════════════════════════════════════╝')
  console.log(`[Server] Main server port: ${PORT}`)
  console.log(`[Server] Voice server port: ${VOICE_SERVER_PORT}`)
  console.log(`[Server] Polling interval: ${POLL_INTERVAL}ms`)
  console.log(`[Server] Supabase: ${SUPABASE_URL}`)

  // Start main HTTP server
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] 🌐 Main server running on port ${PORT}`)
  })

  // Start voice server
  try {
    startVoiceServer()
  } catch (error) {
    console.warn('[Server] Voice server failed to start:', error)
  }

  // Start Telegram bot
  try {
    startTelegramBot(sb)
  } catch (error) {
    console.warn('[Server] Telegram bot failed to start:', error)
  }

  // Start polling loop
  console.log('[Server] 🔄 Starting schedule polling loop...')
  while (true) {
    try {
      await pollSchedules()
    } catch (e) {
      console.error('[Server] Poll error:', e)
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL))
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('[Server] 📴 Shutting down gracefully...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('[Server] 📴 Received SIGTERM, shutting down gracefully...')
  process.exit(0)
})

// Start the server
startServer().catch(console.error)