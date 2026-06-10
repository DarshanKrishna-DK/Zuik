import algosdk, { type TransactionSigner } from 'algosdk'
import { getAlgodClient } from './algorand.js'
import { buildSignedGuardianAlgoPaymentGroup } from './guardianPaymentGroup.js'

export interface AuthorizedPaymentParams {
  agentAddress: string
  recipient: string
  amountMicroAlgos: number | bigint
  guardianAppId: number
  signer: TransactionSigner
  note?: string
}

export interface AuthorizedPaymentResult {
  txIds: string[]
  confirmedRound: number
}

/**
 * Build and submit the atomic group [pay(agent -> recipient), authorize_trade(pay)] on Guardian.
 *
 * All-or-nothing: if Guardian asserts fail, the payment reverts.
 */
export async function sendAuthorizedPayment(
  params: AuthorizedPaymentParams,
): Promise<AuthorizedPaymentResult> {
  const { agentAddress, recipient, amountMicroAlgos, guardianAppId, signer, note } = params

  if (!guardianAppId || guardianAppId <= 0) {
    throw new Error('Guardian app id is not configured for the agent execution context')
  }

  const amount = typeof amountMicroAlgos === 'bigint' ? amountMicroAlgos : BigInt(Math.round(Number(amountMicroAlgos)))
  if (amount <= 0n) {
    throw new Error('Payment amount must be a positive number of microAlgos')
  }

  const algod = getAlgodClient()
  const suggestedParams = await algod.getTransactionParams().do()
  const minFee = BigInt(suggestedParams.minFee ?? 1000)
  const acct = await algod.accountInformation(agentAddress).do()
  const balance = BigInt(acct.amount ?? 0)
  const minBalance = BigInt((acct as unknown as { minBalance?: number | bigint }).minBalance ?? 100_000)
  const requiredFees = minFee * 2n
  if (balance < amount + minBalance + requiredFees) {
    throw new Error(
      `Agent ${agentAddress.slice(0, 8)}... balance ${balance} microAlgos is too low for amount ${amount} ` +
        `+ min balance ${minBalance} + fees ${requiredFees}. Fund the agent sub-account.`,
    )
  }

  const { paymentGroup } = await buildSignedGuardianAlgoPaymentGroup({
    agentAddress,
    recipient,
    amountMicroAlgos: amount,
    guardianAppId,
    signer,
    note,
  })

  const signedTxns = paymentGroup.map((g) => new Uint8Array(Buffer.from(g, 'base64')))
  const combined = Buffer.concat(signedTxns.map((t) => Buffer.from(t)))
  const txIds = signedTxns.map((bytes) => {
    const stxn = algosdk.decodeSignedTransaction(bytes)
    return stxn.txn.txID()
  })
  await algod.sendRawTransaction(combined).do()
  const txId = txIds[0] ?? ''
  const confirmation = await algosdk.waitForConfirmation(algod, txId, 4)

  return {
    txIds,
    confirmedRound: Number(confirmation.confirmedRound ?? 0),
  }
}
