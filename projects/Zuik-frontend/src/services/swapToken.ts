/**
 * Folks Router REST API integration for token swaps.
 *
 * NOTE: The Folks Router API may not be available on testnet. This is a placeholder
 * implementation; the actual swap will work when DEX pools exist on the target network.
 * See https://api.folksrouter.io for mainnet availability.
 */

import algosdk from 'algosdk'
import type { Algodv2 } from 'algosdk'
import type { TransactionSigner } from 'algosdk'

const FOLKS_ROUTER_API_BASE = 'https://api.folksrouter.io'

export type SwapType = 'FIXED_INPUT' | 'FIXED_OUTPUT'

export interface GetSwapQuoteParams {
  fromAssetId: number
  toAssetId: number
  amount: number | bigint
  swapType?: SwapType
  network?: string
}

export interface FolksQuoteResponse {
  quoteAmount?: number
  priceImpact?: number
  txnPayload?: string
  [key: string]: unknown
}

export interface ExecuteSwapParams {
  quote: FolksQuoteResponse
  sender: string
  signer: TransactionSigner
  algodClient: Algodv2
}

export interface ExecuteSwapResult {
  txId: string
  amountOut: number
}

/**
 * Fetch a swap quote from the Folks Router API.
 * Uses FIXED_INPUT by default (user specifies amount in, gets amount out).
 */
export async function getSwapQuote(params: GetSwapQuoteParams): Promise<FolksQuoteResponse> {
  const {
    fromAssetId,
    toAssetId,
    amount,
    swapType = 'FIXED_INPUT',
    network = 'testnet',
  } = params

  const amountStr = typeof amount === 'bigint' ? amount.toString() : String(amount)
  const url = new URL(`${FOLKS_ROUTER_API_BASE}/v1/fetch/quote`)
  url.searchParams.set('network', network)
  url.searchParams.set('fromAsset', String(fromAssetId))
  url.searchParams.set('toAsset', String(toAssetId))
  url.searchParams.set('amount', amountStr)
  url.searchParams.set('type', swapType)
  url.searchParams.set('maxGroupSize', '15')

  try {
    const res = await fetch(url.toString())
    if (!res.ok) {
      throw new Error(`Folks Router API error: ${res.status} ${res.statusText}`)
    }
    return (await res.json()) as FolksQuoteResponse
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Get swap quote failed: ${message}`)
  }
}

/**
 * Decode the base64 txnPayload from the quote, sign with the provided signer,
 * and submit to the network.
 */
export async function executeSwap(params: ExecuteSwapParams): Promise<ExecuteSwapResult> {
  const { quote, signer, algodClient } = params

  const txnPayload = quote.txnPayload
  if (!txnPayload || typeof txnPayload !== 'string') {
    throw new Error('Quote missing txnPayload')
  }

  try {
    const txnBytes = Uint8Array.from(atob(txnPayload), (c) => c.charCodeAt(0))

    let txns: algosdk.Transaction[]
    try {
      const decoded = algosdk.decodeUnsignedTransaction(txnBytes)
      txns = [decoded]
    } catch {
      const decoded = algosdk.decodeObj(txnBytes) as unknown
      if (Array.isArray(decoded)) {
        txns = decoded.map((item) => algosdk.decodeUnsignedTransaction(new Uint8Array(item as ArrayLike<number>)))
      } else {
        throw new Error('Unable to decode txnPayload')
      }
    }

    const indexesToSign = txns.map((_, i) => i)
    const signed = await signer(txns, indexesToSign)
    const combined = new Uint8Array(signed.reduce((acc, s) => acc + s.length, 0))
    let offset = 0
    for (const s of signed) {
      combined.set(s, offset)
      offset += s.length
    }
    const result = await algodClient.sendRawTransaction(combined).do()
    const txId = (result as { txid?: string }).txid ?? ''
    return { txId, amountOut: quote.quoteAmount ?? 0 }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Execute swap failed: ${message}`)
  }
}
