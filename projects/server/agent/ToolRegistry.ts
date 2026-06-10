// Groq function-calling tools the agent loop can invoke.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentExecutionContext } from '../agentSigner.js'
import { getAlgodClient } from '../algorand.js'
import type { GuardianContext } from '../guardianPolicy.js'
import { maxSpendableMicroAlgos } from '../guardianPolicy.js'
import { getMarketSnapshot, type MarketSnapshot } from '../marketSnapshot.js'
import { computeRiskScore } from '../tokenRisk.js'
import type { AgentMemory } from './AgentMemory.js'
import type { AgentMessageBus } from './AgentMessageBus.js'
import { fetchPremiumAlgoQuoteViaX402 } from '../marketSnapshot.js'

const MICRO = 1_000_000

export interface ToolCallResult {
  tool: string
  success: boolean
  data?: Record<string, unknown>
  error?: string
}

export interface AgentToolContext {
  agentAddress: string
  agent?: AgentExecutionContext | null
  guardian: GuardianContext
  market: MarketSnapshot
  agentBalanceMicroAlgos: bigint
  recipient?: string | null
  maxAmountAlgo?: number | null
  userStrategy: string
  workflowId?: string | null
  sb?: SupabaseClient | null
  memory?: AgentMemory
  messageBus?: AgentMessageBus
  agentId?: string
  ceilingAlgo: number
}

export interface AgentTool {
  name: string
  description: string
  parameters: Record<string, unknown>
  handler: (args: Record<string, unknown>, ctx: AgentToolContext) => Promise<ToolCallResult>
}

function microToAlgo(micro: bigint): number {
  return Number(micro) / MICRO
}

