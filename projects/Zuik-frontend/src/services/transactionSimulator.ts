import algosdk from 'algosdk'
import { getAlgodClient } from './algorand'
import { resolveAssetNameSync } from './assetResolver'
import { getSwapQuote } from './swapToken'

export interface SimulationStep {
  index: number
  blockId: string
  blockName: string
  description: string
  fee: number
  type: 'payment' | 'asset-transfer' | 'asset-create' | 'app-call' | 'unknown'
}

export interface SimulationWarning {
  severity: 'info' | 'warning' | 'error'
  message: string
  field?: string
}

export interface SimulationResult {
  success: boolean
  steps: SimulationStep[]
  totalFee: number
  warnings: SimulationWarning[]
  error?: string
  budgetConsumed?: number
  budgetAvailable?: number
}

let cachedAlgoUsd: { price: number; fetchedAt: number } | null = null
const CACHE_TTL_MS = 60_000

export async function fetchAlgoUsdPrice(): Promise<number> {
  if (cachedAlgoUsd && Date.now() - cachedAlgoUsd.fetchedAt < CACHE_TTL_MS) {
    return cachedAlgoUsd.price
  }
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=algorand&vs_currencies=usd',
    )
    if (res.ok) {
      const data = await res.json() as { algorand?: { usd?: number } }
      const price = data.algorand?.usd
      if (typeof price === 'number' && price > 0) {
        cachedAlgoUsd = { price, fetchedAt: Date.now() }
        return price
      }
    }
  } catch { /* fall through */ }
  return cachedAlgoUsd?.price ?? 0.18
}

export function getAlgoUsdCached(): number {
  return cachedAlgoUsd?.price ?? 0.18
}

export function formatMicroAlgo(microAlgo: number): string {
  return (microAlgo / 1_000_000).toFixed(6).replace(/\.?0+$/, '')
}

export function microAlgoToUsd(microAlgo: number): string {
  const price = getAlgoUsdCached()
  const usd = (microAlgo / 1_000_000) * price
  if (usd < 0.01) return '< $0.01'
  return `~$${usd.toFixed(2)}`
}

export function describeTransactionType(
  blockId: string,
  config: Record<string, string | number | undefined>,
): SimulationStep['type'] {
  switch (blockId) {
    case 'send-payment': {
      const asset = config.asset as number | undefined
      return asset && Number(asset) > 0 ? 'asset-transfer' : 'payment'
    }
    case 'opt-in-asa':
      return 'asset-transfer'
    case 'create-asa':
      return 'asset-create'
    case 'swap-token':
    case 'call-contract':
      return 'app-call'
    default:
      return 'unknown'
  }
}

