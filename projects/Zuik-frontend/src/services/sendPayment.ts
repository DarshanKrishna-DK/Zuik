import { microAlgo } from '@algorandfoundation/algokit-utils'
import algosdk, { type TransactionSigner } from 'algosdk'
import { getAlgorandClient, getAlgodClient } from './algorand'
import {
  deserializeLogicSigWithMetadata,
  migrateLegacyLogicSigVault,
  type LogicSigVaultRow,
} from './logicSigDelegation'
import { agentWalletApi } from './agentWalletApi'

export interface SendPaymentParams {
  sender: string
  receiver: string
  amount: number | bigint
  assetId?: number
  note?: string
  signer: TransactionSigner
  vault?: LogicSigVaultRow
}

export interface SendPaymentResult {
  txId: string
  confirmedRound: number
}

/**
 * Send ALGO or ASA. When vault is provided, uses delegation mode:
 * transaction is FROM the user's wallet, authorized by the stored LogicSig.
 */
export async function sendPayment(params: SendPaymentParams): Promise<SendPaymentResult> {
  const { sender, receiver, amount, assetId = 0, note, vault } = params

  console.log('[DIAGNOSTIC PAYMENT] Received parameters:', {
    sender,
    receiver,
    amount,
    assetId,
    note: note ? 'present' : 'none',
    hasVault: !!vault,
    vaultId: vault?.id
  })

  try {
    if (vault) {
      console.log('[DIAGNOSTIC PAYMENT] ✅ USING LOGICSIG DELEGATION')
      console.log('[DIAGNOSTIC PAYMENT] Vault details:', {
        id: vault.id,
        maxPerTrade: vault.max_per_trade,
        allowedAsset: vault.allowed_from_asset,
        expiryRound: vault.expiry_round,
        isActive: vault.is_active,
      })
      return await sendPaymentWithDelegation({
        sender,
        receiver,
        amount,
        assetId,
        note,
        vault,
      })
    }

    console.log('[DIAGNOSTIC PAYMENT] ❌ NO VAULT - FALLING BACK TO MANUAL SIGNING')
    const algorand = getAlgorandClient()
    const { signer } = params

    if (assetId === 0 || assetId === undefined) {
      const result = await algorand.send.payment({
        signer,
        sender,
        receiver,
        amount: typeof amount === 'bigint' ? microAlgo(amount) : microAlgo(Number(amount)),
        note: note ? new TextEncoder().encode(note) : undefined,
      })
      return {
        txId: result.txIds[0] ?? '',
        confirmedRound: Number(result.confirmation?.confirmedRound ?? 0),
      }
    }

    const result = await algorand.send.assetTransfer({
      signer,
      sender,
      receiver,
      assetId: BigInt(assetId),
      amount: typeof amount === 'bigint' ? amount : BigInt(amount),
      note: note ? new TextEncoder().encode(note) : undefined,
    })
    return {
      txId: result.txIds[0] ?? '',
      confirmedRound: Number(result.confirmation?.confirmedRound ?? 0),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Send payment failed: ${message}`)
  }
}

async function sendPaymentWithDelegation(
  params: Omit<SendPaymentParams, 'signer'> & { vault: LogicSigVaultRow },
): Promise<SendPaymentResult> {
  const { sender, receiver, amount, assetId = 0, note, vault } = params
  
  console.log('[SENDPAYMENT DEBUG] Starting delegation with params:', {
    sender, receiver, amount, assetId, note, vaultId: vault?.id
  })
  
  try {

  if (sender !== vault.wallet_address) {
    throw new Error('Delegation sender must match vault owner wallet')
  }

  console.log('[SENDPAYMENT DEBUG] About to calculate baseAmount. amount:', amount, 'typeof amount:', typeof amount)
  
  // Let's try using the official algosdk approach instead of raw BigInt
  // The amount is in microAlgos, so we'll just use it directly
  const baseAmount = typeof amount === 'bigint' ? amount : Number(amount)
  console.log('[SENDPAYMENT DEBUG] Using number instead of BigInt - baseAmount:', baseAmount, 'typeof baseAmount:', typeof baseAmount)
  const maxPerTrade = BigInt(vault.max_per_trade)
  if (baseAmount > maxPerTrade) {
    throw new Error(`Amount exceeds delegation max per trade (${vault.max_per_trade})`)
  }

  const allowedAsset = Number(vault.allowed_from_asset)
  if (allowedAsset !== assetId) {
    throw new Error(`Delegation allows asset ${allowedAsset}, not ${assetId}`)
  }

  // Fix: Use correct SuggestedParams interface properties based on official algosdk documentation
  console.log('[SENDPAYMENT DEBUG] Using hardcoded suggested params with correct interface')
  const currentRound = 63898032  // Confirmed current TestNet round
  const suggestedParams = {
    fee: 1000,
    firstValid: currentRound,         // Correct: firstValid (not firstRound)
    lastValid: currentRound + 1000,   // Correct: lastValid (not lastRound)
    minFee: 1000,                     // REQUIRED: was missing, causing "Value is undefined" error
    genesisHash: algosdk.base64ToBytes('SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI='), // Correct: Uint8Array using algosdk
    genesisID: 'testnet-v1.0',
    flatFee: true
  }
  console.log('[SENDPAYMENT DEBUG] Using rounds:', currentRound, 'to', currentRound + 1000)
  console.log('[SENDPAYMENT DEBUG] ✅ Fixed SuggestedParams with minFee:', suggestedParams.minFee)

  const noteBytes = note ? new TextEncoder().encode(note) : undefined
  
  console.log('[SENDPAYMENT DEBUG] Transaction parameters:')
  console.log('[SENDPAYMENT DEBUG] - sender:', sender, typeof sender)
  console.log('[SENDPAYMENT DEBUG] - receiver:', receiver, typeof receiver)
  console.log('[SENDPAYMENT DEBUG] - baseAmount toString():', baseAmount.toString(), typeof baseAmount)
  console.log('[SENDPAYMENT DEBUG] - assetId:', assetId, typeof assetId)
  console.log('[SENDPAYMENT DEBUG] - noteBytes:', noteBytes, typeof noteBytes)
  console.log('[SENDPAYMENT DEBUG] - suggestedParams:', JSON.stringify(suggestedParams, null, 2))
  
  // Create the transaction parameters object and log it
  const txnParams = {
    sender,
    receiver,
    amount: baseAmount,
    note: noteBytes,
    suggestedParams,
  }
  
  console.log('[SENDPAYMENT DEBUG] About to create transaction with params:')
  console.log('[SENDPAYMENT DEBUG] - txnParams.sender:', txnParams.sender)
  console.log('[SENDPAYMENT DEBUG] - txnParams.receiver:', txnParams.receiver)
  console.log('[SENDPAYMENT DEBUG] - txnParams.amount toString():', txnParams.amount.toString())
  console.log('[SENDPAYMENT DEBUG] - txnParams.note:', txnParams.note)
  console.log('[SENDPAYMENT DEBUG] - txnParams.suggestedParams.fee:', txnParams.suggestedParams.fee)
  console.log('[SENDPAYMENT DEBUG] - txnParams.suggestedParams.firstRound:', txnParams.suggestedParams.firstRound)
  console.log('[SENDPAYMENT DEBUG] - txnParams.suggestedParams.lastRound:', txnParams.suggestedParams.lastRound)
  
  const txn = assetId === 0
    ? algosdk.makePaymentTxnWithSuggestedParamsFromObject(txnParams)
    : algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender,
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
  console.log('[NEW LOGICSIG] Using correct signLogicSigTransaction function')
  console.log('[NEW LOGICSIG] - Is delegated:', lsigAccount.isDelegated())
  console.log('[NEW LOGICSIG] - Address:', lsigAccount.address().toString())
  console.log('[SENDPAYMENT DEBUG] Transaction object:', JSON.stringify(txn, null, 2))
  console.log('[SENDPAYMENT DEBUG] LogicSigAccount:', lsigAccount)
  console.log('[SENDPAYMENT DEBUG] About to call signLogicSigTransaction...')
  const signedTxn = algosdk.signLogicSigTransaction(txn, lsigAccount)
  console.log('[SENDPAYMENT DEBUG] ✅ Transaction signed successfully:', signedTxn)
  
  // Temporary fix: Use direct algod client for transaction submission
  const directAlgod = new algosdk.Algodv2('', 'https://testnet-api.algonode.cloud', '')
  console.log('[SENDPAYMENT DEBUG] Submitting transaction with direct algod client')
  console.log('[SENDPAYMENT DEBUG] signedTxn.blob length:', signedTxn.blob?.length)
  console.log('[SENDPAYMENT DEBUG] signedTxn.blob type:', typeof signedTxn.blob)
  
  if (!signedTxn.blob) {
    throw new Error('CRITICAL: signedTxn.blob is undefined - transaction signing failed!')
  }
  
  const submitResult = await directAlgod.sendRawTransaction(signedTxn.blob).do()
  console.log('[SENDPAYMENT DEBUG] Submit result:', submitResult)
  const txId = submitResult.txid
  console.log('[SENDPAYMENT DEBUG] ✅ Transaction submitted! TxID:', txId)
  const confirmation = await algosdk.waitForConfirmation(directAlgod, txId, 4)

  try {
    const amountInAlgo = assetId === 0 ? Number(baseAmount) / 1_000_000 : Number(baseAmount)
    await agentWalletApi.recordDelegation(sender, txId, amountInAlgo, receiver)
  } catch (recordError) {
    console.warn('Failed to record delegation transaction:', recordError)
  }

  return {
    txId,
    confirmedRound: Number(confirmation.confirmedRound ?? 0),
  }
  } catch (error) {
    console.error('[SENDPAYMENT DEBUG] ❌ CRITICAL ERROR in delegation:', error)
    console.error('[SENDPAYMENT DEBUG] Error type:', typeof error)
    console.error('[SENDPAYMENT DEBUG] Error constructor:', error?.constructor?.name)
    console.error('[SENDPAYMENT DEBUG] Error message:', error?.message)
    console.error('[SENDPAYMENT DEBUG] Error stack:', error?.stack)
    
    // Provide specific error information
    const errorMessage = error instanceof Error 
      ? `LogicSig delegation failed: ${error.message}` 
      : `LogicSig delegation failed: ${String(error)}`
    
    throw new Error(errorMessage)
  }
}
