import type { AlgorandClient } from '@algorandfoundation/algokit-utils'
import type { TransactionSigner } from 'algosdk'
import { getAlgodClient } from './algorand'
import { createAsa } from './createAsa'
import { optInToAsa } from './optInAsa'
import { sendPayment } from './sendPayment'
import { executeSwap, getSwapQuote } from './swapToken'

export interface ExecutorContext {
  sender: string
  signer: TransactionSigner
  algorand: AlgorandClient
}

export type BlockConfig = Record<string, string | number | undefined>

export type BlockExecutor = (
  config: BlockConfig,
  context: ExecutorContext
) => Promise<Record<string, unknown>>

function topologicalSort(
  nodeIds: string[],
  edges: { source: string; target: string }[]
): string[] {
  const inDegree = new Map<string, number>()
  const outEdges = new Map<string, string[]>()
  for (const id of nodeIds) {
    inDegree.set(id, 0)
    outEdges.set(id, [])
  }
  for (const e of edges) {
    if (nodeIds.includes(e.source) && nodeIds.includes(e.target)) {
      outEdges.get(e.source)!.push(e.target)
      inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1)
    }
  }
  const queue = nodeIds.filter((id) => inDegree.get(id) === 0)
  const result: string[] = []
  while (queue.length > 0) {
    const u = queue.shift()!
    result.push(u)
    for (const v of outEdges.get(u) ?? []) {
      const d = (inDegree.get(v) ?? 1) - 1
      inDegree.set(v, d)
      if (d === 0) queue.push(v)
    }
  }
  return result
}

async function executeSendPayment(
  config: BlockConfig,
  context: ExecutorContext
): Promise<Record<string, unknown>> {
  const recipient = config.recipient as string
  const amount = config.amount as number
  const asset = config.asset as number | undefined
  const note = config.note as string | undefined
  const assetId = asset ?? 0

  if (!recipient || amount == null) {
    throw new Error('Send Payment: recipient and amount are required')
  }

  const result = await sendPayment({
    sender: context.sender,
    receiver: recipient,
    amount: typeof amount === 'number' ? amount : Number(amount),
    assetId: assetId ? Number(assetId) : 0,
    note,
    signer: context.signer,
  })
  return { txId: result.txId }
}

async function executeOptInAsa(
  config: BlockConfig,
  context: ExecutorContext
): Promise<Record<string, unknown>> {
  const assetId = config.assetId as number
  if (assetId == null) {
    throw new Error('Opt-In ASA: assetId is required')
  }

  const result = await optInToAsa({
    sender: context.sender,
    assetId: Number(assetId),
    signer: context.signer,
  })
  return { txId: result.alreadyOptedIn ? '' : result.txId }
}

async function executeCreateAsa(
  config: BlockConfig,
  context: ExecutorContext
): Promise<Record<string, unknown>> {
  const name = config.name as string
  const unitName = config.unitName as string
  const totalSupply = config.totalSupply as number
  const decimals = (config.decimals as number) ?? 6

  if (!name || !unitName || totalSupply == null) {
    throw new Error('Create ASA: name, unitName, and totalSupply are required')
  }

  const result = await createAsa({
    sender: context.sender,
    name,
    unitName,
    totalSupply: Number(totalSupply),
    decimals: Number(decimals),
    signer: context.signer,
  })
  return { txId: result.txId, assetId: result.assetId }
}

async function executeSwapToken(
  config: BlockConfig,
  context: ExecutorContext
): Promise<Record<string, unknown>> {
  const fromAsset = config.fromAsset as number
  const toAsset = config.toAsset as number
  const amount = config.amount as number

  if (fromAsset == null || toAsset == null || amount == null) {
    throw new Error('Swap Token: fromAsset, toAsset, and amount are required')
  }

  const network = import.meta.env.VITE_ALGOD_NETWORK ?? 'testnet'
  const quote = await getSwapQuote({
    fromAssetId: Number(fromAsset),
    toAssetId: Number(toAsset),
    amount: Number(amount),
    swapType: 'FIXED_INPUT',
    network,
  })

  const result = await executeSwap({
    quote,
    sender: context.sender,
    signer: context.signer,
    algodClient: getAlgodClient(),
  })
  return { txId: result.txId, amountOut: result.amountOut }
}

async function executeGetQuote(
  config: BlockConfig,
  _context: ExecutorContext
): Promise<Record<string, unknown>> {
  const fromAsset = config.fromAsset as number
  const toAsset = config.toAsset as number
  const amount = config.amount as number

  if (fromAsset == null || toAsset == null || amount == null) {
    throw new Error('Get Quote: fromAsset, toAsset, and amount are required')
  }

  const network = import.meta.env.VITE_ALGOD_NETWORK ?? 'testnet'
  const quote = await getSwapQuote({
    fromAssetId: Number(fromAsset),
    toAssetId: Number(toAsset),
    amount: Number(amount),
    swapType: 'FIXED_INPUT',
    network,
  })
  return { quoteAmount: quote.quoteAmount ?? 0, priceImpact: quote.priceImpact ?? 0 }
}

async function executeWebhookAction(
  config: BlockConfig,
): Promise<Record<string, unknown>> {
  const url = config.url as string
  const method = (config.method as string) || 'GET'
  if (!url) throw new Error('HTTP Request: url is required')

  let headers: Record<string, string> = {}
  if (config.headers) {
    try { headers = JSON.parse(config.headers as string) } catch { /* use empty */ }
  }

  let body: string | undefined
  if (config.body && method !== 'GET') {
    body = config.body as string
  }

  const resp = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  })
  const data = await resp.json().catch(() => ({}))
  return { response: data, status: resp.status }
}

async function executeLogDebug(
  config: BlockConfig,
): Promise<Record<string, unknown>> {
  const label = (config.label as string) || 'debug'
  console.log(`[Zuik Debug: ${label}]`, config)
  return { passthrough: config }
}

export const blockExecutors: Record<string, BlockExecutor> = {
  'send-payment': executeSendPayment,
  'opt-in-asa': executeOptInAsa,
  'create-asa': executeCreateAsa,
  'swap-token': executeSwapToken,
  'get-quote': executeGetQuote,
  'webhook-action': executeWebhookAction,
  'log-debug': executeLogDebug,
}

export const ACTION_BLOCK_IDS = Object.keys(blockExecutors)

export function getActionBlocksInOrder(
  nodes: { id: string; data: Record<string, unknown> }[],
  edges: { source: string; target: string }[]
): { nodeId: string; blockId: string; config: BlockConfig }[] {
  const actionNodes = nodes.filter((n) => {
    const blockId = n.data.blockId as string
    return blockId && ACTION_BLOCK_IDS.includes(blockId)
  })
  const nodeIds = actionNodes.map((n) => n.id)
  const ordered = topologicalSort(nodeIds, edges)
  return ordered.map((nodeId) => {
    const node = actionNodes.find((n) => n.id === nodeId)!
    return {
      nodeId,
      blockId: node.data.blockId as string,
      config: (node.data.config as BlockConfig) ?? {},
    }
  })
}
