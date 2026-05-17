import 'dotenv/config'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { startTelegramBot } from './telegram.js'
import { executeWorkflowHeadless, type FlowNode, type FlowEdge } from './workflowRunner.js'
import { fetchActiveLogicSigVault } from './logicSigDelegation.js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? ''
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS ?? '15000', 10)

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[Agent] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env')
  process.exit(1)
}

const sb: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY)

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
  schedule_type?: 'interval' | 'start_at'
  flow_json: { nodes: FlowNode[]; edges: FlowEdge[] }
}

async function executeWorkflow(schedule: ScheduleRow): Promise<void> {
  const vault = await fetchActiveLogicSigVault(sb, schedule.wallet_address)
  await executeWorkflowHeadless(
    schedule.flow_json,
    schedule.wallet_address,
    schedule.workflow_id,
    getLinkedTelegramChats,
    vault,
  )
}

// ── Telegram link helpers ───────────────────────────────

async function getLinkedTelegramChats(walletAddress: string): Promise<string[]> {
  const { data } = await sb
    .from('telegram_links')
    .select('telegram_chat_id')
    .eq('wallet_address', walletAddress)
  return (data ?? []).map((r: { telegram_chat_id: string }) => r.telegram_chat_id)
}

// ── Main polling loop ───────────────────────────────────

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
    console.error('[Agent] Schedule fetch error:', error.message)
    return
  }

  if (!schedules || schedules.length === 0) return

  console.log(`[Agent] Found ${schedules.length} due schedule(s)`)

  for (const schedule of schedules as ScheduleRow[]) {
    try {
      await executeWorkflow(schedule)

      const maxIter = schedule.max_iterations
      const newCount = schedule.iterations_completed + 1
      const isStartAt = schedule.schedule_type === 'start_at'
      const done = maxIter !== null && newCount >= maxIter

      if (done || isStartAt) {
        await sb.from('workflow_schedules').update({ is_active: false, iterations_completed: newCount, updated_at: now }).eq('id', schedule.id)
        console.log(`[Agent] Schedule ${schedule.id} completed (${newCount}/${maxIter ?? 1})`)
      } else {
        const nextRun = new Date(Date.now() + schedule.interval_sec * 1000).toISOString()
        await sb.from('workflow_schedules').update({ iterations_completed: newCount, next_run_at: nextRun, updated_at: now }).eq('id', schedule.id)
      }
    } catch (e) {
      console.error(`[Agent] Workflow ${schedule.workflow_id} error:`, e)
    }
  }
}

// ── Startup ─────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════╗')
  console.log('║       Zuik Local Agent v1.0.0        ║')
  console.log('╚══════════════════════════════════════╝')
  console.log(`[Agent] Polling interval: ${POLL_INTERVAL}ms`)
  console.log(`[Agent] Supabase: ${SUPABASE_URL}`)

  startTelegramBot(sb)

  while (true) {
    try {
      await pollSchedules()
    } catch (e) {
      console.error('[Agent] Poll error:', e)
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL))
  }
}

main().catch(console.error)