export function buildStepDescription(
  blockId: string,
  blockName: string,
  config: Record<string, string | number | undefined>,
): string {
  switch (blockId) {
    case 'send-payment': {
      const recipient = config.recipient as string
      const amount = config.amount
      const assetLabel = resolveAssetNameSync(config.asset)
      const addr = recipient
        ? `${recipient.slice(0, 6)}...${recipient.slice(-4)}`
        : '(not set)'
      return `Send ${amount ?? '?'} ${assetLabel} to ${addr}`
    }
    case 'opt-in-asa':
      return `Opt in to ${resolveAssetNameSync(config.assetId)}`
    case 'create-asa':
      return `Create ASA "${config.name ?? '?'}" (${config.unitName ?? '?'}, ${config.totalSupply ?? '?'} units, ${config.decimals ?? 6} decimals)`
    case 'swap-token': {
      const fromLabel = resolveAssetNameSync(config.fromAsset)
      const toLabel = resolveAssetNameSync(config.toAsset)
      const base = `Swap ${config.amount ?? '?'} ${fromLabel} → ${toLabel}`
      if (config._expectedOut != null) {
        return `${base} (expected: ~${config._expectedOut} ${toLabel})`
      }
      return base
    }
    case 'get-quote': {
      const fromLabel = resolveAssetNameSync(config.fromAsset)
      const toLabel = resolveAssetNameSync(config.toAsset)
      return `Fetch swap quote: ${config.amount ?? '?'} ${fromLabel} → ${toLabel}`
    }
    case 'fiat-onramp':
      return `Fiat On-Ramp: ${config.fiatAmount ?? '?'} ${config.fiatCurrency ?? 'INR'} → crypto`
    case 'fiat-offramp':
      return `Fiat Off-Ramp: sell crypto → ${config.fiatCurrency ?? 'INR'}`
    case 'fiat-quote':
      return `Fiat Price Quote: ${config.amount ?? '?'} ${config.fromCurrency ?? 'INR'} → ${config.toCurrency ?? 'USDT'}`
    case 'webhook-action':
      return `HTTP ${config.method ?? 'GET'} → ${config.url ?? '(not set)'}`
    case 'log-debug':
      return `Log: ${config.label ?? 'debug'}`
    case 'send-telegram':
      return `Send Telegram: "${(config.message as string)?.slice(0, 40) ?? '(no message)'}${(config.message as string)?.length > 40 ? '...' : ''}" to chat ${config.chatId || '(not set)'}`
    case 'send-discord':
      return `Send Discord message`
    case 'browser-notify':
      return `Browser notification: ${config.title ?? 'Zuik'}`
    case 'comparator':
      return `Compare: value ${config.operator ?? '=='} ${config.threshold ?? '?'}`
    case 'delay':
      return `Wait ${config.duration ?? 5} seconds`
    case 'math-op': {
      const op = config.operation ?? 'add'
      if (op === 'percentage') return `Calculate ${config.b ?? '?'}% of input`
      return `Math: ${op} (b = ${config.b ?? '?'})`
    }
    case 'filter':
      return `Filter: ${config.field ?? '?'} ${config.operator ?? '=='} ${config.value ?? '?'}`
    case 'rate-limiter':
      return `Rate limit: max ${config.maxPerWindow ?? 5} per ${config.windowSec ?? 60}s`
    case 'variable-set':
      return `Set variable: ${config.varName ?? '?'}`
    case 'constant':
      return `Constant: ${config.value ?? '(empty)'}`
    case 'merge':
      return `Merge (${config.mode ?? 'first'})`
    case 'transform-data':
      return `Transform to ${config.targetType ?? 'string'}`
    case 'price-monitor':
      return `Monitor price of asset ${config.assetId ?? '?'}`
    case 'pool-info':
      return `Pool info: ${resolveAssetNameSync(config.asset1)} / ${resolveAssetNameSync(config.asset2)}`
    case 'portfolio-balance':
      return `Check portfolio balance`
    case 'wallet-event':
      return `Watch wallet for incoming ${resolveAssetNameSync(config.assetId)} transfers`
    case 'timer-loop':
      return `Timer: every ${config.interval ?? 60}s${config.maxIterations ? ` (max ${config.maxIterations})` : ''}`
    case 'webhook-receiver':
      return `Listen for webhook at ${config.path ?? '/'}`
    case 'telegram-trigger':
      return `Listen for Telegram messages`
    default:
      return blockName
  }
}

const MIN_FEE_MICRO = 1000

export function estimateStepFee(blockId: string): number {
  switch (blockId) {
    case 'send-payment':
    case 'opt-in-asa':
    case 'create-asa':
      return MIN_FEE_MICRO
    case 'swap-token':
      return MIN_FEE_MICRO * 2
    case 'call-contract':
      return MIN_FEE_MICRO * 2
    default:
      return 0
  }
}

