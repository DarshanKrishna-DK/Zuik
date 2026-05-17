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

const DELEGATION_METHODS = {
  algo: algosdk.ABIMethod.fromSignature('verifyAlgoSpend(pay)void'),
  asset: algosdk.ABIMethod.fromSignature('verifyAssetSpend(axfer)void'),
}

function toBaseUnits(amount: number, decimals: number): bigint {
  const factor = 10 ** decimals
  return BigInt(Math.round(amount * factor))
}

export async function fetchActiveLogicSigVault(
  sb: SupabaseClient,
  walletAddress: string,
): Promise<LogicSigVaultRow | null> {
  const { data, error } = await sb
    .from('logic_sig_vaults')
    .select('*')
    .eq('wallet_address', walletAddress)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return data as LogicSigVaultRow
}

export async function executeDelegatedPayment(params: {
  vault: LogicSigVaultRow
  sender: string
  recipient: string
  amount: number
  assetId: number
  note?: string
}): Promise<string[]> {
  const { vault, sender, recipient, amount, assetId, note } = params

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

  const maxFee = Number(vault.max_fee || 1000)
  if (maxFee < 1000) {
    throw new Error('Delegation fee cap is below the network minimum fee.')
  }

  const lsigBytes = Uint8Array.from(Buffer.from(vault.lsig_account_b64, 'base64'))
  const lsigAccount = algosdk.LogicSigAccount.fromByte(lsigBytes)
  const signer = algosdk.makeLogicSigAccountTransactionSigner(lsigAccount)

  const algod = getAlgodClient()
  const suggestedParams = await algod.getTransactionParams().do()

  const spendParams = {
    ...suggestedParams,
    flatFee: true,
    fee: Math.min(maxFee, suggestedParams.fee),
  }

  const noteBytes = note ? new TextEncoder().encode(note) : undefined
  const spendTxn = assetId === 0
    ? algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender,
      receiver: recipient,
      amount: baseAmount,
      note: noteBytes,
      suggestedParams: spendParams,
    })
    : algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender,
      receiver: recipient,
      assetIndex: BigInt(assetId),
      amount: baseAmount,
      note: noteBytes,
      suggestedParams: spendParams,
    })

  const method = assetId === 0 ? DELEGATION_METHODS.algo : DELEGATION_METHODS.asset
  const appId = BigInt(vault.verifier_app_id)

  const atc = new algosdk.AtomicTransactionComposer()
  atc.addMethodCall({
    appID: appId,
    method,
    sender,
    signer,
    suggestedParams,
    methodArgs: [{ txn: spendTxn, signer }],
  })

  const result = await atc.execute(algod, 3)
  return result.txIDs
}
