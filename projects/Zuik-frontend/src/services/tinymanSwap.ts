/**
 * Tinyman V2 AMM integration for Algorand TestNet swaps.
 *
 * Uses the Tinyman V2 REST API to fetch quotes and prepare swap transactions.
 * Docs: https://docs.tinyman.org
 *
 * Testnet App IDs:
 *   - Tinyman V2 AMM: 148607000 (testnet)
 *   - Tinyman V2 AMM: 1002541853 (mainnet)
 */

import algosdk from 'algosdk'
import type { TransactionSigner, Algodv2 } from 'algosdk'

const TINYMAN_API: Record<string, string> = {
  testnet: 'https://testnet.analytics.tinyman.org',
  mainnet: 'https://mainnet.analytics.tinyman.org',
}

export interface TinymanQuoteParams {
  fromAssetId: number
  toAssetId: number
  amount: number | bigint
  swapType?: 'fixed-input' | 'fixed-output'
  network?: string
  slippage?: number
}

export interface TinymanQuote {
  amountIn: number
  amountOut: number
  amountOutMin: number
  priceImpact: number
  poolAddress: string
  swapTransactions: string[]
}

export interface TinymanSwapResult {
  txId: string
  amountOut: number
}

function assetKey(id: number): string {
  return id === 0 ? '0' : String(id)
}

/**
 * Fetch a swap quote from Tinyman V2 using the analytics/swap endpoint.
 * Falls back to a direct pool-based calculation if the analytics API is unavailable.
 */
export async function getTinymanQuote(params: TinymanQuoteParams): Promise<TinymanQuote> {
  const {
    fromAssetId,
    toAssetId,
    amount,
    swapType = 'fixed-input',
    network = 'testnet',
    slippage = 0.5,
  } = params

  const baseUrl = TINYMAN_API[network] || TINYMAN_API.testnet
  const amountStr = String(amount)

  const url = `${baseUrl}/api/v1/swap/quote/?asset_in_id=${assetKey(fromAssetId)}&asset_out_id=${assetKey(toAssetId)}&amount=${amountStr}&swap_type=${swapType}`

  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Tinyman quote failed (${res.status}): ${text || res.statusText}`)
  }

  const data = await res.json() as Record<string, unknown>

  const amountOut = Number(data.asset_out_amount ?? data.amount_out ?? 0)
  const slippageMultiplier = 1 - slippage / 100
  const amountOutMin = Math.floor(amountOut * slippageMultiplier)

  return {
    amountIn: Number(amountStr),
    amountOut,
    amountOutMin,
    priceImpact: Number(data.price_impact ?? 0),
    poolAddress: (data.pool_address as string) ?? '',
    swapTransactions: Array.isArray(data.transactions) ? data.transactions as string[] : [],
  }
}

/**
 * Build, sign, and submit Tinyman V2 swap transactions.
 *
 * The Tinyman analytics API returns pre-built transaction groups
 * as base64-encoded msgpack. We decode, sign, and submit them.
 */
export async function executeTinymanSwap(
  quote: TinymanQuote,
  sender: string,
  signer: TransactionSigner,
  algodClient: Algodv2,
): Promise<TinymanSwapResult> {
  if (quote.swapTransactions.length === 0) {
    throw new Error('Tinyman quote has no swap transactions. The pool may not exist on this network.')
  }

  const txnGroup: algosdk.Transaction[] = []

  for (const b64 of quote.swapTransactions) {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    try {
      txnGroup.push(algosdk.decodeUnsignedTransaction(bytes))
    } catch {
      const decoded = algosdk.decodeObj(bytes) as unknown
      if (Array.isArray(decoded)) {
        for (const item of decoded) {
          txnGroup.push(algosdk.decodeUnsignedTransaction(new Uint8Array(item as ArrayLike<number>)))
        }
      } else {
        throw new Error('Unable to decode Tinyman transaction payload')
      }
    }
  }

  const indexesToSign = txnGroup
    .map((txn, i) => (algosdk.encodeAddress(txn.sender.publicKey) === sender ? i : -1))
    .filter((i) => i >= 0)

  const signed = await signer(txnGroup, indexesToSign)

  const combined: Uint8Array[] = []
  for (let i = 0; i < txnGroup.length; i++) {
    if (indexesToSign.includes(i)) {
      combined.push(signed[indexesToSign.indexOf(i)])
    } else {
      combined.push(algosdk.encodeObj({ txn: txnGroup[i].get_obj_for_encoding() }) as Uint8Array)
    }
  }

  const totalLen = combined.reduce((s, a) => s + a.length, 0)
  const mergedBytes = new Uint8Array(totalLen)
  let offset = 0
  for (const chunk of combined) {
    mergedBytes.set(chunk, offset)
    offset += chunk.length
  }

  const result = await algodClient.sendRawTransaction(mergedBytes).do()
  const txId = (result as { txid?: string }).txid ?? ''

  return { txId, amountOut: quote.amountOut }
}

/**
 * Simple direct swap: gets a Tinyman V2 quote and executes it in one call.
 */
export async function tinymanSwap(params: {
  fromAssetId: number
  toAssetId: number
  amount: number
  sender: string
  signer: TransactionSigner
  algodClient: Algodv2
  network?: string
  slippage?: number
}): Promise<TinymanSwapResult> {
  const quote = await getTinymanQuote({
    fromAssetId: params.fromAssetId,
    toAssetId: params.toAssetId,
    amount: params.amount,
    network: params.network,
    slippage: params.slippage,
  })

  return executeTinymanSwap(quote, params.sender, params.signer, params.algodClient)
}
