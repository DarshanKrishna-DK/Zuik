import 'dotenv/config'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendAuthorizedPayment } from './guardianExecutor.js'
import type { AgentExecutionContext } from './agentSigner.js'
import { getAlgodClient, getAssetDecimals } from './algorand.js'
import { readGuardianContext } from './guardianPolicy.js'
import { checkWorkflowBlockRisk } from './tokenRiskPolicy.js'
import { fetchPremiumAlgoQuoteViaX402, getMarketSnapshot } from './marketSnapshot.js'
import { makeAgentDecision } from './aiAgent.js'
import { ExecutionRecorder } from './executionRecorder.js'
import { runMultiAgentHeadless, flowHasMultiAgentBlocks } from './multiAgentRunner.js'

export interface FlowNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: { blockId: string; config: Record<string, string | number>; label?: string }
}

export interface FlowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

export type LinkedChatResolver = (walletAddress: string) => Promise<string[]>

/** Shared per-run state and dependencies passed to every block executor. */
export interface RunContext {
  vars: Record<string, unknown>
  walletAddress: string
  workflowId?: string | null
  agentContext?: AgentExecutionContext | null
  resolveLinkedChats?: LinkedChatResolver
  recorder: ExecutionRecorder
  sb?: SupabaseClient | null
}

const priceCache = new Map<string, { price: number; ts: number }>()
const PRICE_CACHE_TTL = 30_000

