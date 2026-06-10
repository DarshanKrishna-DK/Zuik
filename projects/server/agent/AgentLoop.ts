// Bounded perceive-reason-act loop with tool use (replaces one-shot Groq calls).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentExecutionContext } from '../agentSigner.js'
import type { AgentDecision, AgentDecisionContext, AgentAction, RawDecision } from '../aiAgent.js'
import { AgentMemory } from './AgentMemory.js'
import type { AgentMessageBus } from './AgentMessageBus.js'
import { ToolRegistry, type AgentToolContext, type ToolCallResult } from './ToolRegistry.js'

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? ''
const GROQ_MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MAX_ITERATIONS = Number(process.env.AGENT_LOOP_MAX_ITERATIONS ?? 4)

export interface AgentLoopOptions {
  maxIterations?: number
  tools?: ToolRegistry
}

export interface AgentLoopRunContext {
  decisionContext: AgentDecisionContext
  agent?: AgentExecutionContext | null
  sb?: SupabaseClient | null
  workflowId?: string | null
  /** Set when running inside a multi-agent fork/join session. */
  messageBus?: AgentMessageBus | null
  agentId?: string | null
}

interface GroqMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_calls?: {
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }[]
  tool_call_id?: string
}

interface LoopState {
  observations: Record<string, unknown>
  toolResults: ToolCallResult[]
  messages: GroqMessage[]
  iterations: number
  proposedTrade: RawDecision | null
  notifyMessage: string | null
}

export class AgentLoop {
  private readonly tools: ToolRegistry
  private readonly maxIterations: number

  constructor(options: AgentLoopOptions = {}) {
    this.tools = options.tools ?? new ToolRegistry()
    this.maxIterations = options.maxIterations ?? MAX_ITERATIONS
  }

  async run(ctx: AgentLoopRunContext): Promise<AgentDecision> {
    const dc = ctx.decisionContext
    const ceilingAlgo = ToolRegistry.computeCeilingAlgo(
      dc.guardian,
      dc.agentBalanceMicroAlgos,
      dc.maxAmountAlgo,
    )

    const shortCircuit = this.shortCircuitDecision(dc, ceilingAlgo)
    if (shortCircuit) return shortCircuit

    if (!GROQ_API_KEY) {
      return this.fallbackHold(dc, 'GROQ_API_KEY not configured on the server; holding by default')
    }

    const agentAddress = dc.agentAddress ?? ctx.agent?.agentAddress ?? ''
    const memory = agentAddress
      ? new AgentMemory(ctx.sb ?? null, agentAddress, ctx.workflowId ?? dc.workflowId)
      : null

    const toolCtx = ToolRegistry.buildToolContext({
      agentAddress,
      agent: ctx.agent,
      guardian: dc.guardian,
      market: dc.market,
      agentBalanceMicroAlgos: dc.agentBalanceMicroAlgos,
      recipient: dc.recipient,
      maxAmountAlgo: dc.maxAmountAlgo,
      userStrategy: dc.userStrategy,
      workflowId: ctx.workflowId ?? dc.workflowId,
      sb: ctx.sb,
      memory: memory ?? undefined,
      messageBus: ctx.messageBus ?? undefined,
      agentId: ctx.agentId ?? agentAddress,
    }, ceilingAlgo)

    const state: LoopState = {
      observations: {},
      toolResults: [],
      messages: this.buildInitialMessages(dc, ceilingAlgo, {
        agentId: ctx.agentId,
        hasMessageBus: Boolean(ctx.messageBus),
      }),
      iterations: 0,
      proposedTrade: null,
      notifyMessage: null,
    }

    while (state.iterations < this.maxIterations) {
      state.iterations += 1

      if (state.iterations === 1) {
        state.observations = await this.perceive(toolCtx, memory)
        state.messages.push({
          role: 'user',
          content: `Initial observations:\n${JSON.stringify(state.observations, null, 2)}`,
        })
      }

      const response = await this.reason(state.messages)
      if (!response) {
        return this.fallbackHold(dc, 'Empty Groq response during agent loop; holding')
      }

      const assistantMsg = response.message
      state.messages.push(assistantMsg)

      if (assistantMsg.tool_calls?.length) {
        const actResult = await this.act(assistantMsg.tool_calls, toolCtx, state)
        for (const tr of actResult.toolResults) {
          state.messages.push({
            role: 'tool',
            tool_call_id: tr.toolCallId,
            content: JSON.stringify(tr.result),
          })
        }
        continue
      }

      const parsed = this.parseFinalDecision(assistantMsg.content)
      if (parsed) {
        const decision = this.applyGuardrails(parsed, dc, ceilingAlgo, 'groq', state.iterations)
        await this.reflect(memory, state, decision, toolCtx)
        return decision
      }

      if (state.proposedTrade) {
        const decision = this.applyGuardrails(state.proposedTrade, dc, ceilingAlgo, 'groq', state.iterations)
        await this.reflect(memory, state, decision, toolCtx)
        return decision
      }

      if (state.notifyMessage) {
        const decision: AgentDecision = {
          action: 'notify',
          amountAlgo: 0,
          recipient: dc.recipient ?? null,
          reason: state.notifyMessage,
          confidence: 0.6,
          clamped: false,
          source: 'groq',
        }
        await this.reflect(memory, state, decision, toolCtx)
        return decision
      }
    }

    const decision = this.fallbackHold(
      dc,
      `Agent loop reached max iterations (${this.maxIterations}); holding`,
    )
    await this.reflect(memory, state, decision, toolCtx)
    return decision
  }

