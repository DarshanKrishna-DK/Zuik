import algosdk from 'algosdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAlgodClient, getAssetDecimals } from './algorand.js'

export interface LogicSigVaultRow {
  id: string
  wallet_address: string
  lsig_address: string
  lsig_account_b64: string
  verifier_app_id: string
  allowed_from_asset: string
  max_per_trade: string
  daily_cap: string
  expiry_round: string
  max_fee: string
  allowed_dex_app_id: string
  is_active: boolean
}

function toBaseUnits(amount: number, decimals: number): bigint {
  return BigInt(Math.round(amount * 10 ** decimals))
}

function deserializeLogicSig(base64Bytes: string): algosdk.LogicSigAccount {
  const bytes = Buffer.from(base64Bytes, 'base64')
  try {
    return algosdk.LogicSigAccount.fromByte(bytes)
  } catch {
    try {
      const decodedText = new TextDecoder().decode(bytes).trim()
      if (!decodedText.startsWith('{')) {
        throw new Error('Legacy LogicSig payload not JSON')
      }
      const decoded = JSON.parse(decodedText) as {
        program: number[]
        args?: number[][]
        sig?: number[] | null
        sigkey?: number[] | null
      }
      if (!Array.isArray(decoded.program)) {
        throw new Error('Legacy LogicSig payload missing program')
      }
      const args = decoded.args ? decoded.args.map((arg) => new Uint8Array(arg)) : undefined
      const lsigAccount = new algosdk.LogicSigAccount(new Uint8Array(decoded.program), args)
      if (decoded.sig) {
        lsigAccount.lsig.sig = new Uint8Array(decoded.sig)
      }
      if (decoded.sigkey) {
        lsigAccount.sigkey = new Uint8Array(decoded.sigkey)
      }
      return lsigAccount
    } catch (error) {
      throw new Error(`Failed to deserialize LogicSigAccount: ${error.message}`)
    }
  }
}

export async function fetchActiveLogicSigVault(
  sb: SupabaseClient,
  walletAddress: string,
  assetId?: number,
): Promise<LogicSigVaultRow | null> {
  let query = sb
    .from('logic_sig_vaults')
    .select('*')
    .eq('wallet_address', walletAddress)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (assetId !== undefined) {
    query = query.eq('allowed_from_asset', String(assetId))
  }

  const { data, error } = await query.limit(1).maybeSingle()

  if (error || !data) return null
  return data as LogicSigVaultRow
}

/**
 * Execute a delegated payment FROM the user's wallet using their stored LogicSig.
 */
export async function executeDelegatedPayment(params: {
  vault: LogicSigVaultRow
  sender: string
  recipient: string
  amount: number
  assetId: number
  note?: string
}): Promise<string[]> {
  const { vault, sender, recipient, amount, assetId, note } = params

  if (sender !== vault.wallet_address) {
    throw new Error('Sender must match vault owner in delegation mode')
  }

  const allowedAsset = Number(vault.allowed_from_asset)
  if (allowedAsset !== assetId) {
    throw new Error(`Delegation only allows token ${allowedAsset}.`)
  }

  const decimals = await getAssetDecimals(assetId)
  const baseAmount = toBaseUnits(amount, decimals)
  const maxPerTrade = BigInt(vault.max_per_trade)
  if (baseAmount > maxPerTrade) {
    throw new Error(`Amount exceeds the delegation max per trade (${vault.max_per_trade}).`)
  }

  const maxFee = Number(vault.max_fee || 2000)
  const lsigAccount = deserializeLogicSig(vault.lsig_account_b64)
  const algod = getAlgodClient()
  const suggestedParams = await algod.getTransactionParams().do()
  suggestedParams.fee = BigInt(Math.min(maxFee, Number(suggestedParams.fee ?? maxFee)))
  suggestedParams.flatFee = true

  const noteBytes = note ? new TextEncoder().encode(note) : undefined
  const txn = assetId === 0
    ? algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender,
        receiver: recipient,
        amount: baseAmount,
        note: noteBytes,
        suggestedParams,
      })
    : algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender,
        receiver: recipient,
        assetIndex: BigInt(assetId),
        amount: baseAmount,
        note: noteBytes,
        suggestedParams,
      })

  const signedTxn = algosdk.signLogicSigTransaction(txn, lsigAccount)
  const submitResult = await algod.sendRawTransaction(signedTxn.blob).do()
  const txId = submitResult.txid
  await algosdk.waitForConfirmation(algod, txId, 4)

  return [txId]
}
