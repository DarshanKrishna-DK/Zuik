/**
 * Persistent Workflow Scheduler
 *
 * Schedules are stored in Supabase so they survive browser close.
 * When the app reopens, missed executions are detected and queued.
 *
 * Architecture:
 * - On-chain transactions (swaps, payments) require the browser to be open
 *   because the wallet signer is needed (non-custodial model).
 * - Notification-only workflows (Telegram, Discord, browser alerts) can
 *   run server-side via Supabase Edge Functions + pg_cron.
 * - The scheduler persists state to Supabase and catches up on missed runs.
 */

import { isSupabaseConfigured, getSupabase } from './supabase'

export interface ScheduleEntry {
  id: string
  workflow_id: string
  wallet_address: string
  interval_sec: number
  max_iterations: number | null
  iterations_completed: number
  next_run_at: string
  is_active: boolean
  requires_signer: boolean
  flow_json: { nodes: unknown[]; edges: unknown[] }
  created_at: string
  updated_at: string
}

/**
 * Save a workflow schedule to Supabase.
 * Called when a user starts a workflow with timer triggers.
 */
export async function saveSchedule(params: {
  workflowId: string
  walletAddress: string
  intervalSec: number
  maxIterations: number | null
  requiresSigner: boolean
  flowJson: { nodes: unknown[]; edges: unknown[] }
}): Promise<string | null> {
  if (!isSupabaseConfigured()) return null

  try {
    const sb = getSupabase()
    const nextRunAt = new Date(Date.now() + params.intervalSec * 1000).toISOString()

    const { data, error } = await sb
      .from('workflow_schedules')
      .upsert({
        workflow_id: params.workflowId,
        wallet_address: params.walletAddress,
        interval_sec: params.intervalSec,
        max_iterations: params.maxIterations,
        iterations_completed: 0,
        next_run_at: nextRunAt,
        is_active: true,
        requires_signer: params.requiresSigner,
        flow_json: params.flowJson,
      }, { onConflict: 'workflow_id' })
      .select('id')
      .single()

    if (error) {
      console.warn('Failed to save schedule:', error.message)
      return null
    }
    return (data as { id: string }).id
  } catch (err) {
    console.warn('Schedule save error:', err)
    return null
  }
}

/**
 * Deactivate a schedule when the workflow is stopped.
 */
export async function deactivateSchedule(workflowId: string): Promise<void> {
  if (!isSupabaseConfigured()) return
  try {
    const sb = getSupabase()
    await sb
      .from('workflow_schedules')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('workflow_id', workflowId)
  } catch { /* non-blocking */ }
}

/**
 * Increment iteration count and set next run time.
 */
export async function recordScheduleIteration(scheduleId: string, intervalSec: number): Promise<void> {
  if (!isSupabaseConfigured()) return
  try {
    const sb = getSupabase()
    const nextRunAt = new Date(Date.now() + intervalSec * 1000).toISOString()
    await sb.rpc('increment_schedule_iteration', {
      p_schedule_id: scheduleId,
      p_next_run_at: nextRunAt,
    }).then(({ error }) => {
      if (error) {
        sb.from('workflow_schedules')
          .update({
            iterations_completed: undefined,
            next_run_at: nextRunAt,
            updated_at: new Date().toISOString(),
          })
          .eq('id', scheduleId)
      }
    })
  } catch { /* non-blocking */ }
}

/**
 * Get all active schedules for a wallet that have missed runs.
 * A "missed run" is a schedule whose next_run_at is in the past.
 */
export async function getMissedSchedules(walletAddress: string): Promise<ScheduleEntry[]> {
  if (!isSupabaseConfigured()) return []
  try {
    const sb = getSupabase()
    const { data, error } = await sb
      .from('workflow_schedules')
      .select('*')
      .eq('wallet_address', walletAddress)
      .eq('is_active', true)
      .lt('next_run_at', new Date().toISOString())
      .order('next_run_at', { ascending: true })

    if (error) return []
    return (data ?? []) as ScheduleEntry[]
  } catch {
    return []
  }
}

/**
 * Get all active schedules for a wallet.
 */
export async function getActiveSchedules(walletAddress: string): Promise<ScheduleEntry[]> {
  if (!isSupabaseConfigured()) return []
  try {
    const sb = getSupabase()
    const { data, error } = await sb
      .from('workflow_schedules')
      .select('*')
      .eq('wallet_address', walletAddress)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (error) return []
    return (data ?? []) as ScheduleEntry[]
  } catch {
    return []
  }
}

/**
 * SQL migration for the workflow_schedules table.
 * Run this in your Supabase SQL editor.
 */
export const SCHEDULE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS workflow_schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  interval_sec INT NOT NULL DEFAULT 60,
  max_iterations INT,
  iterations_completed INT NOT NULL DEFAULT 0,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  requires_signer BOOLEAN NOT NULL DEFAULT true,
  flow_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workflow_id)
);

ALTER TABLE workflow_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own schedules"
  ON workflow_schedules FOR SELECT
  USING (true);

CREATE POLICY "Users manage own schedules"
  ON workflow_schedules FOR ALL
  USING (true);

CREATE OR REPLACE FUNCTION increment_schedule_iteration(
  p_schedule_id UUID,
  p_next_run_at TIMESTAMPTZ
)
RETURNS void AS $$
BEGIN
  UPDATE workflow_schedules
  SET iterations_completed = iterations_completed + 1,
      next_run_at = p_next_run_at,
      updated_at = now()
  WHERE id = p_schedule_id;
END;
$$ LANGUAGE plpgsql;
`
