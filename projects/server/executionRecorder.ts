import type { SupabaseClient } from '@supabase/supabase-js'

// Writes headless runs to the executions table for the dashboard and Telegram.
// Best effort: a failed insert never stops the workflow.

export interface BlockLogEntry {
  nodeId?: string
  blockId: string
  blockName?: string
  type: 'start' | 'success' | 'error' | 'skip' | 'waiting' | 'info'
  message: string
  /** AI decision payload for the dashboard. */
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
