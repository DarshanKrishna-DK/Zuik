/**
 * Multi-DEX swap aggregation for Algorand.
 *
 * Strategy:
 *   1. Tinyman V2 SDK (reads pool state from chain - works on testnet)
 *   2. Folks Router V2 API (aggregator)
 *   3. Error if neither returns a valid quote
 */

import algosdk from 'algosdk'
import type { Algodv2 } from 'algosdk'
import type { TransactionSigner } from 'algosdk'
import { getTinymanQuote, executeTinymanSwap, type TinymanQuote } from './tinymanSwap'

export type SwapType = 'FIXED_INPUT' | 'FIXED_OUTPUT'

export interface GetSwapQuoteParams {
  fromAssetId: number
  toAssetId: number
  amount: number | bigint
  swapType?: SwapType
  network?: string
  slippage?: number
}

export interface SwapQuoteResponse {
  quoteAmount: number
  priceImpact: number
  source: 'tinyman' | 'folks-router'
  _tinymanQuote?: TinymanQuote
  _folksTxnPayload?: string
}

export interface ExecuteSwapParams {
  quote: SwapQuoteResponse
  sender: string
  signer: TransactionSigner
  algodClient: Algodv2
}

export interface ExecuteSwapResult {
  txId: string
  amountOut: number
}

function folksBaseUrl(network: string): string {
  if (network === 'testnet') return 'https://api.folksrouter.io/testnet/v2'
  return 'https://api.folksrouter.io/v2'
}

async function fetchFolksQuote(params: GetSwapQuoteParams): Promise<SwapQuoteResponse | null> {
  const {
    fromAssetId,
    toAssetId,
    amount,
    swapType = 'FIXED_INPUT',
    network = 'testnet',
  } = params

  const amountStr = typeof amount === 'bigint' ? amount.toString() : String(amount)
  const base = folksBaseUrl(network)
  const url = new URL(`${base}/fetch/quote`)
  url.searchParams.set('network', network)
  url.searchParams.set('fromAsset', String(fromAssetId))
  url.searchParams.set('toAsset', String(toAssetId))
  url.searchParams.set('amount', amountStr)
  url.searchParams.set('type', swapType)
  url.searchParams.set('maxGroupSize', '15')

  try {
    const res = await fetch(url.toString())
    if (!res.ok) return null
    const data = await res.json() as Record<string, unknown>

    const result = (data.result ?? data) as Record<string, unknown>
    if (!result.quoteAmount && !result.txnPayload) return null

    return {
      quoteAmount: Number(result.quoteAmount ?? 0),
      priceImpact: Number(result.priceImpact ?? 0),
      source: 'folks-router',
      _folksTxnPayload: result.txnPayload as string | undefined,
    }
  } catch {
    return null
  }
}

async function fetchTinymanQuote(params: GetSwapQuoteParams): Promise<SwapQuoteResponse | null> {
  try {
    const tq = await getTinymanQuote({
      fromAssetId: params.fromAssetId,
      toAssetId: params.toAssetId,
      amount: params.amount,
      network: params.network,
      slippage: params.slippage ?? 0.5,
    })
    return {
      quoteAmount: tq.amountOut,
      priceImpact: tq.priceImpact,
      source: 'tinyman',
      _tinymanQuote: tq,
    }
  } catch (e) {
    console.warn('[SwapToken] Tinyman quote failed:', e instanceof Error ? e.message : e)
    return null
  }
}

/**
 * Multi-DEX quote: tries Tinyman first (on-chain pool state), then Folks Router.
 */
export async function getSwapQuote(params: GetSwapQuoteParams): Promise<SwapQuoteResponse> {
  const network = params.network ?? 'testnet'

  const tinymanQuote = await fetchTinymanQuote({ ...params, network })
  if (tinymanQuote) return tinymanQuote

  const folksQuote = await fetchFolksQuote({ ...params, network })
  if (folksQuote) return folksQuote

  throw new Error(
    `No DEX returned a valid quote for asset ${params.fromAssetId} -> ${params.toAssetId}. ` +
    `The trading pair may not have liquidity on ${network}.`,
  )
}

/**
 * Execute a swap using the quote's source DEX.
 */
export async function executeSwap(params: ExecuteSwapParams): Promise<ExecuteSwapResult> {
  const { quote, sender, signer, algodClient } = params

  if (quote.source === 'tinyman' && quote._tinymanQuote) {
    return executeTinymanSwap(quote._tinymanQuote, sender, signer, algodClient)
  }

  if (quote.source === 'folks-router' && quote._folksTxnPayload) {
    return executeFolksSwap(quote._folksTxnPayload, sender, signer, algodClient, quote.quoteAmount)
  }

  throw new Error('Invalid quote: no executable transaction data')
}

async function executeFolksSwap(
  txnPayload: string,
  _sender: string,
  signer: TransactionSigner,
  algodClient: Algodv2,
  quoteAmount: number,
): Promise<ExecuteSwapResult> {
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
      throw new Error('Unable to decode Folks Router txnPayload')
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
  return { txId, amountOut: quoteAmount }
}
