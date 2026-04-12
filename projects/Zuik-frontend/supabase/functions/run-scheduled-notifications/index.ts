/**
 * Supabase Edge Function: run-scheduled-notifications
 *
 * This function runs on a cron schedule (e.g. every minute via pg_cron)
 * and executes notification-only workflows (Telegram, Discord alerts)
 * that don't require wallet signatures.
 *
 * Deploy: supabase functions deploy run-scheduled-notifications
 * Cron:   SELECT cron.schedule('run-notifications', '* * * * *',
 *           $$SELECT net.http_post(
 *             url := '<SUPABASE_URL>/functions/v1/run-scheduled-notifications',
 *             headers := '{"Authorization": "Bearer <ANON_KEY>"}'::jsonb
 *           )$$);
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') || ''

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
  flow_json: {
    nodes: Array<{
      id: string
      data: { blockId: string; config: Record<string, string | number> }
    }>
    edges: Array<{ source: string; target: string }>
  }
}

async function sendTelegram(chatId: string, message: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) return false
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' }),
    })
    const data = await res.json()
    return data.ok === true
  } catch {
    return false
  }
}

async function sendDiscord(webhookUrl: string, message: string): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    })
    return res.ok
  } catch {
    return false
  }
}

Deno.serve(async () => {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const { data: schedules, error } = await sb
    .from('workflow_schedules')
    .select('*')
    .eq('is_active', true)
    .eq('requires_signer', false)
    .lt('next_run_at', new Date().toISOString())

  if (error || !schedules) {
    return new Response(JSON.stringify({ error: error?.message ?? 'no data' }), { status: 500 })
  }

  let executed = 0

  for (const schedule of schedules as ScheduleRow[]) {
    if (
      schedule.max_iterations !== null &&
      schedule.iterations_completed >= schedule.max_iterations
    ) {
      await sb.from('workflow_schedules').update({ is_active: false }).eq('id', schedule.id)
      continue
    }

    const nodes = schedule.flow_json?.nodes ?? []
    for (const node of nodes) {
      const blockId = node.data?.blockId
      const config = node.data?.config ?? {}

      if (blockId === 'send-telegram' && config.chatId && config.message) {
        await sendTelegram(String(config.chatId), String(config.message))
      }
      if (blockId === 'send-discord' && config.webhookUrl && config.message) {
        await sendDiscord(String(config.webhookUrl), String(config.message))
      }
    }

    const nextRunAt = new Date(
      Date.now() + schedule.interval_sec * 1000
    ).toISOString()

    await sb.from('workflow_schedules').update({
      iterations_completed: schedule.iterations_completed + 1,
      next_run_at: nextRunAt,
      updated_at: new Date().toISOString(),
    }).eq('id', schedule.id)

    executed++
  }

  return new Response(JSON.stringify({ ok: true, executed }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