  private shortCircuitDecision(ctx: AgentDecisionContext, ceilingAlgo: number): AgentDecision | null {
    if (ctx.guardian.blocked || ceilingAlgo <= 0 || !ctx.recipient) {
      const reason = ctx.guardian.blocked
        ? `Guardian blocked: ${ctx.guardian.blockReason ?? 'limit reached'}`
        : !ctx.recipient
          ? 'No recipient configured; cannot pay'
          : 'No spendable headroom this run'
      return {
        action: ctx.guardian.blocked ? 'notify' : 'hold',
        amountAlgo: 0,
        recipient: ctx.recipient ?? null,
        reason,
        confidence: 1,
        clamped: false,
        source: 'fallback',
      }
    }
    return null
  }

  private async perceive(
    toolCtx: AgentToolContext,
    memory: AgentMemory | null,
  ): Promise<Record<string, unknown>> {
    const portfolio = await this.tools.execute('check_portfolio', {}, toolCtx)
    const market = await this.tools.execute('get_market_data', { assetId: 0 }, toolCtx)
    const memories = memory?.enabled ? await memory.getRelevantContext(6) : []

    return {
      portfolio: portfolio.data ?? portfolio.error,
      market: market.data ?? market.error,
      guardianBlocked: toolCtx.guardian.blocked,
      guardianBlockReason: toolCtx.guardian.blockReason ?? null,
      maxSpendableAlgo: toolCtx.ceilingAlgo,
      recipient: toolCtx.recipient ?? null,
      relevantMemoryCount: memories.length,
      relevantMemories: memories.map((m) => ({
        type: m.memory_type,
        importance: m.importance_score,
        summary: this.summarizeMemory(m.content),
        createdAt: m.created_at,
      })),
      marketPartial: toolCtx.market.algoUsd == null,
    }
  }

  private summarizeMemory(content: Record<string, unknown>): string {
    const action = content.action ? String(content.action) : ''
    const reason = content.reason ? String(content.reason).slice(0, 120) : ''
    const reflection = content.reflection ? String(content.reflection).slice(0, 120) : ''
    return [action, reason, reflection].filter(Boolean).join(' - ')
  }

  private buildInitialMessages(
    ctx: AgentDecisionContext,
    ceilingAlgo: number,
    multiAgent?: { agentId?: string | null; hasMessageBus?: boolean },
  ): GroqMessage[] {
    const lines = [
      'You are Zuik\'s autonomous Algorand agent with a perceive-reason-act loop.',
      'Use tools to gather portfolio, market, risk, and history data before deciding.',
      'When ready, respond with ONLY valid JSON (no markdown):',
      '{ "action": "pay"|"hold"|"notify", "amountAlgo": number, "recipient": string|null, "reason": string, "confidence": number }',
      '',
      'Rules:',
      '- Prefer tools before finalizing. amountAlgo must be <= maxSpendableAlgo.',
      '- "pay" only with a valid recipient. Guardian enforces all spends on-chain.',
      '- Learn from query_history: avoid repeating failed patterns.',
      `- maxSpendableAlgo this run: ${ceilingAlgo.toFixed(6)}`,
      `- User strategy: ${ctx.userStrategy || '(none)'}`,
    ]
    if (multiAgent?.hasMessageBus) {
      lines.push(
        '- Multi-agent session: use send_agent_message to coordinate with peer branch agents.',
        '- Use purchase_premium_data for richer market data (x402, Guardian-bounded).',
      )
      if (multiAgent.agentId) {
        lines.push(`- Your agent id in this session: ${multiAgent.agentId}`)
      }
    }
    return [{ role: 'system', content: lines.join('\n') }]
  }

