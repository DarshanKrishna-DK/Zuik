/**
 * Persistent agent memory with importance scoring and retrieval.
 * Stores observations, decisions, and reflections from AgentLoop cycles.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type MemoryType = 'observation' | 'decision' | 'reflection' | 'strategy'

export interface AgentMemoryRecord {
  id: string
  agent_address: string
  workflow_id: string | null
  memory_type: MemoryType
  content: Record<string, unknown>
  importance_score: number
  created_at: string
  expires_at: string | null
}

export interface MemoryQueryOptions {
  memoryTypes?: MemoryType[]
  minImportance?: number
  limit?: number
  workflowId?: string | null
  since?: Date
}

export interface CycleMemoryInput {
  observations: Record<string, unknown>
  decision: Record<string, unknown>
  result: Record<string, unknown>
  workflowId?: string | null
}

const DEFAULT_TTL_DAYS: Record<MemoryType, number | null> = {
  observation: 30,
  decision: 90,
  reflection: 180,
  strategy: null,
}

function expiresAtForType(type: MemoryType): string | null {
  const days = DEFAULT_TTL_DAYS[type]
  if (days == null) return null
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

/**
 * Score memory importance (0-1) from content signals: outcome, spend size, confidence swings.
 */
export function computeImportanceScore(
  memoryType: MemoryType,
  content: Record<string, unknown>,
): number {
  let score = 0.2

  if (memoryType === 'decision') {
    const action = String(content.action ?? '').toLowerCase()
    const amount = Number(content.amountAlgo ?? 0)
    const confidence = Number(content.confidence ?? 0)
    if (action === 'pay' && amount > 0) score += 0.35
    if (action === 'notify') score += 0.15
    score += Math.min(0.25, confidence * 0.25)
    if (content.clamped === true) score += 0.1
  }

  if (memoryType === 'reflection') {
    const outcome = String(content.outcome ?? '').toLowerCase()
    if (outcome === 'success' || outcome === 'failure') score += 0.3
    if (content.strategyAdjusted === true) score += 0.25
    const delta = Number(content.confidenceDelta ?? 0)
    score += Math.min(0.2, Math.abs(delta) * 0.4)
  }

  if (memoryType === 'observation') {
    if (content.guardianBlocked === true) score += 0.25
    if (content.marketPartial === true) score += 0.1
    const memCount = Number(content.relevantMemoryCount ?? 0)
    score += Math.min(0.15, memCount * 0.03)
  }

  if (memoryType === 'strategy') {
    score = 0.85
    if (content.version != null) score += 0.05
  }

  return Math.max(0, Math.min(1, score))
}

export class AgentMemory {
  constructor(
    private readonly sb: SupabaseClient | null,
    private readonly agentAddress: string,
    private readonly workflowId?: string | null,
  ) {}

  get enabled(): boolean {
    return Boolean(this.sb && this.agentAddress)
  }

  async record(
    memoryType: MemoryType,
    content: Record<string, unknown>,
    importanceScore?: number,
  ): Promise<AgentMemoryRecord | null> {
    if (!this.enabled) return null

    const score = importanceScore ?? computeImportanceScore(memoryType, content)
    const row = {
      agent_address: this.agentAddress,
      workflow_id: this.workflowId ?? null,
      memory_type: memoryType,
      content,
      importance_score: score,
      expires_at: expiresAtForType(memoryType),
    }

    const { data, error } = await this.sb!
      .from('agent_memories')
      .insert(row)
      .select('*')
      .single()

    if (error) {
      console.warn(`[AgentMemory] record failed: ${error.message}`)
      return null
    }
    return data as AgentMemoryRecord
  }

  async recordCycle(input: CycleMemoryInput): Promise<void> {
    await this.record('observation', {
      ...input.observations,
      cycleResult: input.result,
    })
    await this.record('decision', input.decision)
    if (input.result.reflection || input.result.outcome) {
      await this.record('reflection', {
        outcome: input.result.outcome,
        reflection: input.result.reflection,
        strategyAdjusted: input.result.strategyAdjusted,
        confidenceDelta: input.result.confidenceDelta,
        ...input.result,
      })
    }
  }

  async query(options: MemoryQueryOptions = {}): Promise<AgentMemoryRecord[]> {
    if (!this.enabled) return []

    const limit = options.limit ?? 20
    let q = this.sb!
      .from('agent_memories')
      .select('*')
      .eq('agent_address', this.agentAddress)
      .order('importance_score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)

    if (options.workflowId) {
      q = q.eq('workflow_id', options.workflowId)
    }
    if (options.memoryTypes?.length) {
      q = q.in('memory_type', options.memoryTypes)
    }
    if (typeof options.minImportance === 'number') {
      q = q.gte('importance_score', options.minImportance)
    }
    if (options.since) {
      q = q.gte('created_at', options.since.toISOString())
    }

    const { data, error } = await q
    if (error) {
      console.warn(`[AgentMemory] query failed: ${error.message}`)
      return []
    }
    return (data ?? []) as AgentMemoryRecord[]
  }

  async getRelevantContext(limit = 8): Promise<AgentMemoryRecord[]> {
    return this.query({
      memoryTypes: ['decision', 'reflection', 'strategy'],
      minImportance: 0.25,
      limit,
      workflowId: this.workflowId,
      since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    })
  }

  async recordStrategyUpdate(strategy: string, reason: string): Promise<void> {
    const prior = await this.query({ memoryTypes: ['strategy'], limit: 1 })
    const version = prior.length > 0 ? Number(prior[0].content.version ?? 0) + 1 : 1
    await this.record('strategy', {
      strategy,
      reason,
      version,
      previousStrategy: prior[0]?.content?.strategy ?? null,
    })
  }
}
