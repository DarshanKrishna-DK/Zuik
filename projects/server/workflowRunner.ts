import 'dotenv/config'
import { executeDelegatedPayment, type LogicSigVaultRow } from './logicSigDelegation.js'

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

export async function executeWorkflowHeadless(
  flowJson: { nodes: FlowNode[]; edges: FlowEdge[] },
  walletAddress: string,
  workflowLabel?: string,
  resolveLinkedChats?: LinkedChatResolver,
  logicSigVault?: LogicSigVaultRow | null,
): Promise<void> {
  const { nodes, edges } = flowJson
  if (!nodes || nodes.length === 0) return

  const sorted = topoSort(nodes, edges ?? [])
  const context: Record<string, unknown> = {}

  const label = workflowLabel ?? 'workflow'
  console.log(`[Agent] Executing ${label} (${sorted.length} nodes) for ${walletAddress.slice(0, 8)}...`)

  for (const node of sorted) {
    const blockId = node.data?.blockId
    const config = node.data?.config ?? {}

    switch (blockId) {
      case 'timer-loop':
        break

      case 'get-quote': {
        const price = await fetchPrice('algorand')
        context.currentPrice = price
        context.quoteAmount = price
        console.log(`  [get-quote] ALGO = $${price}`)
        break
      }

      case 'price-feed': {
        const price = await fetchPrice('algorand')
        context.currentPrice = price
        console.log(`  [price-feed] ALGO = $${price}`)
        break
      }

      case 'comparator': {
        const operator = String(config.operator ?? '<')
        const threshold = parseFloat(String(config.threshold ?? '0'))
        const value = typeof context.currentPrice === 'number' ? context.currentPrice : 0
        const result = evaluateCondition(value, operator, threshold)
        context.conditionMet = result
        console.log(`  [comparator] ${value} ${operator} ${threshold} = ${result}`)
        if (!result) {
          console.log('  [comparator] Condition not met, stopping workflow')
          return
        }
        break
      }

      case 'filter': {
        const operator = String(config.operator ?? '>')
        const threshold = parseFloat(String(config.threshold ?? '0'))
        const value = typeof context.currentPrice === 'number' ? context.currentPrice : 0
        const result = evaluateCondition(value, operator, threshold)
        context.conditionMet = result
        if (!result) return
        break
      }

      case 'send-telegram': {
        let msg = String(config.message ?? 'Zuik workflow notification')
        msg = msg.replace(/\{\{.*?price.*?\}\}/gi, String(context.currentPrice ?? '?'))
        msg = msg.replace(/\{\{.*?quote.*?\}\}/gi, String(context.quoteAmount ?? '?'))

        const chatId = String(config.chatId ?? '')
        if (chatId) {
          await sendTelegram(chatId, msg)
          console.log(`  [send-telegram] Sent to ${chatId}`)
        } else if (resolveLinkedChats) {
          const linked = await resolveLinkedChats(walletAddress)
          for (const chat of linked) {
            await sendTelegram(chat, msg)
            console.log(`  [send-telegram] Sent to linked chat ${chat}`)
          }
        }
        break
      }

      case 'send-discord': {
        let msg = String(config.message ?? 'Zuik workflow notification')
        msg = msg.replace(/\{\{.*?price.*?\}\}/gi, String(context.currentPrice ?? '?'))
        const webhookUrl = String(config.webhookUrl ?? '')
        if (webhookUrl) {
          await sendDiscord(webhookUrl, msg)
          console.log('  [send-discord] Sent')
        }
        break
      }

      case 'send-payment': {
        if (!logicSigVault) {
          console.log('  [send-payment] Skipped (no automation permission)')
          break
        }
        const recipient = String(config.recipient ?? '')
        const amountRaw = config.amount
        const assetId = Number(config.asset ?? 0)
        const note = typeof config.note === 'string' ? config.note : undefined
        if (!recipient || amountRaw == null) {
          console.log('  [send-payment] Missing recipient or amount')
          break
        }
        const numericAmount = Number(amountRaw)
        if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
          console.log('  [send-payment] Invalid amount')
          break
        }
        const txIds = await executeDelegatedPayment({
          vault: logicSigVault,
          sender: walletAddress,
          recipient,
          amount: numericAmount,
          assetId,
          note,
        })
        console.log(`  [send-payment] Sent (${txIds.join(', ')})`)
        break
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
        break
      }

      case 'delay': {
        const sec = Number(config.duration ?? config.seconds ?? 5)
        const ms = Math.min(sec * 1000, 30_000)
        console.log(`  [delay] Waiting ${ms}ms`)
        await new Promise((r) => setTimeout(r, ms))
        break
      }

      case 'log':
      case 'log-debug': {
        console.log(`  [log] ${config.message ?? config.label ?? 'Log node'}`)
        break
      }

      default:
        if (blockId?.match(/swap|send-payment|opt-in|create-asa|call-contract/)) {
          console.log(`  [${blockId}] Skipped (requires wallet signer)`)
        } else {
          console.log(`  [${blockId}] No server executor, skipped`)
        }
    }
  }
}
