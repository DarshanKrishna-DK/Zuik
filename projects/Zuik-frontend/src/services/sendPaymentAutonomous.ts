/**
 * Delegated payment execution - transactions are sent FROM the user's wallet
 * using a pre-signed LogicSig program (delegation mode, not contract account mode).
 */

import algosdk from 'algosdk'
import { getAlgodClient } from './algorand'
import {
  deserializeLogicSigWithMetadata,
  migrateLegacyLogicSigVault,
  type LogicSigVaultRow,
} from './logicSigDelegation'

export interface AutonomousPaymentParams {
  ownerAddress: string
  vault: LogicSigVaultRow
  receiver: string
  amount: number | bigint
  assetId?: number
  note?: string
}

export interface AutonomousPaymentResult {
  txId: string
  confirmedRound: number
  method: 'delegation'
}

export async function sendAutonomousPayment(
  params: AutonomousPaymentParams,
): Promise<AutonomousPaymentResult> {
  const { ownerAddress, vault, receiver, amount, assetId = 0, note } = params

  if (ownerAddress !== vault.wallet_address) {
    throw new Error('Vault owner does not match payment sender')
  }

  const baseAmount = typeof amount === 'bigint' ? amount : BigInt(Math.round(Number(amount)))
  const maxPerTrade = BigInt(vault.max_per_trade)
  if (baseAmount > maxPerTrade) {
    throw new Error(`Amount ${baseAmount} exceeds delegation max per trade ${maxPerTrade}`)
  }

  const allowedAsset = Number(vault.allowed_from_asset)
  if (allowedAsset !== assetId) {
    throw new Error(`Delegation allows asset ${allowedAsset}, not ${assetId}`)
  }

  const algod = getAlgodClient()
  const suggestedParams = await algod.getTransactionParams().do()
  const maxFee = Number(vault.max_fee || 2000)
  suggestedParams.fee = BigInt(Math.min(maxFee, Number(suggestedParams.fee ?? maxFee)))
  suggestedParams.flatFee = true

  const noteBytes = note ? new TextEncoder().encode(note) : undefined
  const txn = assetId === 0
    ? algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: ownerAddress,
        receiver,
        amount: baseAmount,
        note: noteBytes,
        suggestedParams,
      })
    : algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: ownerAddress,
        receiver,
        amount: baseAmount,
        assetIndex: BigInt(assetId),
        note: noteBytes,
        suggestedParams,
      })

  const { lsigAccount, format, canonicalB64 } = deserializeLogicSigWithMetadata(vault.lsig_account_b64)
  if (format === 'json' && canonicalB64 !== vault.lsig_account_b64) {
    await migrateLegacyLogicSigVault(vault.id, canonicalB64)
  }
  const signedTxn = algosdk.signLogicSigTransaction(txn, lsigAccount)
  const { txid } = await algod.sendRawTransaction(signedTxn.blob).do()
  const confirmation = await algosdk.waitForConfirmation(algod, txid, 4)

  return {
    txId: txid,
    confirmedRound: Number(confirmation.confirmedRound ?? 0),
    method: 'delegation',
  }
}
