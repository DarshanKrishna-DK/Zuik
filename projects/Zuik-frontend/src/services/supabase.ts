import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

let _client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_client) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env')
    }
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  }
  return _client
}

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
}

export interface WorkflowRow {
  id: string
  wallet_address: string
  name: string
  description: string
  flow_json: { nodes: unknown[]; edges: unknown[] }
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ExecutionRow {
  id: string
  workflow_id: string
  wallet_address: string
  status: 'running' | 'success' | 'failed' | 'cancelled'
  started_at: string
  completed_at: string | null
  block_logs: unknown[]
  tx_ids: string[]
  error_message: string | null
  block_count: number
  total_fees_microalgo: number
  duration_ms: number
}

export async function listWorkflows(walletAddress: string): Promise<WorkflowRow[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('workflows')
    .select('*')
    .eq('wallet_address', walletAddress)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as WorkflowRow[]
}

export async function getWorkflow(id: string): Promise<WorkflowRow | null> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('workflows')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return data as WorkflowRow
}

export async function createWorkflow(
  walletAddress: string,
  name: string,
  flowJson: { nodes: unknown[]; edges: unknown[] },
): Promise<WorkflowRow> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('workflows')
    .insert({
      wallet_address: walletAddress,
      name,
      flow_json: flowJson,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as WorkflowRow
}

export async function updateWorkflow(
  id: string,
  updates: Partial<Pick<WorkflowRow, 'name' | 'description' | 'flow_json' | 'is_active'>>,
): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb
    .from('workflows')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

export async function deleteWorkflow(id: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb
    .from('workflows')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
}

export async function duplicateWorkflow(id: string, walletAddress: string): Promise<WorkflowRow> {
  const original = await getWorkflow(id)
  if (!original) throw new Error('Workflow not found')

  return createWorkflow(
    walletAddress,
    `${original.name} (copy)`,
    original.flow_json,
  )
}

export async function recordExecution(
  workflowId: string,
  walletAddress: string,
  blockCount: number,
): Promise<string> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('executions')
    .insert({
      workflow_id: workflowId,
      wallet_address: walletAddress,
      status: 'running',
      block_count: blockCount,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return (data as { id: string }).id
}

export async function completeExecution(
  executionId: string,
  result: {
    status: 'success' | 'failed' | 'cancelled'
    blockLogs?: unknown[]
    txIds?: string[]
    errorMessage?: string
    totalFeesMicroalgo?: number
    durationMs?: number
  },
): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb
    .from('executions')
    .update({
      status: result.status,
      completed_at: new Date().toISOString(),
      block_logs: result.blockLogs ?? [],
      tx_ids: result.txIds ?? [],
      error_message: result.errorMessage ?? null,
      total_fees_microalgo: result.totalFeesMicroalgo ?? 0,
      duration_ms: result.durationMs ?? 0,
    })
    .eq('id', executionId)

  if (error) throw new Error(error.message)
}

export async function listExecutions(
  walletAddress: string,
  workflowId?: string,
  limit = 50,
): Promise<ExecutionRow[]> {
  const sb = getSupabase()
  let query = sb
    .from('executions')
    .select('*')
    .eq('wallet_address', walletAddress)
    .order('started_at', { ascending: false })
    .limit(limit)

  if (workflowId) {
    query = query.eq('workflow_id', workflowId)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as ExecutionRow[]
}

export async function getDashboardStats(walletAddress: string) {
  const sb = getSupabase()

  const [wfResult, exResult] = await Promise.all([
    sb.from('workflows').select('id', { count: 'exact' }).eq('wallet_address', walletAddress),
    sb.from('executions').select('*').eq('wallet_address', walletAddress).order('started_at', { ascending: false }).limit(200),
  ])

  const normStatus = (s: string | undefined) => (s ?? '').toLowerCase().trim()

  const totalWorkflows = wfResult.count ?? 0
  const executions = (exResult.data ?? []) as ExecutionRow[]
  const totalExecutions = executions.length
  const successCount = executions.filter((e) => normStatus(e.status) === 'success').length
  const failedCount = executions.filter((e) => normStatus(e.status) === 'failed').length
  const successRate = totalExecutions > 0 ? Math.round((successCount / totalExecutions) * 100) : 0
  const totalFees = executions.reduce((sum, e) => sum + (e.total_fees_microalgo || 0), 0)

  const dailyMap = new Map<string, { success: number; failed: number; total: number }>()
  for (const ex of executions) {
    const day = ex.started_at.slice(0, 10)
    const entry = dailyMap.get(day) ?? { success: 0, failed: 0, total: 0 }
    entry.total++
    const st = normStatus(ex.status)
    if (st === 'success') entry.success++
    if (st === 'failed') entry.failed++
    dailyMap.set(day, entry)
  }
  const dailyData = Array.from(dailyMap.entries())
    .map(([date, counts]) => ({ date, ...counts }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30)

  return {
    totalWorkflows,
    totalExecutions,
    successCount,
    failedCount,
    successRate,
    totalFeesMicroalgo: totalFees,
    totalFeesAlgo: totalFees / 1_000_000,
    dailyData,
    recentExecutions: executions.slice(0, 10),
  }
}
