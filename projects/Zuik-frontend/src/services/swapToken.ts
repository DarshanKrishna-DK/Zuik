/**
 * Multi-DEX swap aggregation for Algorand.
 *
 * Strategy: Tinyman V2 (testnet-compatible) -> Folks Router (mainnet) -> error.
 * On testnet, Tinyman V2 has real liquidity pools; Folks Router may not.
 */

import algosdk from 'algosdk'
import type { Algodv2 } from 'algosdk'
import type { TransactionSigner } from 'algosdk'
import { getTinymanQuote, executeTinymanSwap, type TinymanQuote } from './tinymanSwap'

const FOLKS_ROUTER_API_BASE = 'https://api.folksrouter.io'

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

async function fetchFolksQuote(params: GetSwapQuoteParams): Promise<SwapQuoteResponse | null> {
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
    if (!res.ok) return null
    const data = await res.json() as Record<string, unknown>
    if (!data.quoteAmount && !data.txnPayload) return null
    return {
      quoteAmount: Number(data.quoteAmount ?? 0),
      priceImpact: Number(data.priceImpact ?? 0),
      source: 'folks-router',
      _folksTxnPayload: data.txnPayload as string | undefined,
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
  } catch {
    return null
  }
}

/**
 * Multi-DEX quote: tries Tinyman first (better testnet support), then Folks Router.
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
