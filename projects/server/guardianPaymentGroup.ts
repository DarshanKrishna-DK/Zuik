import algosdk, { type TransactionSigner } from 'algosdk'
import { getAlgodClient } from './algorand.js'

/** ABI method: authorize_trade(pay)void */
export const AUTHORIZE_TRADE_METHOD = algosdk.ABIMethod.fromSignature('authorize_trade(pay)void')

const enc = new TextEncoder()

export function guardianPolicyBoxName(agentAddress: string): Uint8Array {
  return new Uint8Array([...enc.encode('pol'), ...algosdk.decodeAddress(agentAddress).publicKey])
}

export function guardianRecipientBoxName(recipient: string): Uint8Array {
  return new Uint8Array([...enc.encode('rcv'), ...algosdk.decodeAddress(recipient).publicKey])
}

export interface GuardianAlgoPaymentGroupParams {
  agentAddress: string
  recipient: string
  amountMicroAlgos: number | bigint
  guardianAppId: number
  signer: TransactionSigner
  note?: string
}

/** Base64-encoded signed transaction blobs for an atomic [pay, authorize_trade] group. */
export interface GuardianAlgoPaymentGroupResult {
  paymentGroup: string[]
  paymentIndex: number
}

function toBase64Txn(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

// Atomic group: [pay, authorize_trade]. Guardian rejects anything over policy limits.
export async function buildSignedGuardianAlgoPaymentGroup(
  params: GuardianAlgoPaymentGroupParams,
): Promise<GuardianAlgoPaymentGroupResult> {
  const { agentAddress, recipient, guardianAppId, signer, note } = params
  const amount = typeof params.amountMicroAlgos === 'bigint'
    ? params.amountMicroAlgos
    : BigInt(Math.round(Number(params.amountMicroAlgos)))

  if (!guardianAppId || guardianAppId <= 0) {
    throw new Error('Guardian app id is not configured')
  }
  if (amount <= 0n) {
    throw new Error('Payment amount must be positive microAlgos')
  }

  const algod = getAlgodClient()
  const suggestedParams = await algod.getTransactionParams().do()
  const minFee = BigInt(suggestedParams.minFee ?? 1000)

  const paymentTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: agentAddress,
    receiver: recipient,
    amount,
    note: note ? enc.encode(note) : undefined,
    suggestedParams: { ...suggestedParams, fee: 0, flatFee: true },
  })

  const appCallParams: algosdk.SuggestedParams = {
    ...suggestedParams,
    fee: minFee * 2n,
    flatFee: true,
  }

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
      { appIndex: 0, name: guardianPolicyBoxName(agentAddress) },
      { appIndex: 0, name: guardianRecipientBoxName(recipient) },
    ],
  })

  const built = composer.buildGroup()
  const paymentGroup: string[] = []

  for (const { txn, signer: txnSigner } of built) {
    if (!txnSigner) {
      paymentGroup.push(toBase64Txn(algosdk.encodeUnsignedTransaction(txn)))
      continue
    }
    const signed = await txnSigner([txn], [0])
    const blob = signed[0]
    if (!blob) {
      throw new Error('Failed to sign Guardian payment group transaction')
    }
    paymentGroup.push(toBase64Txn(blob))
  }

  return { paymentGroup, paymentIndex: 0 }
}
