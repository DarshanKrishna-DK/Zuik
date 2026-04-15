/**
 * Tinyman V2 AMM integration using the official @tinymanorg/tinyman-js-sdk.
 *
 * Uses DIRECT pool swap (2 transactions) instead of the swap router (6 txns)
 * to avoid testnet issues with unfunded intermediary accounts.
 */

import {
  poolUtils,
  Swap,
  SwapType,
  type SwapQuote,
  type SignerTransaction,
} from '@tinymanorg/tinyman-js-sdk'
import type { InitiatorSigner, SupportedNetwork } from '@tinymanorg/tinyman-js-sdk'
import algosdk from 'algosdk'
import type { Algodv2, TransactionSigner } from 'algosdk'
import { getAlgodClient } from './algorand'

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
  sdkQuote: SwapQuote
}

export interface TinymanSwapResult {
  txId: string
  amountOut: number
}

async function getAssetDecimals(client: Algodv2, assetId: number): Promise<number> {
  if (assetId === 0) return 6
  try {
    const info = await client.getAssetByID(BigInt(assetId)).do()
    return Number((info as Record<string, unknown>).decimals ?? (info as Record<string, Record<string, unknown>>).params?.decimals ?? 6)
  } catch {
    return 6
  }
}

export async function getTinymanQuote(params: TinymanQuoteParams): Promise<TinymanQuote> {
  const {
    fromAssetId,
    toAssetId,
    amount,
    network = 'testnet',
    slippage = 0.5,
  } = params

  const client = getAlgodClient()
  const net = network as SupportedNetwork

  const pool = await poolUtils.v2.getPoolInfo({
    network: net,
    client: client as unknown as Parameters<typeof poolUtils.v2.getPoolInfo>[0]['client'],
    asset1ID: fromAssetId,
    asset2ID: toAssetId,
  })

  if (!pool || !pool.account || pool.status !== 'ready') {
    throw new Error(`No Tinyman V2 pool found for ${fromAssetId} <-> ${toAssetId} on ${network}`)
  }

  const [fromDecimals, toDecimals] = await Promise.all([
    getAssetDecimals(client, fromAssetId),
    getAssetDecimals(client, toAssetId),
  ])

  const amountBigint = typeof amount === 'bigint' ? amount : BigInt(amount)
  const sdkSlippage = slippage / 100

  const directQuote = Swap.v2.getFixedInputDirectSwapQuote({
    pool,
    amount: amountBigint,
    assetIn: { id: fromAssetId, decimals: fromDecimals },
    assetOut: { id: toAssetId, decimals: toDecimals },
  })

  const sdkQuote: SwapQuote = {
    type: 'direct' as SwapQuote['type'],
    data: { quote: directQuote, pool },
  } as SwapQuote

  const amountOut = Number(directQuote.assetOutAmount)
  const amountOutMin = Math.floor(amountOut * (1 - sdkSlippage))

  let poolAddr = ''
  try {
    const acct = pool.account as { address?: () => string; toString?: () => string }
    poolAddr = acct?.address?.() ?? acct?.toString?.() ?? ''
  } catch { /* ignore */ }

  return {
    amountIn: Number(amountBigint),
    amountOut,
    amountOutMin,
    priceImpact: directQuote.priceImpact,
    poolAddress: poolAddr,
    sdkQuote,
  }
}

/**
 * Tinyman returns SignerTransaction[] { txn, signers }; use-wallet expects algosdk.Transaction[].
 * Bridge via bytes when needed (algosdk version / txn class mismatches).
 */
function signerTransactionToAlgosdkTxn(st: SignerTransaction): algosdk.Transaction {
  const t = st.txn as algosdk.Transaction & { toByte?: () => Uint8Array }
  if (typeof t.toByte === 'function') {
    try {
      return algosdk.decodeUnsignedTransaction(t.toByte())
    } catch {
      /* fall through */
    }
  }
  return t
}

/**
 * Execute a Tinyman V2 swap directly via pool interaction (2 transactions).
 * Signs with the wallet using plain algosdk.Transaction[] (Pera-compatible).
 */

export async function executeTinymanSwap(
  quote: TinymanQuote,
  sender: string,
  signer: TransactionSigner,
  algodClient: Algodv2,
): Promise<TinymanSwapResult> {
  const network = (import.meta.env.VITE_ALGOD_NETWORK ?? 'testnet') as SupportedNetwork
  const slippage = 0.005

  console.log('[Tinyman] Generating swap txns for sender:', sender)

  const txGroup = await Swap.v2.generateTxns({
    client: algodClient as unknown as Parameters<typeof Swap.v2.generateTxns>[0]['client'],
    network,
    quote: quote.sdkQuote,
    swapType: SwapType.FixedInput,
    slippage,
    initiatorAddr: sender,
  })

  console.log('[Tinyman] Generated', txGroup.length, 'transactions')

  // Wait 2 seconds before requesting user signature to prevent Pera wallet conflicts
  console.log('[Tinyman] Waiting 2s before requesting signature...')
  await new Promise(resolve => setTimeout(resolve, 2000))

  const unsignedTxns = txGroup.map(signerTransactionToAlgosdkTxn)
  const indexesToSign = txGroup
    .map((st, i) => {
      if (st.signers !== undefined && st.signers.length === 0) return -1
      if (st.signers && !st.signers.includes(sender)) return -1
      return i
    })
    .filter((i): i is number => i >= 0)

  console.log('[Tinyman] Signing', indexesToSign.length, 'txn(s) at indices', indexesToSign.join(','))

  let signedTxns: Uint8Array[]
  try {
    signedTxns = await signer(unsignedTxns, indexesToSign)
    console.log('[Tinyman] Signed', signedTxns.length, 'transaction blob(s)')
  } catch (err) {
    console.error('[Tinyman] Signing error:', err)
    throw new Error(`Failed to sign Tinyman transactions: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Submit the signed transactions
  console.log('[Tinyman] Submitting signed transactions...')
  const result = await Swap.v2.execute({
    client: algodClient as unknown as Parameters<typeof Swap.v2.execute>[0]['client'],
    quote: quote.sdkQuote,
    txGroup,
    signedTxns,
  })

  console.log('[Tinyman] Swap executed, txnID:', result.txnID)

  return {
    txId: result.txnID ?? '',
    amountOut: quote.amountOut,
  }
}
