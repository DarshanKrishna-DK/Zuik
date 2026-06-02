import algosdk, { type TransactionSigner } from 'algosdk'
import { getAlgodClient } from './algorand.js'

/**
 * ABI method for Guardian atomic enforcement.
 * authorize_trade asserts the immediately-preceding PaymentTxn against the agent policy.
 */
const AUTHORIZE_TRADE_METHOD = algosdk.ABIMethod.fromSignature('authorize_trade(pay)void')

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
 * - index0: PaymentTxn from the agent sub-account (signed by the agent key).
 * - index1: Guardian authorize_trade app call referencing the payment (keeper == agent for MVP).
 *
 * All-or-nothing: if Guardian asserts fail, the payment reverts. Fee pooling sets the app call
 * fee to cover both transactions. Throws on Guardian rejection (caller logs, does NOT retry).
 */
export async function sendAuthorizedPayment(
  params: AuthorizedPaymentParams,
): Promise<AuthorizedPaymentResult> {
  const { agentAddress, recipient, amountMicroAlgos, guardianAppId, signer, note } = params

  if (!guardianAppId || guardianAppId <= 0) {
    throw new Error('Guardian app id is not configured for the agent execution context')
  }

  const algod = getAlgodClient()
  const suggestedParams = await algod.getTransactionParams().do()

  const amount = typeof amountMicroAlgos === 'bigint' ? amountMicroAlgos : BigInt(Math.round(Number(amountMicroAlgos)))
  if (amount <= 0n) {
    throw new Error('Payment amount must be a positive number of microAlgos')
  }

  // Preflight: ensure the agent balance covers the spend plus group fees before submitting.
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

  const paymentTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: agentAddress,
    receiver: recipient,
    amount,
    note: note ? new TextEncoder().encode(note) : undefined,
    suggestedParams: { ...suggestedParams, fee: 0, flatFee: true },
  })

  // App call carries the pooled fee for both transactions in the group.
  const appCallParams: algosdk.SuggestedParams = { ...suggestedParams, fee: minFee * 2n, flatFee: true }

  // Guardian stores per-agent policy in BoxMap(keyPrefix 'pol') and the recipient allowlist in
  // BoxMap(keyPrefix 'rcv'). Box keys are prefix bytes + the 32-byte public key. Both boxes the
  // contract reads MUST be declared as box references on the app call, or the AVM box_get fails.
  const enc = new TextEncoder()
  const policyBoxName = new Uint8Array([...enc.encode('pol'), ...algosdk.decodeAddress(agentAddress).publicKey])
  const recipientBoxName = new Uint8Array([...enc.encode('rcv'), ...algosdk.decodeAddress(recipient).publicKey])

  const composer = new algosdk.AtomicTransactionComposer()
  composer.addMethodCall({
    appID: guardianAppId,
    method: AUTHORIZE_TRADE_METHOD,
    sender: agentAddress,
    signer,
    suggestedParams: appCallParams,
    methodArgs: [{ txn: paymentTxn, signer }],
    appAccounts: [
      algosdk.decodeAddress(agentAddress),
      algosdk.decodeAddress(recipient),
    ],
    boxes: [
      { appIndex: 0, name: policyBoxName },
      { appIndex: 0, name: recipientBoxName },
    ],
  })

  const result = await composer.execute(algod, 4)
  return {
    txIds: result.txIDs,
    confirmedRound: Number(result.confirmedRound ?? 0),
  }
}