export async function fetchPrice(coinId: string): Promise<number> {
  const cached = priceCache.get(coinId)
  if (cached && Date.now() - cached.ts < PRICE_CACHE_TTL) return cached.price

  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`)
    if (res.ok) {
      const data = await res.json() as Record<string, { usd?: number }>
      const price = data[coinId]?.usd
      if (typeof price === 'number') {
        priceCache.set(coinId, { price, ts: Date.now() })
        return price
      }
    }
  } catch (e) {
    console.warn(`[Agent] Price fetch failed for ${coinId}:`, e)
  }
  return cached?.price ?? 0
}

const OPERATORS: Record<string, (a: number, b: number) => boolean> = {
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
  '==': (a, b) => a === b,
  '!=': (a, b) => a !== b,
}

function evaluateCondition(value: number, operator: string, threshold: number): boolean {
  const fn = OPERATORS[operator]
  if (!fn) {
    console.warn(`[Agent] Unknown operator: ${operator}`)
    return false
  }
  return fn(value, threshold)
}

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? ''

export async function sendTelegram(chatId: string, message: string): Promise<boolean> {
  if (!TELEGRAM_TOKEN) { console.warn('[Agent] No TELEGRAM_BOT_TOKEN'); return false }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
    })
    return res.ok
  } catch (e) {
    console.error('[Agent] Telegram send failed:', e)
    return false
  }
}

async function sendDiscord(webhookUrl: string, message: string): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    })
    return res.ok
  } catch (e) {
    console.error('[Agent] Discord send failed:', e)
    return false
  }
}

function topoSort(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const graph = new Map<string, string[]>()
  const inDegree = new Map<string, number>()

  for (const n of nodes) {
    graph.set(n.id, [])
    inDegree.set(n.id, 0)
  }
  for (const e of edges) {
    graph.get(e.source)?.push(e.target)
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1)
  }

  const queue = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0)
  const sorted: FlowNode[] = []

  while (queue.length > 0) {
    const node = queue.shift()!
    sorted.push(node)
    for (const neighbor of graph.get(node.id) ?? []) {
      const deg = (inDegree.get(neighbor) ?? 1) - 1
      inDegree.set(neighbor, deg)
      if (deg === 0) {
        const n = nodes.find((nd) => nd.id === neighbor)
        if (n) queue.push(n)
      }
    }
  }
  return sorted
}

/**
 * Resolve the agent sub-account spendable balance (microAlgos) for the AI decision context.
 */
async function getAgentBalanceMicroAlgos(agentAddress: string): Promise<bigint> {
  try {
    const acct = await getAlgodClient().accountInformation(agentAddress).do()
    return BigInt(acct.amount ?? 0)
  } catch {
    return 0n
  }
}

/**
 * Execute the AI decision block: read Guardian limits + market, make ONE Groq decision, and
 * (only when the decision is "pay") route the spend through sendAuthorizedPayment so the Guardian
 * app is still the hard limit. Returns a control signal: 'continue' or 'stop'.
 */
async function executeAiAgentBlock(
  config: Record<string, string | number>,
  ctx: RunContext,
  nodeId: string,
): Promise<'continue' | 'stop'> {
  const recorder = ctx.recorder
  const agent = ctx.agentContext
  const strategy = String(config.strategy ?? config.userStrategy ?? '').trim()
  const configuredRecipient = String(config.recipient ?? '').trim() || null
  const maxAmountRaw = config.maxAmount ?? config.maxAmountAlgo
  const maxAmountAlgo = maxAmountRaw != null && Number.isFinite(Number(maxAmountRaw))
    ? Number(maxAmountRaw)
    : null

  if (!agent) {
    recorder.log({
      nodeId,
      blockId: 'ai-agent',
      type: 'skip',
      message: 'No agent sub-account registered for this workflow; AI agent cannot act',
    })
    console.log('  [ai-agent] Skipped (no agent sub-account)')
    return 'continue'
  }

  const guardian = await readGuardianContext(agent.guardianAppId, agent.agentAddress)
  const market = await getMarketSnapshot(0, agent)
  const agentBalanceMicroAlgos = await getAgentBalanceMicroAlgos(agent.agentAddress)

  const decision = await makeAgentDecision(
    {
      userStrategy: strategy,
      agentBalanceMicroAlgos,
      market,
      guardian,
      recipient: configuredRecipient,
      maxAmountAlgo,
      agentAddress: agent.agentAddress,
      workflowId: ctx.workflowId ?? null,
      supabase: ctx.sb ?? null,
    },
    { agent, workflowId: ctx.workflowId ?? null },
  )

  recorder.log({
    nodeId,
    blockId: 'ai-agent',
    type: 'info',
    message: `AI decision: ${decision.action}${decision.action === 'pay' ? ` ${decision.amountAlgo} ALGO` : ''} (confidence ${decision.confidence})`,
    detail: {
      action: decision.action,
      amountAlgo: decision.amountAlgo,
      recipient: decision.recipient,
      reason: decision.reason,
      confidence: decision.confidence,
      clamped: decision.clamped,
      source: decision.source,
      loopIterations: decision.loopIterations ?? null,
      algoUsd: market.algoUsd,
      guardianBlocked: guardian.blocked,
      guardianBlockReason: guardian.blockReason ?? null,
    },
  })
  console.log(
    `  [ai-agent] ${decision.action} ${decision.action === 'pay' ? `${decision.amountAlgo} ALGO ` : ''}` +
      `(conf ${decision.confidence}, ${decision.source}, loops ${decision.loopIterations ?? 1}) - ${decision.reason}`,
  )

  ctx.vars.aiDecision = decision

  if (decision.action === 'notify') {
    await notifyLinkedChats(ctx, `Zuik AI agent: ${decision.reason}`)
    return 'continue'
  }

  if (decision.action !== 'pay' || !decision.recipient || decision.amountAlgo <= 0) {
    return 'continue'
  }

  // Deterministic guardrail: clamp once more to maxPerTrade right before submit. The AI never
  // bypasses Guardian; this and authorize_trade are the boundary.
  const decimals = await getAssetDecimals(0)
  let amountMicroAlgos = BigInt(Math.round(decision.amountAlgo * 10 ** decimals))
  if (guardian.policy && amountMicroAlgos > guardian.policy.maxPerTradeMicroAlgos) {
    amountMicroAlgos = guardian.policy.maxPerTradeMicroAlgos
    recorder.log({
      nodeId,
      blockId: 'ai-agent',
      type: 'info',
      message: `Clamped amount to Guardian maxPerTrade (${amountMicroAlgos} microAlgos) before submit`,
    })
  }

  try {
    const result = await sendAuthorizedPayment({
      agentAddress: agent.agentAddress,
      recipient: decision.recipient,
      amountMicroAlgos,
      guardianAppId: agent.guardianAppId,
      signer: agent.signer,
      note: `zuik-ai:${decision.reason.slice(0, 40)}`,
    })
    recorder.recordTx(result.txIds, 2000)
    recorder.log({
      nodeId,
      blockId: 'ai-agent',
      type: 'success',
      message: `AI payment authorized by Guardian (round ${result.confirmedRound})`,
      detail: { txIds: result.txIds, confirmedRound: result.confirmedRound },
    })
    console.log(`  [ai-agent] Paid via Guardian (round ${result.confirmedRound}, ${result.txIds.join(', ')})`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    recorder.log({
      nodeId,
      blockId: 'ai-agent',
      type: 'error',
      message: `Guardian rejected or execution failed: ${msg}`,
    })
    console.error(`  [ai-agent] Guardian rejected or execution failed: ${msg}`)
  }
  return 'continue'
}

async function notifyLinkedChats(ctx: RunContext, message: string): Promise<void> {
  if (!ctx.resolveLinkedChats) return
  try {
    const chats = await ctx.resolveLinkedChats(ctx.walletAddress)
    for (const chat of chats) await sendTelegram(chat, message)
  } catch {
    // best effort
  }
}

/**
 * Execute a single flow node. Shared by the linear runner and the multi-agent runner.
 * Returns 'continue' to proceed or 'stop' to halt the current (linear) branch.
 */
export async function executeBlock(
  node: FlowNode,
  ctx: RunContext,
): Promise<'continue' | 'stop'> {
  const blockId = node.data?.blockId
  const config = node.data?.config ?? {}
  const context = ctx.vars

  switch (blockId) {
    case 'timer-loop':
      return 'continue'

    case 'get-quote': {
      const agent = ctx.agentContext
      if (agent && process.env.X402_DISABLE !== '1') {
        try {
          const paid = await fetchPremiumAlgoQuoteViaX402(agent)
          if (paid?.quote.priceUsd != null) {
            context.currentPrice = paid.quote.priceUsd
            context.quoteAmount = paid.quote.priceUsd
            context.premiumQuote = paid.quote
            if (paid.paymentTxId) {
              context.x402PaymentTxId = paid.paymentTxId
            }
            ctx.recorder.log({
              nodeId: node.id,
              blockId: 'get-quote',
              type: 'info',
              message: `Premium x402 quote $${paid.quote.priceUsd} (tx: ${paid.paymentTxId ?? 'pending'})`,
            })
            console.log(
              `  [get-quote] Premium x402 ALGO = $${paid.quote.priceUsd}` +
                (paid.paymentTxId ? ` (tx ${paid.paymentTxId.slice(0, 12)}...)` : ''),
            )
            return 'continue'
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          console.warn(`  [get-quote] x402 premium failed, falling back to free API: ${msg}`)
        }
      }
      const price = await fetchPrice('algorand')
      context.currentPrice = price
      context.quoteAmount = price
      console.log(`  [get-quote] ALGO = $${price} (free)`)
      return 'continue'
    }

    case 'price-feed':
    case 'price-monitor': {
      const price = await fetchPrice('algorand')
      context.currentPrice = price
      console.log(`  [price-feed] ALGO = $${price}`)
      return 'continue'
    }

    case 'comparator': {
      const operator = String(config.operator ?? '<')
      const threshold = parseFloat(String(config.threshold ?? '0'))
      const value = typeof context.currentPrice === 'number' ? context.currentPrice : 0
      const result = evaluateCondition(value, operator, threshold)
      context.conditionMet = result
      console.log(`  [comparator] ${value} ${operator} ${threshold} = ${result}`)
      if (!result) {
        console.log('  [comparator] Condition not met, stopping branch')
        return 'stop'
      }
      return 'continue'
    }

    case 'filter': {
      const operator = String(config.operator ?? '>')
      const threshold = parseFloat(String(config.threshold ?? '0'))
      const value = typeof context.currentPrice === 'number' ? context.currentPrice : 0
      const result = evaluateCondition(value, operator, threshold)
      context.conditionMet = result
      if (!result) return 'stop'
      return 'continue'
    }

    case 'ai-agent':
      return executeAiAgentBlock(config, ctx, node.id)

    case 'send-telegram': {
      let msg = String(config.message ?? 'Zuik workflow notification')
      msg = msg.replace(/\{\{.*?price.*?\}\}/gi, String(context.currentPrice ?? '?'))
      msg = msg.replace(/\{\{.*?quote.*?\}\}/gi, String(context.quoteAmount ?? '?'))

      const chatId = String(config.chatId ?? '')
      if (chatId) {
        await sendTelegram(chatId, msg)
        console.log(`  [send-telegram] Sent to ${chatId}`)
      } else if (ctx.resolveLinkedChats) {
        const linked = await ctx.resolveLinkedChats(ctx.walletAddress)
        for (const chat of linked) {
          await sendTelegram(chat, msg)
          console.log(`  [send-telegram] Sent to linked chat ${chat}`)
        }
      }
      return 'continue'
    }

    case 'send-discord': {
      let msg = String(config.message ?? 'Zuik workflow notification')
      msg = msg.replace(/\{\{.*?price.*?\}\}/gi, String(context.currentPrice ?? '?'))
      const webhookUrl = String(config.webhookUrl ?? '')
      if (webhookUrl) {
        await sendDiscord(webhookUrl, msg)
        console.log('  [send-discord] Sent')
      }
      return 'continue'
    }

    case 'send-payment': {
      const agent = ctx.agentContext
      if (!agent) {
        console.log('  [send-payment] Skipped (no agent sub-account registered for this workflow)')
        return 'continue'
      }
      const recipient = String(config.recipient ?? '')
      const amountRaw = config.amount
      const assetId = Number(config.asset ?? 0)
      const note = typeof config.note === 'string' ? config.note : undefined
      if (!recipient || amountRaw == null) {
        console.log('  [send-payment] Missing recipient or amount')
        return 'continue'
      }

      const riskGate = await checkWorkflowBlockRisk('send-payment', config)
      if (!riskGate.allowed) {
        const msg = riskGate.reason ?? 'Token blocked by risk policy'
        ctx.recorder.log({ nodeId: node.id, blockId: 'send-payment', type: 'error', message: msg })
        console.error(`  [send-payment] Blocked: ${msg}`)
        return 'continue'
      }

      if (assetId !== 0) {
        console.log(`  [send-payment] Skipped (asset ${assetId} not supported by the Guardian ALGO path)`)
        return 'continue'
      }
      const numericAmount = Number(amountRaw)
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        console.log('  [send-payment] Invalid amount')
        return 'continue'
      }
      const decimals = await getAssetDecimals(0)
      const amountMicroAlgos = BigInt(Math.round(numericAmount * 10 ** decimals))
      try {
        const result = await sendAuthorizedPayment({
          agentAddress: agent.agentAddress,
          recipient,
          amountMicroAlgos,
          guardianAppId: agent.guardianAppId,
          signer: agent.signer,
          note,
        })
        ctx.recorder.recordTx(result.txIds, 2000)
        ctx.recorder.log({
          nodeId: node.id,
          blockId: 'send-payment',
          type: 'success',
          message: `Sent ${numericAmount} ALGO via Guardian (round ${result.confirmedRound})`,
          detail: { txIds: result.txIds },
        })
        console.log(
          `  [send-payment] Sent ${numericAmount} ALGO via Guardian (round ${result.confirmedRound}, ${result.txIds.join(', ')})`,
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        ctx.recorder.log({ nodeId: node.id, blockId: 'send-payment', type: 'error', message: msg })
        console.error(`  [send-payment] Guardian rejected or execution failed: ${msg}`)
      }
      return 'continue'
    }

    case 'http-request': {
      const url = String(config.url ?? '')
      const method = String(config.method ?? 'GET')
      if (url) {
        try {
          const res = await fetch(url, { method })
          context.httpResponse = await res.text()
          console.log(`  [http-request] ${method} ${url} -> ${res.status}`)
        } catch (e) {
          console.warn('  [http-request] Failed:', e)
        }
      }
      return 'continue'
    }

    case 'delay': {
      const sec = Number(config.duration ?? config.seconds ?? 5)
      const ms = Math.min(sec * 1000, 30_000)
      console.log(`  [delay] Waiting ${ms}ms`)
      await new Promise((r) => setTimeout(r, ms))
      return 'continue'
    }

    case 'log':
    case 'log-debug': {
      console.log(`  [log] ${config.message ?? config.label ?? 'Log node'}`)
      return 'continue'
    }

    default:
      if (blockId?.match(/swap|opt-in|create-asa|call-contract/)) {
        console.log(`  [${blockId}] Skipped (requires wallet signer)`)
      } else {
        console.log(`  [${blockId}] No server executor, skipped`)
      }
      return 'continue'
  }
}

export async function executeWorkflowHeadless(
  flowJson: { nodes: FlowNode[]; edges: FlowEdge[] },
  walletAddress: string,
  workflowLabel?: string,
  resolveLinkedChats?: LinkedChatResolver,
  agentContext?: AgentExecutionContext | null,
  sb?: SupabaseClient | null,
  workflowId?: string | null,
): Promise<void> {
  const { nodes, edges } = flowJson
  if (!nodes || nodes.length === 0) return

  const label = workflowLabel ?? 'workflow'
  const recorder = new ExecutionRecorder({ sb, workflowId, walletAddress, blockCount: nodes.length })
  await recorder.start()

  const ctx: RunContext = {
    vars: {},
    walletAddress,
    workflowId,
    agentContext,
    resolveLinkedChats,
    recorder,
    sb,
  }

  try {
    // Multi-agent flows (fork/join/event/merge_gate) use the deterministic orchestrator.
    if (flowHasMultiAgentBlocks(nodes)) {
      console.log(`[Agent] Executing ${label} via multi-agent orchestrator (${nodes.length} nodes)`)
      await runMultiAgentHeadless(nodes, edges ?? [], ctx)
    } else {
      const sorted = topoSort(nodes, edges ?? [])
      console.log(`[Agent] Executing ${label} (${sorted.length} nodes) for ${walletAddress.slice(0, 8)}...`)
      for (const node of sorted) {
        const signal = await executeBlock(node, ctx)
        if (signal === 'stop') break
      }
    }
    await recorder.finish()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    recorder.log({ blockId: label, type: 'error', message: msg })
    await recorder.finish('failed', msg)
    throw e
  }
}