async function getPortfolio(ctx: AgentToolContext): Promise<ToolCallResult> {
  try {
    const acct = await getAlgodClient().accountInformation(ctx.agentAddress).do()
    const assets = (acct.assets ?? []).map((a: { assetId?: bigint | number; amount?: bigint | number }) => ({
      assetId: Number(a.assetId ?? 0),
      amount: String(a.amount ?? 0),
    }))
    return {
      tool: 'check_portfolio',
      success: true,
      data: {
        balanceMicroAlgos: String(acct.amount ?? 0),
        balanceAlgo: microToAlgo(BigInt(acct.amount ?? 0)),
        assets,
        minBalance: String(acct.minBalance ?? 0),
      },
    }
  } catch (e) {
    return {
      tool: 'check_portfolio',
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

async function getMarketData(
  args: Record<string, unknown>,
  ctx: AgentToolContext,
): Promise<ToolCallResult> {
  const assetId = Number(args.assetId ?? 0)
  try {
    const snapshot = assetId === 0 && ctx.market
      ? ctx.market
      : await getMarketSnapshot(assetId, ctx.agent ?? undefined)
    return {
      tool: 'get_market_data',
      success: true,
      data: {
        assetId,
        algoUsd: snapshot.algoUsd,
        algoChange24h: snapshot.algoChange24h,
        asset: snapshot.asset ?? null,
        sources: snapshot.sources,
        takenAt: snapshot.takenAt,
      },
    }
  } catch (e) {
    return {
      tool: 'get_market_data',
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

async function analyzeRisk(
  args: Record<string, unknown>,
  ctx: AgentToolContext,
): Promise<ToolCallResult> {
  const assetId = Number(args.assetId ?? 0)
  if (!Number.isFinite(assetId) || assetId < 0) {
    return { tool: 'analyze_risk', success: false, error: 'Invalid assetId' }
  }
  try {
    const risk = await computeRiskScore(assetId)
    return {
      tool: 'analyze_risk',
      success: true,
      data: {
        assetId,
        score: risk.score,
        band: risk.band,
        reasons: risk.reasons,
        guardianBlocked: ctx.guardian.blocked,
        maxSpendableAlgo: ctx.ceilingAlgo,
      },
    }
  } catch (e) {
    return {
      tool: 'analyze_risk',
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

async function executeTrade(
  args: Record<string, unknown>,
  ctx: AgentToolContext,
): Promise<ToolCallResult> {
  const amountAlgo = Number(args.amountAlgo ?? 0)
  const recipient = String(args.recipient ?? ctx.recipient ?? '').trim() || null
  const reason = String(args.reason ?? 'Tool-proposed trade').slice(0, 400)

  if (!recipient) {
    return { tool: 'execute_trade', success: false, error: 'No recipient available' }
  }
  if (ctx.guardian.blocked) {
    return {
      tool: 'execute_trade',
      success: false,
      error: ctx.guardian.blockReason ?? 'Guardian blocked',
    }
  }
  const clamped = Math.max(0, Math.min(amountAlgo, ctx.ceilingAlgo))
  return {
    tool: 'execute_trade',
    success: true,
    data: {
      proposed: true,
      action: 'pay',
      amountAlgo: clamped,
      recipient,
      reason,
      clamped: clamped < amountAlgo,
      note: 'Advisory proposal only; Guardian enforces on submit',
    },
  }
}

async function sendNotification(
  args: Record<string, unknown>,
  _ctx: AgentToolContext,
): Promise<ToolCallResult> {
  const message = String(args.message ?? '').trim()
  if (!message) {
    return { tool: 'send_notification', success: false, error: 'Message required' }
  }
  return {
    tool: 'send_notification',
    success: true,
    data: {
      queued: true,
      message: message.slice(0, 500),
      action: 'notify',
    },
  }
}

async function queryHistory(
  args: Record<string, unknown>,
  ctx: AgentToolContext,
): Promise<ToolCallResult> {
  if (!ctx.memory?.enabled) {
    return {
      tool: 'query_history',
      success: true,
      data: { memories: [], note: 'Memory store unavailable' },
    }
  }
  const limit = Math.min(50, Math.max(1, Number(args.limit ?? 10)))
  const memoryTypes = args.memoryTypes as string[] | undefined
  const memories = await ctx.memory.query({
    limit,
    memoryTypes: memoryTypes?.length
      ? memoryTypes as ('observation' | 'decision' | 'reflection' | 'strategy')[]
      : ['decision', 'reflection'],
    workflowId: ctx.workflowId,
  })
  return {
    tool: 'query_history',
    success: true,
    data: {
      count: memories.length,
      memories: memories.map((m) => ({
        type: m.memory_type,
        importance: m.importance_score,
        createdAt: m.created_at,
        content: m.content,
      })),
    },
  }
}

async function spawnSubtask(
  args: Record<string, unknown>,
  ctx: AgentToolContext,
): Promise<ToolCallResult> {
  const goal = String(args.goal ?? '').trim()
  if (!goal) {
    return { tool: 'spawn_subtask', success: false, error: 'goal required' }
  }
  const subtaskId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  if (ctx.memory?.enabled) {
    await ctx.memory.record('observation', {
      subtaskId,
      goal,
      spawnedAt: new Date().toISOString(),
      status: 'spawned',
    })
  }
  if (ctx.messageBus) {
    await ctx.messageBus.publish({
      type: 'proposal',
      fromAgentId: ctx.agentId ?? ctx.agentAddress,
      topic: 'subtask_spawn',
      payload: { subtaskId, goal },
    })
  }
  return {
    tool: 'spawn_subtask',
    success: true,
    data: {
      subtaskId,
      goal,
      status: 'spawned',
      broadcasted: Boolean(ctx.messageBus),
    },
  }
}

async function sendAgentMessage(
  args: Record<string, unknown>,
  ctx: AgentToolContext,
): Promise<ToolCallResult> {
  if (!ctx.messageBus) {
    return { tool: 'send_agent_message', success: false, error: 'No message bus in this session' }
  }
  const toAgentId = args.toAgentId != null ? String(args.toAgentId) : null
  const topic = String(args.topic ?? 'agent_message').trim()
  const message = String(args.message ?? '').trim()
  if (!message) {
    return { tool: 'send_agent_message', success: false, error: 'message required' }
  }
  const msgType = String(args.type ?? 'info')
  const validTypes = ['info', 'proposal', 'counter', 'accept', 'reject'] as const
  const type = validTypes.includes(msgType as typeof validTypes[number])
    ? (msgType as typeof validTypes[number])
    : 'info'

  const published = await ctx.messageBus.publish({
    type,
    fromAgentId: ctx.agentId ?? ctx.agentAddress,
    toAgentId,
    topic,
    payload: { message, ...((args.payload as Record<string, unknown>) ?? {}) },
  })
  return {
    tool: 'send_agent_message',
    success: true,
    data: { messageId: published.id, topic, toAgentId },
  }
}

async function purchasePremiumData(
  args: Record<string, unknown>,
  ctx: AgentToolContext,
): Promise<ToolCallResult> {
  if (!ctx.agent) {
    return { tool: 'purchase_premium_data', success: false, error: 'Agent signing context required' }
  }
  if (process.env.X402_DISABLE === '1') {
    return { tool: 'purchase_premium_data', success: false, error: 'x402 payments disabled' }
  }
  const coinId = String(args.coinId ?? 'algorand')
  try {
    const paid = await fetchPremiumAlgoQuoteViaX402(ctx.agent, coinId)
    if (!paid?.quote.priceUsd) {
      return { tool: 'purchase_premium_data', success: false, error: 'Premium quote unavailable' }
    }
    if (ctx.messageBus) {
      await ctx.messageBus.publishEvent(
        ctx.agentId ?? ctx.agentAddress,
        'x402_premium_purchase',
        {
          coinId,
          priceUsd: paid.quote.priceUsd,
          paymentTxId: paid.paymentTxId ?? null,
        },
      )
    }
    return {
      tool: 'purchase_premium_data',
      success: true,
      data: {
        coinId,
        priceUsd: paid.quote.priceUsd,
        marketCapUsd: paid.quote.marketCapUsd ?? null,
        volume24hUsd: paid.quote.volume24hUsd ?? null,
        paymentTxId: paid.paymentTxId ?? null,
        source: 'x402-premium',
      },
    }
  } catch (e) {
    return {
      tool: 'purchase_premium_data',
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

const BUILTIN_TOOLS: AgentTool[] = [
  {
    name: 'check_portfolio',
    description: 'Get current ALGO balance and ASA holdings for the agent wallet.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: (_args, ctx) => getPortfolio(ctx),
  },
  {
    name: 'get_market_data',
    description: 'Fetch live ALGO or ASA market data (price, volume, liquidity).',
    parameters: {
      type: 'object',
      properties: {
        assetId: { type: 'integer', description: 'ASA id; 0 for native ALGO' },
      },
      required: [],
    },
    handler: getMarketData,
  },
  {
    name: 'analyze_risk',
    description: 'Run the Zuik token risk rubric (0-100) for an ASA.',
    parameters: {
      type: 'object',
      properties: {
        assetId: { type: 'integer', description: 'ASA id to analyze' },
      },
      required: ['assetId'],
    },
    handler: analyzeRisk,
  },
  {
    name: 'execute_trade',
    description:
      'Propose a Guardian-bounded ALGO payment. Does not submit on-chain; returns a clamped proposal.',
    parameters: {
      type: 'object',
      properties: {
        amountAlgo: { type: 'number', description: 'Whole ALGO to send' },
        recipient: { type: 'string', description: 'Algorand address' },
        reason: { type: 'string', description: 'Short justification' },
      },
      required: ['amountAlgo', 'reason'],
    },
    handler: executeTrade,
  },
  {
    name: 'send_notification',
    description: 'Queue a user notification about agent reasoning or alerts.',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Notification text' },
      },
      required: ['message'],
    },
    handler: sendNotification,
  },
  {
    name: 'query_history',
    description: 'Retrieve past agent decisions and reflections from persistent memory.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Max records (default 10)' },
        memoryTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter: decision, reflection, strategy, observation',
        },
      },
      required: [],
    },
    handler: queryHistory,
  },
  {
    name: 'spawn_subtask',
    description: 'Record a focused sub-goal for hierarchical agent work.',
    parameters: {
      type: 'object',
      properties: {
        goal: { type: 'string', description: 'Subtask objective' },
      },
      required: ['goal'],
    },
    handler: spawnSubtask,
  },
  {
    name: 'send_agent_message',
    description: 'Send a message to another agent on the coordination bus (negotiation, proposals).',
    parameters: {
      type: 'object',
      properties: {
        toAgentId: { type: 'string', description: 'Target agent id, or omit to broadcast' },
        topic: { type: 'string', description: 'Message topic' },
        message: { type: 'string', description: 'Message text' },
        type: { type: 'string', description: 'info, proposal, counter, accept, reject' },
      },
      required: ['message'],
    },
    handler: sendAgentMessage,
  },
  {
    name: 'purchase_premium_data',
    description:
      'Autonomously purchase premium market data via x402 (Guardian-bounded ALGO payment).',
    parameters: {
      type: 'object',
      properties: {
        coinId: { type: 'string', description: 'CoinGecko id, default algorand' },
      },
      required: [],
    },
    handler: purchasePremiumData,
  },
]

export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>()

  constructor(extraTools: AgentTool[] = []) {
    for (const t of BUILTIN_TOOLS) this.tools.set(t.name, t)
    for (const t of extraTools) this.tools.set(t.name, t)
  }

  list(): AgentTool[] {
    return [...this.tools.values()]
  }

  getGroqTools(): { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }[] {
    return this.list().map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }))
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    ctx: AgentToolContext,
  ): Promise<ToolCallResult> {
    const tool = this.tools.get(name)
    if (!tool) {
      return { tool: name, success: false, error: `Unknown tool: ${name}` }
    }
    try {
      return await tool.handler(args, ctx)
    } catch (e) {
      return {
        tool: name,
        success: false,
        error: e instanceof Error ? e.message : String(e),
      }
    }
  }

  async executeMany(
    calls: { name: string; arguments: Record<string, unknown> }[],
    ctx: AgentToolContext,
  ): Promise<ToolCallResult[]> {
    const results: ToolCallResult[] = []
    for (const call of calls) {
      results.push(await this.execute(call.name, call.arguments, ctx))
    }
    return results
  }

  /** Build tool context snapshot for perceive phase. */
  static buildToolContext(
    base: Omit<AgentToolContext, 'ceilingAlgo'>,
    ceilingAlgo: number,
  ): AgentToolContext {
    return { ...base, ceilingAlgo }
  }

  /** Guardian spendable headroom in whole ALGO. */
  static computeCeilingAlgo(
    guardian: GuardianContext,
    agentBalanceMicroAlgos: bigint,
    maxAmountAlgo?: number | null,
  ): number {
    const guardianMicro = maxSpendableMicroAlgos(guardian)
    const FEE_BUFFER = 10_000n
    const balanceMicro = agentBalanceMicroAlgos > FEE_BUFFER
      ? agentBalanceMicroAlgos - FEE_BUFFER
      : 0n
    let ceilingMicro = guardianMicro < balanceMicro ? guardianMicro : balanceMicro
    if (ceilingMicro < 0n) ceilingMicro = 0n
    let ceilingAlgo = microToAlgo(ceilingMicro)
    if (typeof maxAmountAlgo === 'number' && maxAmountAlgo > 0) {
      ceilingAlgo = Math.min(ceilingAlgo, maxAmountAlgo)
    }
    return ceilingAlgo
  }
}