export function buildSimulationPreview(
  actionBlocks: { nodeId: string; blockId: string; config: Record<string, string | number | undefined> }[],
  blockNameLookup: (blockId: string) => string,
): SimulationResult {
  const steps: SimulationStep[] = []
  let totalFee = 0
  const warnings: SimulationWarning[] = []

  for (let i = 0; i < actionBlocks.length; i++) {
    const { blockId, config } = actionBlocks[i]
    const blockName = blockNameLookup(blockId)
    const fee = estimateStepFee(blockId)
    totalFee += fee

    steps.push({
      index: i + 1,
      blockId,
      blockName,
      description: buildStepDescription(blockId, blockName, config),
      fee,
      type: describeTransactionType(blockId, config),
    })
  }

  const onChainSteps = steps.filter((s) => s.fee > 0)
  if (onChainSteps.length > 1) {
    warnings.push({
      severity: 'info',
      message: `${onChainSteps.length} on-chain transactions will execute sequentially. Each requires a separate wallet signature.`,
    })
  }

  const hasTriggerBlocks = actionBlocks.some((b) =>
    ['timer-loop', 'wallet-event', 'webhook-receiver', 'telegram-trigger'].includes(b.blockId)
  )
  if (hasTriggerBlocks) {
    warnings.push({
      severity: 'info',
      message: 'This workflow has trigger blocks. Run executes all steps once for testing. For live triggers (polling for wallet events, timers), use the agent Run button in the toolbar.',
    })
  }

  return {
    success: true,
    steps,
    totalFee,
    warnings,
  }
}

async function getAssetDecimalsForSim(assetId: number): Promise<number> {
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

/**
 * Fetches live DEX quotes for swap steps and enriches the simulation with
 * expected output amounts.
 */
export async function enrichSwapQuotes(
  actionBlocks: { blockId: string; config: Record<string, string | number | undefined> }[],
  simulation: SimulationResult,
): Promise<SimulationResult> {
  const updated = { ...simulation, steps: [...simulation.steps] }

  for (let i = 0; i < actionBlocks.length; i++) {
    const { blockId, config } = actionBlocks[i]
    if (blockId !== 'swap-token') continue

    const fromAssetId = Number(config.fromAsset ?? 0)
    const toAssetId = Number(config.toAsset ?? 0)
    const rawAmount = config.amount
    if (rawAmount == null || typeof rawAmount === 'string' && /\{\{.*\}\}/.test(rawAmount)) continue

    const numericAmount = Number(rawAmount)
    if (isNaN(numericAmount) || numericAmount <= 0) continue

    try {
      const decimalsIn = await getAssetDecimalsForSim(fromAssetId)
      const decimalsOut = await getAssetDecimalsForSim(toAssetId)
      const baseAmount = Math.round(numericAmount * 10 ** decimalsIn)

      const quote = await getSwapQuote({
        fromAssetId,
        toAssetId,
        amount: baseAmount,
        swapType: 'FIXED_INPUT',
        network: 'testnet',
      })

      if (quote.quoteAmount > 0) {
        const humanOut = (quote.quoteAmount / 10 ** decimalsOut).toFixed(decimalsOut > 2 ? 4 : 2)
        const enrichedConfig = { ...config, _expectedOut: humanOut }
        const step = updated.steps[i]
        updated.steps[i] = {
          ...step,
          description: buildStepDescription(blockId, step.blockName, enrichedConfig),
        }
      }
    } catch (e) {
      console.warn('[enrichSwapQuotes] Quote fetch failed for step', i + 1, e)
    }
  }

  return updated
}

export async function simulatePaymentTransaction(
  sender: string,
  receiver: string,
  amount: number,
  assetId: number,
): Promise<{ success: boolean; fee: number; error?: string }> {
  try {
    const algod = getAlgodClient()
    const suggestedParams = await algod.getTransactionParams().do()

    let txn: algosdk.Transaction
    if (assetId === 0) {
      txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender,
        receiver,
        amount: BigInt(amount),
        suggestedParams,
      })
    } else {
      txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender,
        receiver,
        amount: BigInt(amount),
        assetIndex: BigInt(assetId),
        suggestedParams,
      })
    }

    const signedTxn = new algosdk.SignedTransaction({ txn })

    const request = new algosdk.modelsv2.SimulateRequest({
      txnGroups: [
        new algosdk.modelsv2.SimulateRequestTransactionGroup({
          txns: [signedTxn],
        }),
      ],
      allowUnnamedResources: true,
      allowEmptySignatures: true,
    })

    const simResult = await algod.simulateTransactions(request).do()
    const groupResult = simResult.txnGroups?.[0]
    const failed = groupResult?.failureMessage

    return {
      success: !failed,
      fee: Number(txn.fee),
      error: failed ? String(failed) : undefined,
    }
  } catch (err) {
    return {
      success: false,
      fee: MIN_FEE_MICRO,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
