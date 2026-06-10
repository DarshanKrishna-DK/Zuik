/**
 * In-session message bus for agent-to-agent communication, negotiation, and consensus.
 * Persists cross-run events to agent_events when Supabase is available.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type AgentMessageType =
  | 'info'
  | 'proposal'
  | 'counter'
  | 'accept'
  | 'reject'
  | 'consensus_vote'
  | 'event'
  | 'branch_result'
  | 'negotiation_round'

export interface AgentMessage {
  id: string
  type: AgentMessageType
  fromAgentId: string
  toAgentId?: string | null
  topic: string
  payload: Record<string, unknown>
  timestamp: number
  workflowId?: string | null
  correlationId?: string | null
}

export interface ConsensusVote {
  agentId: string
  action: string
  amountAlgo?: number
  confidence: number
  reason: string
}

export interface NegotiationResult {
  resolved: boolean
  action: string
  amountAlgo: number
  confidence: number
  reason: string
  rounds: number
  votes: ConsensusVote[]
}

type MessageHandler = (message: AgentMessage) => void

export class AgentMessageBus {
  private readonly messages: AgentMessage[] = []
  private readonly subscribers = new Map<string, MessageHandler[]>()
  private readonly topicSubscribers = new Map<string, MessageHandler[]>()
  private readonly maxHistory = 500

  constructor(
    readonly sessionId: string,
    readonly workflowId?: string | null,
    private readonly sb?: SupabaseClient | null,
  ) {}

  async publish(
    message: Omit<AgentMessage, 'id' | 'timestamp'> & { id?: string; timestamp?: number },
  ): Promise<AgentMessage> {
    const full: AgentMessage = {
      id: message.id ?? `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      timestamp: message.timestamp ?? Date.now(),
      workflowId: message.workflowId ?? this.workflowId,
      fromAgentId: message.fromAgentId,
      toAgentId: message.toAgentId ?? null,
      type: message.type,
      topic: message.topic,
      payload: message.payload,
      correlationId: message.correlationId ?? null,
    }

    this.messages.push(full)
    if (this.messages.length > this.maxHistory) {
      this.messages.splice(0, this.messages.length - this.maxHistory)
    }

    const agentHandlers = this.subscribers.get(full.fromAgentId) ?? []
    const topicHandlers = this.topicSubscribers.get(full.topic) ?? []
    const broadcastHandlers = this.subscribers.get('*') ?? []

    for (const h of [...agentHandlers, ...topicHandlers, ...broadcastHandlers]) {
      try {
        h(full)
      } catch (e) {
        console.warn('[AgentMessageBus] handler error:', e instanceof Error ? e.message : e)
      }
    }

    if (full.toAgentId) {
      const targeted = this.subscribers.get(full.toAgentId) ?? []
      for (const h of targeted) {
        try {
          h(full)
        } catch {
          // best effort
        }
      }
    }

    if (this.sb && this.workflowId && full.type === 'event') {
      try {
        await this.sb.from('agent_events').insert({
          workflow_id: this.workflowId,
          event_name: full.topic,
          data: { ...full.payload, messageId: full.id, fromAgentId: full.fromAgentId },
        })
      } catch (e) {
        console.warn('[AgentMessageBus] agent_events insert failed:', e instanceof Error ? e.message : e)
      }
    }

    return full
  }

  subscribe(agentId: string, handler: MessageHandler): void {
    const list = this.subscribers.get(agentId) ?? []
    list.push(handler)
    this.subscribers.set(agentId, list)
  }

  subscribeTopic(topic: string, handler: MessageHandler): void {
    const list = this.topicSubscribers.get(topic) ?? []
    list.push(handler)
    this.topicSubscribers.set(topic, list)
  }

  getHistory(topic?: string, limit = 50): AgentMessage[] {
    let list = this.messages
    if (topic) list = list.filter((m) => m.topic === topic)
    return list.slice(-limit)
  }

  getMessagesForAgent(agentId: string, limit = 50): AgentMessage[] {
    return this.messages
      .filter((m) => m.fromAgentId === agentId || m.toAgentId === agentId)
      .slice(-limit)
  }

  async publishEvent(
    eventName: string,
    fromAgentId: string,
    data: Record<string, unknown>,
  ): Promise<AgentMessage> {
    return this.publish({
      type: 'event',
      fromAgentId,
      topic: eventName,
      payload: data,
    })
  }

  async publishBranchResult(
    fromAgentId: string,
    branchId: string,
    result: Record<string, unknown>,
    correlationId?: string,
  ): Promise<AgentMessage> {
    return this.publish({
      type: 'branch_result',
      fromAgentId,
      topic: 'branch_complete',
      correlationId,
      payload: { branchId, result },
    })
  }

  async publishVote(fromAgentId: string, vote: ConsensusVote, correlationId?: string): Promise<AgentMessage> {
    return this.publish({
      type: 'consensus_vote',
      fromAgentId,
      topic: 'consensus',
      correlationId,
      payload: vote as unknown as Record<string, unknown>,
    })
  }

  /**
   * Round-based negotiation: majority vote on action, highest-confidence wins ties.
   * Pay amounts use median of pay votes when action is pay.
   */
  negotiateConsensus(
    votes: ConsensusVote[],
    correlationId?: string,
  ): NegotiationResult {
    if (votes.length === 0) {
      return {
        resolved: false,
        action: 'hold',
        amountAlgo: 0,
        confidence: 0,
        reason: 'No votes received',
        rounds: 0,
        votes: [],
      }
    }

    const actionCounts = new Map<string, number>()
    for (const v of votes) {
      actionCounts.set(v.action, (actionCounts.get(v.action) ?? 0) + 1)
    }

    let winningAction = 'hold'
    let maxCount = 0
    for (const [action, count] of actionCounts) {
      if (count > maxCount) {
        maxCount = count
        winningAction = action
      }
    }

    const winningVotes = votes.filter((v) => v.action === winningAction)
    const avgConfidence =
      winningVotes.reduce((s, v) => s + v.confidence, 0) / winningVotes.length

    let amountAlgo = 0
    if (winningAction === 'pay') {
      const amounts = winningVotes
        .map((v) => v.amountAlgo ?? 0)
        .filter((a) => a > 0)
        .sort((a, b) => a - b)
      if (amounts.length > 0) {
        amountAlgo = amounts[Math.floor(amounts.length / 2)]
      }
    }

    const reasons = winningVotes.map((v) => v.reason).filter(Boolean)
    const reason =
      reasons.length > 0
        ? `Consensus ${winningAction} (${maxCount}/${votes.length}): ${reasons[0]}`
        : `Consensus ${winningAction} (${maxCount}/${votes.length} votes)`

    return {
      resolved: true,
      action: winningAction,
      amountAlgo,
      confidence: avgConfidence,
      reason,
      rounds: 1,
      votes,
    }
  }

  /**
   * Two-agent proposal/counter negotiation. Returns merged outcome or fallback vote.
   */
  negotiatePair(
    proposal: ConsensusVote,
    counter: ConsensusVote | null,
  ): NegotiationResult {
    if (!counter) {
      return {
        resolved: true,
        action: proposal.action,
        amountAlgo: proposal.amountAlgo ?? 0,
        confidence: proposal.confidence,
        reason: proposal.reason,
        rounds: 1,
        votes: [proposal],
      }
    }

    if (proposal.action === counter.action) {
      const amountAlgo =
        proposal.action === 'pay'
          ? Math.min(proposal.amountAlgo ?? 0, counter.amountAlgo ?? 0)
          : 0
      return {
        resolved: true,
        action: proposal.action,
        amountAlgo,
        confidence: (proposal.confidence + counter.confidence) / 2,
        reason: `Agents agreed on ${proposal.action}: ${proposal.reason}`,
        rounds: 2,
        votes: [proposal, counter],
      }
    }

    return this.negotiateConsensus([proposal, counter])
  }
}
