import { microAlgo } from '@algorandfoundation/algokit-utils'
import algosdk, { type TransactionSigner } from 'algosdk'
import { getAlgorandClient, getAlgodClient } from './algorand'
import { getActiveLogicSigVault, type LogicSigVaultRow } from './logicSigDelegation'

export interface SendPaymentParams {
  sender: string
  receiver: string
  amount: number | bigint
  assetId?: number
  note?: string
  signer: TransactionSigner
  vault?: LogicSigVaultRow // Add vault for LogicSig delegation
  userSigner?: TransactionSigner // User's original signer for funding transactions
}

export interface SendPaymentResult {
  txId: string
  confirmedRound: number
}

/**
 * Send ALGO or ASA to an address.
 * If assetId is 0 or undefined, sends ALGO payment.
 * If assetId > 0, sends ASA transfer.
 * Amount should be in base units (microAlgo for ALGO).
 * If vault is provided, creates LogicSig delegation transaction group.
 */
export async function sendPayment(params: SendPaymentParams): Promise<SendPaymentResult> {
  const { sender, receiver, amount, assetId = 0, note, signer, vault, userSigner } = params

  try {
    // If vault is provided, use LogicSig delegation with transaction group
    if (vault) {
      return await sendPaymentWithLogicSigDelegation({
        sender,
        receiver,
        amount,
        assetId,
        note,
        signer,
        vault,
        userSigner,
      })
    }

    // Standard payment without delegation
    const algorand = getAlgorandClient()

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

/**
 * Creates proper LogicSig delegation transaction group: [Payment/AssetTransfer, ApplicationCall]
 * Ensures LogicSig address has sufficient funds before executing delegation.
 */
async function sendPaymentWithLogicSigDelegation(params: SendPaymentParams & { vault: LogicSigVaultRow }): Promise<SendPaymentResult> {
  const { sender, receiver, amount, assetId = 0, note, signer, vault, userSigner } = params
  
  console.log(`[LogicSig] Creating delegation transaction group for asset ${assetId}`)
  
  const algod = getAlgodClient()
  const suggestedParams = await algod.getTransactionParams().do()
  
  const baseAmount = typeof amount === 'bigint' ? amount : BigInt(amount)
  const noteBytes = note ? new TextEncoder().encode(note) : undefined

  // Check if LogicSig address has sufficient funds
  const lsigAccountInfo = await algod.accountInformation(vault.lsig_address).do()
  const lsigBalance = BigInt(lsigAccountInfo.amount)
  const minBalanceRequired = BigInt(lsigAccountInfo['min-balance'] || 100000)
  const estimatedFees = BigInt(2000) // 2 transactions * 1000 microAlgo each
  const totalNeeded = minBalanceRequired + estimatedFees + (assetId === 0 ? baseAmount : BigInt(0))
  
  console.log(`[LogicSig] LogicSig balance: ${lsigBalance} microAlgo`)
  console.log(`[LogicSig] Required: ${totalNeeded} microAlgo (${minBalanceRequired} min + ${estimatedFees} fees + ${assetId === 0 ? baseAmount : 0n} payment)`)
  
  if (lsigBalance < totalNeeded) {
    const fundingNeeded = totalNeeded - lsigBalance
    console.log(`[LogicSig] 💰 Funding LogicSig address with ${fundingNeeded} microAlgo...`)
    
    // Fund the LogicSig address from user's wallet - MUST use user's signer, NOT LogicSig signer
    const fundingTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender, // User's wallet as sender
      receiver: vault.lsig_address, // LogicSig address as receiver
      amount: fundingNeeded,
      note: new TextEncoder().encode('LogicSig funding for delegation'),
      suggestedParams,
    })
    
    // Use userSigner for funding transaction (user's wallet pays), signer for LogicSig delegation
    console.log(`[LogicSig] Debug: userSigner provided:`, !!userSigner)
    console.log(`[LogicSig] Debug: signer provided:`, !!signer)
    
    if (!userSigner) {
      throw new Error(`[LogicSig] userSigner required for funding transaction`)
    }
    
    console.log(`[LogicSig] Using user's wallet signer for funding transaction`)
    const signedFunding = await userSigner([fundingTxn], [0])
    const fundingResult = await algod.sendRawTransaction(signedFunding[0]!).do()
    await algosdk.waitForConfirmation(algod, fundingResult.txid, 4)
    
    console.log(`[LogicSig] ✅ LogicSig funded with txID: ${fundingResult.txid}`)
  } else {
    console.log(`[LogicSig] ✅ LogicSig has sufficient funds`)
  }

  // Create the payment/asset transfer transaction (index 0) 
  // IMPORTANT: LogicSig delegation means transactions are sent FROM the LogicSig address
  const spendTxn = assetId === 0 
    ? algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: vault.lsig_address, // LogicSig address as sender
        receiver,
        amount: baseAmount,
        note: noteBytes,
        suggestedParams,
      })
    : algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: vault.lsig_address, // LogicSig address as sender
        receiver,
        assetIndex: BigInt(assetId),
        amount: baseAmount,
        note: noteBytes,
        suggestedParams,
      })

  // Create the verifier application call transaction (index 1)
  const method = assetId === 0 
    ? algosdk.ABIMethod.fromSignature('verifyAlgoSpend(pay)void')
    : algosdk.ABIMethod.fromSignature('verifyAssetSpend(axfer)void')
  
  const appCallTxn = algosdk.makeApplicationNoOpTxnFromObject({
    sender: vault.lsig_address, // LogicSig address as sender
    appIndex: BigInt(vault.verifier_app_id),
    appArgs: [method.getSelector()],
    suggestedParams,
  })

  // Create transaction group: [Payment/AssetTransfer, ApplicationCall]
  const txnGroup = [spendTxn, appCallTxn]
  algosdk.assignGroupID(txnGroup)
  
  console.log(`[LogicSig] Created group: [${spendTxn.type} at index 0, ${appCallTxn.type} at index 1]`)
  console.log(`[LogicSig] Both transactions have sender: ${vault.lsig_address}`)

  // Use the LogicSig signer to sign both transactions
  const signedTxns = await signer(txnGroup, [0, 1])
  
  // Submit the transaction group
  const txnBlobs = signedTxns.filter((txn): txn is Uint8Array => txn !== null)
  const submitResult = await algod.sendRawTransaction(txnBlobs).do()
  
  console.log(`[LogicSig] Group submitted, txID: ${submitResult.txid}`)
  
  // Wait for confirmation
  const txId = txnGroup[0].txID()
  const confirmation = await algosdk.waitForConfirmation(algod, txId, 4)
  
  console.log(`[LogicSig] ✅ Group confirmed at round ${confirmation.confirmedRound}`)
  
  return {
    txId,
    confirmedRound: Number(confirmation.confirmedRound ?? 0),
  }
}
