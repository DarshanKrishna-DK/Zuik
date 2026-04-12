import algosdk from 'algosdk'
import { getAlgodClient } from './algorand'

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
      const asset = config.asset as number | undefined
      const assetLabel = asset && Number(asset) > 0 ? `ASA #${asset}` : 'ALGO'
      const addr = recipient
        ? `${recipient.slice(0, 6)}...${recipient.slice(-4)}`
        : '(not set)'
      return `Send ${amount ?? '?'} ${assetLabel} to ${addr}`
    }
    case 'opt-in-asa':
      return `Opt in to ASA #${config.assetId ?? '?'}`
    case 'create-asa':
      return `Create ASA "${config.name ?? '?'}" (${config.unitName ?? '?'}, ${config.totalSupply ?? '?'} units, ${config.decimals ?? 6} decimals)`
    case 'swap-token': {
      const fromAsset = config.fromAsset as number | undefined
      const toAsset = config.toAsset as number | undefined
      const fromLabel = fromAsset === 0 || !fromAsset ? 'ALGO' : `ASA #${fromAsset}`
      const toLabel = toAsset === 0 || !toAsset ? 'ALGO' : `ASA #${toAsset}`
      return `Swap ${config.amount ?? '?'} ${fromLabel} → ${toLabel}`
    }
    case 'get-quote': {
      const fromAsset = config.fromAsset as number | undefined
      const toAsset = config.toAsset as number | undefined
      const fromLabel = fromAsset === 0 || !fromAsset ? 'ALGO' : `ASA #${fromAsset}`
      const toLabel = toAsset === 0 || !toAsset ? 'ALGO' : `ASA #${toAsset}`
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
    default:
      return blockName
  }
}

const MIN_FEE_MICRO = 1000

export function estimateStepFee(blockId: string): number {
  switch (blockId) {
    case 'send-payment':
    case 'opt-in-asa':
      return MIN_FEE_MICRO
    case 'create-asa':
      return MIN_FEE_MICRO
    case 'swap-token':
      return MIN_FEE_MICRO * 4
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

  return {
    success: true,
    steps,
    totalFee,
    warnings,
  }
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