  private async reason(messages: GroqMessage[]): Promise<{
    message: GroqMessage
  } | null> {
    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages,
          tools: this.tools.getGroqTools(),
          tool_choice: 'auto',
          temperature: 0.15,
          max_tokens: 1024,
        }),
      })

      if (!res.ok) {
        const detail = (await res.text()).slice(0, 200)
        throw new Error(`Groq ${res.status}: ${detail}`)
      }

      const data = (await res.json()) as {
        choices?: { message?: GroqMessage }[]
      }
      const message = data.choices?.[0]?.message
      if (!message) return null
      return { message }
    } catch (e) {
      throw e
    }
  }

  private async act(
    toolCalls: NonNullable<GroqMessage['tool_calls']>,
    toolCtx: AgentToolContext,
    state: LoopState,
  ): Promise<{ toolResults: { toolCallId: string; result: ToolCallResult }[] }> {
    const toolResults: { toolCallId: string; result: ToolCallResult }[] = []

    for (const call of toolCalls) {
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(call.function.arguments) as Record<string, unknown>
      } catch {
        args = {}
      }
      const result = await this.tools.execute(call.function.name, args, toolCtx)
      state.toolResults.push(result)
      toolResults.push({ toolCallId: call.id, result })

      if (call.function.name === 'execute_trade' && result.success && result.data) {
        state.proposedTrade = {
          action: 'pay',
          amountAlgo: Number(result.data.amountAlgo ?? 0),
          recipient: result.data.recipient != null ? String(result.data.recipient) : undefined,
          reason: result.data.reason != null ? String(result.data.reason) : undefined,
          confidence: 0.75,
        }
      }
      if (call.function.name === 'send_notification' && result.success && result.data?.message) {
        state.notifyMessage = String(result.data.message)
      }
    }

    return { toolResults }
  }

  private parseFinalDecision(content: string | null | undefined): RawDecision | null {
    if (!content?.trim()) return null
    try {
      const trimmed = content.trim()
      const jsonStart = trimmed.indexOf('{')
      const jsonStr = jsonStart >= 0 ? trimmed.slice(jsonStart) : trimmed
      return JSON.parse(jsonStr) as RawDecision
    } catch {
      return null
    }
  }

  private applyGuardrails(
    raw: RawDecision,
    ctx: AgentDecisionContext,
    ceilingAlgo: number,
    source: 'groq' | 'fallback',
    loopIterations: number,
  ): AgentDecision {
    const rawAction = String(raw.action ?? 'hold').toLowerCase()
    let action: AgentAction = rawAction === 'pay' || rawAction === 'notify' ? rawAction : 'hold'
    const reason = String(raw.reason ?? 'No reason provided').slice(0, 400)
    const confidence = this.parseConfidence(raw.confidence)

    let amountAlgo = 0
    let clamped = false
    const recipient = ctx.recipient ?? null

    if (action === 'pay') {
      if (ctx.guardian.blocked) {
        action = 'notify'
        clamped = true
        return {
          action,
          amountAlgo: 0,
          recipient,
          reason: `${reason} [blocked by Guardian: ${ctx.guardian.blockReason ?? 'limit reached'}]`,
          confidence,
          clamped,
          source,
          loopIterations,
        }
      }
      if (!recipient) {
        action = 'hold'
        clamped = true
      } else {
        const proposed = this.parseAmount(raw.amountAlgo)
        amountAlgo = Math.max(0, Math.min(proposed, ceilingAlgo))
        if (amountAlgo < proposed) clamped = true
        if (amountAlgo <= 0) {
          action = 'hold'
          clamped = true
          amountAlgo = 0
        }
      }
    }

    return {
      action,
      amountAlgo,
      recipient,
      reason,
      confidence,
      clamped,
      source,
      loopIterations,
    }
  }

  private parseAmount(raw: number | string | undefined): number {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0
    if (typeof raw === 'string') {
      const n = parseFloat(raw)
      return Number.isFinite(n) ? n : 0
    }
    return 0
  }

  private parseConfidence(raw: number | string | undefined): number {
    const n = this.parseAmount(raw)
    if (n <= 0) return 0
    if (n >= 1) return 1
    return n
  }

  private fallbackHold(ctx: AgentDecisionContext, reason: string): AgentDecision {
    return {
      action: 'hold',
      amountAlgo: 0,
      recipient: ctx.recipient ?? null,
      reason,
      confidence: 0,
      clamped: false,
      source: 'fallback',
    }
  }

  private async reflect(
    memory: AgentMemory | null,
    state: LoopState,
    decision: AgentDecision,
    toolCtx: AgentToolContext,
  ): Promise<void> {
    if (!memory?.enabled) return

    const priorDecisions = await memory.query({
      memoryTypes: ['decision'],
      limit: 3,
      workflowId: toolCtx.workflowId,
    })
    const lastAction = priorDecisions[0]?.content?.action
    const strategyAdjusted =
      lastAction != null &&
      String(lastAction) !== decision.action &&
      decision.action === 'hold' &&
      String(lastAction) === 'pay'

    const reflection = {
      outcome: decision.action === 'pay' && decision.amountAlgo > 0 ? 'proposed_pay' : decision.action,
      reflection: decision.reason,
      strategyAdjusted,
      confidenceDelta: decision.confidence - Number(priorDecisions[0]?.content?.confidence ?? 0),
      toolCallCount: state.toolResults.length,
      iterations: state.iterations,
    }

    await memory.recordCycle({
      observations: state.observations,
      decision: {
        action: decision.action,
        amountAlgo: decision.amountAlgo,
        reason: decision.reason,
        confidence: decision.confidence,
        clamped: decision.clamped,
        source: decision.source,
        loopIterations: decision.loopIterations,
      },
      result: reflection,
      workflowId: toolCtx.workflowId,
    })

    if (strategyAdjusted && toolCtx.userStrategy) {
      await memory.recordStrategyUpdate(
        toolCtx.userStrategy,
        `Shifted from ${lastAction} to ${decision.action}: ${decision.reason}`,
      )
    }
  }
}
