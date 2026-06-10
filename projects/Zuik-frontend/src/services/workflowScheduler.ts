/**
 * Schedules live in Supabase so they survive browser restarts.
 * On-chain steps still need the wallet open; notifications can run server-side.
 */

import { isSupabaseConfigured, getSupabase } from './supabase'

export type ScheduleType = 'interval' | 'start_at'

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
  agent_address: string | null
  schedule_type: ScheduleType
  flow_json: { nodes: unknown[]; edges: unknown[] }
  created_at: string
  updated_at: string
}

export async function saveSchedule(params: {
  workflowId: string
  walletAddress: string
  intervalSec: number
  maxIterations: number | null
  requiresSigner: boolean
  /** Agent sub-account address that the server uses to sign headless send-payment runs. */
  agentAddress?: string
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
        agent_address: params.agentAddress ?? null,
        schedule_type: 'interval',
        flow_json: params.flowJson,
      }, { onConflict: 'workflow_id,schedule_type' })
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

export async function deactivateSchedule(workflowId: string, scheduleType?: ScheduleType): Promise<void> {
  if (!isSupabaseConfigured()) return
  try {
    const sb = getSupabase()
    const query = sb
      .from('workflow_schedules')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('workflow_id', workflowId)
    if (scheduleType) query.eq('schedule_type', scheduleType)
    await query
  } catch { /* non-blocking */ }
}

export async function scheduleWorkflowStart(params: {
  workflowId: string
  walletAddress: string
  runAtIso: string
  requiresSigner: boolean
  agentAddress?: string
  flowJson: { nodes: unknown[]; edges: unknown[] }
}): Promise<string | null> {
  if (!isSupabaseConfigured()) return null
  try {
    const sb = getSupabase()
    const { data, error } = await sb
      .from('workflow_schedules')
      .upsert({
        workflow_id: params.workflowId,
        wallet_address: params.walletAddress,
        interval_sec: 60,
        max_iterations: 1,
        iterations_completed: 0,
        next_run_at: params.runAtIso,
        is_active: true,
        requires_signer: params.requiresSigner,
        agent_address: params.agentAddress ?? null,
        schedule_type: 'start_at',
        flow_json: params.flowJson,
      }, { onConflict: 'workflow_id,schedule_type' })
      .select('id')
      .single()

    if (error) {
      console.warn('Failed to schedule run:', error.message)
      return null
    }
    return (data as { id: string }).id
  } catch (err) {
    console.warn('Schedule start error:', err)
    return null
  }
}

export async function completeSchedule(scheduleId: string): Promise<void> {
  if (!isSupabaseConfigured()) return
  try {
    const sb = getSupabase()
    await sb
      .from('workflow_schedules')
      .update({
        is_active: false,
        iterations_completed: 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', scheduleId)
  } catch { /* non-blocking */ }
}

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

/** Schedules whose next_run_at is already in the past. */
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

/** Supabase migration for workflow_schedules (run in SQL editor). */
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
  agent_address TEXT,
  schedule_type TEXT NOT NULL DEFAULT 'interval',
  flow_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workflow_id, schedule_type)
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
