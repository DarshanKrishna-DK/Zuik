import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Records a headless workflow run into the existing `executions` table so the dashboard and
 * Telegram can show what the agent did and why (AI decisions, tx ids, fees). Mirrors the shape
 * the frontend writes (status / block_logs / tx_ids / total_fees_microalgo / duration_ms).
 *
 * Recording is best effort: a failed insert/update never breaks the run. When Supabase or the
 * workflow id is missing, the recorder is a no-op that still collects logs for console output.
 */

export interface BlockLogEntry {
  nodeId?: string
  blockId: string
  blockName?: string
  type: 'start' | 'success' | 'error' | 'skip' | 'waiting' | 'info'
  message: string
  /** Structured AI decision or other detail surfaced on the dashboard. */
  detail?: Record<string, unknown>
  at: string
}

export class ExecutionRecorder {
  private sb: SupabaseClient | null
  private workflowId: string | null
  private walletAddress: string
  private executionId: string | null = null
  private logs: BlockLogEntry[] = []
  private txIds: string[] = []
  private feesMicroAlgos = 0
  private blockCount: number
  private startedAt = Date.now()

  constructor(opts: {
    sb?: SupabaseClient | null
    workflowId?: string | null
    walletAddress: string
    blockCount: number
  }) {
    this.sb = opts.sb ?? null
    this.workflowId = opts.workflowId ?? null
    this.walletAddress = opts.walletAddress
    this.blockCount = opts.blockCount
  }

  /** Open an executions row (status running). No-op without Supabase + a real workflow id. */
  async start(): Promise<void> {
    if (!this.sb || !this.workflowId) return
    try {
      const { data, error } = await this.sb
        .from('executions')
        .insert({
          workflow_id: this.workflowId,
          wallet_address: this.walletAddress,
          status: 'running',
          block_count: this.blockCount,
        })
        .select('id')
        .single()
      if (!error && data) this.executionId = (data as { id: string }).id
    } catch {
      // best effort
    }
  }

  log(entry: Omit<BlockLogEntry, 'at'>): void {
    const full: BlockLogEntry = { ...entry, at: new Date().toISOString() }
    this.logs.push(full)
  }

  recordTx(txIds: string[], feesMicroAlgos = 0): void {
    for (const id of txIds) if (id) this.txIds.push(id)
    this.feesMicroAlgos += feesMicroAlgos
  }

  /** Finalize the executions row. status defaults to success when no error was logged. */
  async finish(status?: 'success' | 'failed' | 'cancelled', errorMessage?: string): Promise<void> {
    const hadError = this.logs.some((l) => l.type === 'error')
    const finalStatus = status ?? (hadError ? 'failed' : 'success')
    if (!this.sb || !this.executionId) return
    try {
      await this.sb
        .from('executions')
        .update({
          status: finalStatus,
          completed_at: new Date().toISOString(),
          block_logs: this.logs,
          tx_ids: this.txIds,
          error_message: errorMessage ?? null,
          total_fees_microalgo: this.feesMicroAlgos,
          duration_ms: Date.now() - this.startedAt,
        })
        .eq('id', this.executionId)
    } catch {
      // best effort
    }
  }

  getLogs(): BlockLogEntry[] {
    return this.logs
  }
}
