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
 * Wraps a @txnlab/use-wallet TransactionSigner into the InitiatorSigner
 * format expected by the Tinyman SDK.
 *
 * Converts SDK Transaction objects to our algosdk via toByte() bridge.
 */
function wrapWalletSigner(walletSigner: TransactionSigner, senderAddr: string): InitiatorSigner {
  return async (txGroups: SignerTransaction[][]): Promise<Uint8Array[]> => {
    const allSignedTxns: Uint8Array[] = []

    for (const group of txGroups) {
      const ourTxns = group.map((item) => {
        const bytes = (item.txn as unknown as { toByte: () => Uint8Array }).toByte()
        return algosdk.decodeUnsignedTransaction(bytes)
      })

      const indexesToSign = group
        .map((item, i) => {
          if (!item.signers || item.signers.length === 0) return -1
          return item.signers.includes(senderAddr) ? i : -1
        })
        .filter((i) => i >= 0)

      if (indexesToSign.length === 0) continue

      const walletSigned = await walletSigner(ourTxns, indexesToSign)
      for (const signed of walletSigned) {
        allSignedTxns.push(signed)
      }
    }

    return allSignedTxns
  }
}

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

  const initiatorSigner = wrapWalletSigner(signer, sender)

  const signedTxns = await Swap.v2.signTxns({
    txGroup,
    initiatorSigner,
  })

  console.log('[Tinyman] Signed', signedTxns.length, 'transactions, submitting...')

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
