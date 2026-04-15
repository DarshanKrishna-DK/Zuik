import type { AlgorandClient } from '@algorandfoundation/algokit-utils'
import type { TransactionSigner } from 'algosdk'
import { getAlgodClient } from './algorand'
import { createAsa } from './createAsa'
import { optInToAsa } from './optInAsa'
import { sendPayment } from './sendPayment'
import { executeSwap, getSwapQuote } from './swapToken'
import {
  generateOnRampWidgetUrl,
  initiateSellTransaction,
  getFiatBuyQuote,
} from './saberMoney'

async function getAssetDecimals(assetId: number): Promise<number> {
  if (assetId === 0) return 6
  try {
    const algod = getAlgodClient()
    const info = await algod.getAssetByID(BigInt(assetId)).do()
    return Number(
      (info as Record<string, unknown>).decimals ??
      (info as Record<string, Record<string, unknown>>).params?.decimals ?? 6
    )
  } catch {
    return 6
  }
}

function toBaseUnits(amount: number, decimals: number): number {
  return Math.round(amount * 10 ** decimals)
}

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

function isTemplateExpr(val: unknown): boolean {
  return typeof val === 'string' && /\{\{.*\}\}/.test(val)
}

async function preflight(sender: string, fromAssetId: number, baseAmount: number): Promise<void> {
  const algod = getAlgodClient()
  try {
    const acctInfo = await algod.accountInformation(sender).do()
    const info = acctInfo as Record<string, unknown>
    const algoBalance = Number(info.amount ?? 0)
    const minBalance = Number(info.minBalance ?? info['min-balance'] ?? 100_000)

    if (algoBalance < minBalance + 200_000) {
      const algoStr = (algoBalance / 1e6).toFixed(4)
      const needStr = ((minBalance + 200_000) / 1e6).toFixed(4)
      throw new Error(
        `Wallet ${sender.slice(0, 8)}... has ${algoStr} ALGO but needs at least ${needStr} ALGO ` +
        `(min balance + swap fees). Fund this wallet with more ALGO before swapping.`
      )
    }

    if (fromAssetId !== 0) {
      type AssetHolding = Record<string, unknown>
      const assets = info.assets as AssetHolding[] | undefined
      const holding = assets?.find((a) => {
        const id = Number(a.assetId ?? a['asset-id'] ?? a.assetID ?? -1)
        return id === fromAssetId
      })
      if (!holding) {
        throw new Error(
          `Wallet ${sender.slice(0, 8)}... is not opted in to asset ${fromAssetId}. ` +
          'Opt in to the asset first before swapping.'
        )
      }
      const holdingAmount = Number(holding.amount ?? 0)
      if (holdingAmount < baseAmount) {
        throw new Error(
          `Wallet ${sender.slice(0, 8)}... has ${holdingAmount} base units of asset ${fromAssetId} ` +
          `but the swap requires ${baseAmount}. You do not have enough of this asset.`
        )
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('Wallet ')) throw e
    console.warn('[preflight] Could not verify account:', e)
  }
}

async function executeSwapToken(
  config: BlockConfig,
  context: ExecutorContext
): Promise<Record<string, unknown>> {
  const fromAsset = config.fromAsset as number
  const toAsset = config.toAsset as number
  const amount = config.amount

  if (fromAsset == null || toAsset == null || amount == null) {
    throw new Error('Swap Token: fromAsset, toAsset, and amount are required')
  }

  const numericAmount = Number(amount)
  if (isNaN(numericAmount) || numericAmount <= 0) {
    if (isTemplateExpr(amount)) {
      throw new Error(
        `Swap Token: amount "${amount}" was not resolved. ` +
        'This usually means the upstream trigger block did not produce output. ' +
        'Check that the wallet-event or math-op block is connected and has fired.'
      )
    }
    throw new Error(`Swap Token: amount "${amount}" is not a valid positive number`)
  }

  const fromAssetId = Number(fromAsset)
  const decimals = await getAssetDecimals(fromAssetId)
  const baseAmount = toBaseUnits(numericAmount, decimals)

  console.log('[Zuik Swap] sender:', context.sender, '| from:', fromAssetId, '| amount:', baseAmount)
  await preflight(context.sender, fromAssetId, baseAmount)

  const network = import.meta.env.VITE_ALGOD_NETWORK ?? 'testnet'
  const quote = await getSwapQuote({
    fromAssetId,
    toAssetId: Number(toAsset),
    amount: baseAmount,
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
  const amount = config.amount

  if (fromAsset == null || toAsset == null || amount == null) {
    throw new Error('Get Quote: fromAsset, toAsset, and amount are required')
  }

  const numericAmount = Number(amount)
  if (isNaN(numericAmount) || numericAmount <= 0) {
    if (isTemplateExpr(amount)) {
      throw new Error(
        `Get Quote: amount "${amount}" was not resolved. ` +
        'Check that the upstream block is connected and has produced output.'
      )
    }
    throw new Error(`Get Quote: amount "${amount}" is not a valid positive number`)
  }

  const fromAssetId = Number(fromAsset)
  const decimals = await getAssetDecimals(fromAssetId)
  const baseAmount = toBaseUnits(numericAmount, decimals)

  const network = import.meta.env.VITE_ALGOD_NETWORK ?? 'testnet'
  const quote = await getSwapQuote({
    fromAssetId,
    toAssetId: Number(toAsset),
    amount: baseAmount,
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

async function executeFiatOnRamp(
  config: BlockConfig,
): Promise<Record<string, unknown>> {
  const userId = config.userId as string
  const walletAddress = config.walletAddress as string
  const fiatAmount = config.fiatAmount as number | undefined
  const fiatCurrency = (config.fiatCurrency as string) || 'INR'
  const cryptoSymbol = (config.cryptoSymbol as string) || 'USDT'
  const network = (config.network as string) || 'ALGORAND'

  if (!userId || !walletAddress) {
    throw new Error('Fiat On-Ramp: userId and walletAddress are required')
  }

  const result = await generateOnRampWidgetUrl({
    userId,
    walletAddress,
    fiatAmount: fiatAmount ? Number(fiatAmount) : undefined,
    fiatCurrency,
    cryptoSymbol,
    network,
  })

  if (!result.success || !result.url) {
    throw new Error(`Fiat On-Ramp: ${result.error || 'Failed to generate widget URL'}`)
  }

  window.open(result.url, '_blank', 'noopener,noreferrer')

  return {
    widgetUrl: result.url,
    transactionId: new URL(result.url).searchParams.get('transaction_id') || '',
    fiatAmount: fiatAmount ?? 0,
    fiatCurrency,
  }
}

async function executeFiatOffRamp(
  config: BlockConfig,
): Promise<Record<string, unknown>> {
  const userId = config.userId as string
  const sourceId = config.sourceId as string
  const fiatAmount = config.fiatAmount as number | undefined
  const fiatCurrency = (config.fiatCurrency as string) || 'INR'
  const cryptoSymbol = (config.cryptoSymbol as string) || 'USDT'
  const paymentMethod = (config.paymentMethod as string) || 'bank_transfer'

  if (!userId || !sourceId) {
    throw new Error('Fiat Off-Ramp: userId and sourceId (bank account) are required')
  }

  const result = await initiateSellTransaction({
    userId,
    sourceId,
    fiatSymbol: fiatCurrency,
    cryptoSymbol,
    fiatAmount: fiatAmount ? Number(fiatAmount) : undefined,
    paymentMethod,
  })

  if (!result.success) {
    throw new Error(`Fiat Off-Ramp: ${result.error || 'Sell transaction failed'}`)
  }

  return {
    transactionId: result.transactionId ?? '',
    status: result.status ?? 'CREATED',
    exchangeRate: result.exchangeRate ?? 0,
    fiatAmount: fiatAmount ?? 0,
  }
}

async function executeFiatQuote(
  config: BlockConfig,
): Promise<Record<string, unknown>> {
  const userId = config.userId as string
  const fromCurrency = (config.fromCurrency as string) || 'INR'
  const toCurrency = (config.toCurrency as string) || 'USDT'
  const amount = config.amount as number
  const network = (config.network as string) || 'ALGORAND'

  if (!userId || amount == null) {
    throw new Error('Fiat Price Quote: userId and amount are required')
  }

  const result = await getFiatBuyQuote({
    fromCurrency,
    toCurrency,
    network,
    fromAmount: Number(amount),
    userId,
  })

  if (!result.success || !result.quote) {
    throw new Error(`Fiat Price Quote: ${result.error || 'Quote fetch failed'}`)
  }

  return {
    fromAmount: result.quote.fromAmount,
    toAmount: result.quote.toAmount,
    exchangeRate: result.quote.finalPrice,
    totalFee: result.quote.totalFee,
    feeBreakup: result.quote.feeBreakup,
  }
}

export const blockExecutors: Record<string, BlockExecutor> = {
  'send-payment': executeSendPayment,
  'opt-in-asa': executeOptInAsa,
  'create-asa': executeCreateAsa,
  'swap-token': executeSwapToken,
  'get-quote': executeGetQuote,
  'webhook-action': executeWebhookAction,
  'log-debug': executeLogDebug,
  'fiat-onramp': executeFiatOnRamp,
  'fiat-offramp': executeFiatOffRamp,
  'fiat-quote': executeFiatQuote,
}

export const ACTION_BLOCK_IDS = Object.keys(blockExecutors)

/**
 * Returns all blocks with a blockId in topological order, including triggers.
 */
export function getExecutableBlocksInOrder(
  nodes: { id: string; data: Record<string, unknown> }[],
  edges: { source: string; target: string }[]
): { nodeId: string; blockId: string; config: BlockConfig }[] {
  const executableNodes = nodes.filter((n) => {
    const blockId = n.data.blockId as string
    return !!blockId
  })
  const nodeIds = executableNodes.map((n) => n.id)
  const ordered = topologicalSort(nodeIds, edges)
  return ordered.map((nodeId) => {
    const node = executableNodes.find((n) => n.id === nodeId)!
    return {
      nodeId,
      blockId: node.data.blockId as string,
      config: (node.data.config as BlockConfig) ?? {},
    }
  })
}

/** @deprecated Use getExecutableBlocksInOrder instead */
export function getActionBlocksInOrder(
  nodes: { id: string; data: Record<string, unknown> }[],
  edges: { source: string; target: string }[]
): { nodeId: string; blockId: string; config: BlockConfig }[] {
  return getExecutableBlocksInOrder(nodes, edges)
}
