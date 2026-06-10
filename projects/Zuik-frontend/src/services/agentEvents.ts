import { getSupabase, isSupabaseConfigured } from './supabase'

export interface AgentEventRow {
  id: string
  workflow_id: string
  event_name: string
  data: Record<string, unknown> | null
  emitted_at: string
  filter_key: string | null
  filter_value: string | null
  agent_id: string | null
}

/** Persist agent events for multi-tab / cross-session event bus. No-op without Supabase. */
export async function insertAgentEvent(params: {
  workflowId: string
  eventName: string
  data: Record<string, unknown>
  filterKey?: string | null
  filterValue?: string | null
  agentId?: string | null
  parentWorkflowId?: string | null
}): Promise<string | null> {
  if (!isSupabaseConfigured()) return null
  try {
    const sb = getSupabase()
    const { data, error } = await sb
      .from('agent_events')
      .insert({
        workflow_id: params.workflowId,
        event_name: params.eventName,
        data: params.data,
        filter_key: params.filterKey ?? null,
        filter_value: params.filterValue ?? null,
        agent_id: params.agentId ?? null,
        parent_workflow_id: params.parentWorkflowId ?? null,
      })
      .select('id')
      .single()

    if (error) {
      console.warn('[agent_events] insert failed:', error.message)
      return null
    }
    return (data as { id: string }).id
  } catch (e) {
    console.warn('[agent_events] insert error:', e)
    return null
  }
}

export async function listRecentAgentEvents(
  workflowId: string,
  eventName: string,
  limit = 50,
): Promise<AgentEventRow[]> {
  if (!isSupabaseConfigured()) return []
  try {
    const sb = getSupabase()
    const { data, error } = await sb
      .from('agent_events')
      .select('id, workflow_id, event_name, data, emitted_at, filter_key, filter_value, agent_id')
      .eq('workflow_id', workflowId)
      .eq('event_name', eventName)
      .order('emitted_at', { ascending: false })
      .limit(limit)

    if (error) return []
    return (data ?? []) as AgentEventRow[]
  } catch {
    return []
  }
}
