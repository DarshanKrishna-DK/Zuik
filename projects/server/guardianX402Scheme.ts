import algosdk from 'algosdk'
import type {
  PaymentPayload,
  PaymentPayloadResult,
  PaymentRequirements,
  SchemeNetworkClient,
  SchemeNetworkFacilitator,
  SettleResponse,
  VerifyResponse,
} from '@x402-avm/core/types'
import { isExactAvmPayload } from '@x402-avm/avm'
import { MAX_ATOMIC_GROUP_SIZE } from '@x402-avm/avm'
import type { FacilitatorAvmSigner } from '@x402-avm/avm'
import type { TransactionSigner } from 'algosdk'
import { getAlgodClient } from './algorand.js'
import { buildSignedGuardianAlgoPaymentGroup } from './guardianPaymentGroup.js'
import { isRecipientAllowed, maxSpendableMicroAlgos, readGuardianContext } from './guardianPolicy.js'

function decodeTxnB64(encoded: string): Uint8Array {
  return new Uint8Array(Buffer.from(encoded, 'base64'))
}

function isAlgoAsset(asset: string | undefined): boolean {
  return asset === '0' || asset === ''
}

/** Read ALGO payment amount across algosdk transaction shapes. */
function payAmountMicroAlgos(txn: algosdk.Transaction): bigint {
  const raw = txn as algosdk.Transaction & {
    amount?: number | bigint
    payment?: { amount?: number | bigint }
  }
  const value = raw.payment?.amount ?? raw.amount ?? 0
  return BigInt(value)
}

type PaymentTxnFields = algosdk.Transaction & {
  payment?: { receiver?: string | Uint8Array | { publicKey: Uint8Array } }
  sender?: { publicKey: Uint8Array }
  from?: { publicKey: Uint8Array }
}

/** Read payment receiver across algosdk transaction shapes. */
function payReceiverAddress(txn: algosdk.Transaction): string {
  const raw = txn as PaymentTxnFields
  const receiver = raw.payment?.receiver
  if (typeof receiver === 'string') return receiver
  const receiverValue = receiver as unknown
  if (receiverValue instanceof Uint8Array) {
    return algosdk.encodeAddress(receiverValue)
  }
  if (receiver && typeof receiver === 'object' && 'publicKey' in receiver) {
    return algosdk.encodeAddress(receiver.publicKey)
  }
  return ''
}

/**
 * x402 client scheme that wraps ALGO payments in a Guardian authorize_trade atomic group.
 */
export class GuardianExactAvmClientScheme implements SchemeNetworkClient {
  readonly scheme = 'exact'

  constructor(
    private readonly agentAddress: string,
    private readonly signer: TransactionSigner,
    private readonly guardianAppId: number,
  ) {}

  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
  ): Promise<PaymentPayloadResult> {
    if (!isAlgoAsset(paymentRequirements.asset)) {
      throw new Error(
        `Guardian x402 client only supports ALGO (asset "0"); got asset ${paymentRequirements.asset}`,
      )
    }

    const amountMicroAlgos = BigInt(paymentRequirements.amount)
    const guardian = await readGuardianContext(this.guardianAppId, this.agentAddress)
    const headroom = maxSpendableMicroAlgos(guardian)
    if (guardian.blocked) {
      throw new Error(`Guardian blocked payment: ${guardian.blockReason ?? 'policy limit'}`)
    }
    if (amountMicroAlgos > headroom) {
      throw new Error(
        `Payment ${amountMicroAlgos} microAlgos exceeds Guardian headroom ${headroom}`,
      )
    }

    const payTo = paymentRequirements.payTo
    const allowed = await isRecipientAllowed(this.guardianAppId, payTo)
    if (!allowed) {
      throw new Error(`Recipient ${payTo.slice(0, 8)}... is not on the Guardian allowlist`)
    }

    const { paymentGroup, paymentIndex } = await buildSignedGuardianAlgoPaymentGroup({
      agentAddress: this.agentAddress,
      recipient: payTo,
      amountMicroAlgos,
      guardianAppId: this.guardianAppId,
      signer: this.signer,
      note: 'x402:premium',
    })

    return {
      x402Version,
      payload: { paymentGroup, paymentIndex },
    }
  }
}

/**
 * x402 facilitator scheme that verifies Guardian-wrapped ALGO payment groups.
 */
export class GuardianExactAvmFacilitatorScheme implements SchemeNetworkFacilitator {
  readonly scheme = 'exact'
  readonly caipFamily = 'algorand:*'

  constructor(
    private readonly signer: FacilitatorAvmSigner,
    private readonly guardianAppId: number,
  ) {}

  getExtra(_: string): Record<string, unknown> | undefined {
    return { guardianAppId: this.guardianAppId }
  }

  getSigners(_: string): string[] {
    return [...this.signer.getAddresses()]
  }

  async verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse> {
    const rawPayload = payload.payload
    if (!isExactAvmPayload(rawPayload)) {
      return { isValid: false, invalidReason: 'Invalid payload format' }
    }

    const { paymentGroup, paymentIndex } = rawPayload
    if (paymentGroup.length > MAX_ATOMIC_GROUP_SIZE) {
      return { isValid: false, invalidReason: 'Transaction group exceeds maximum size' }
    }
    if (paymentIndex < 0 || paymentIndex >= paymentGroup.length) {
      return { isValid: false, invalidReason: 'Payment index out of bounds' }
    }
    if (paymentGroup.length < 2) {
      return {
        isValid: false,
        invalidReason: 'Guardian payment group must include authorize_trade app call',
      }
    }

    let paymentStxn: algosdk.SignedTransaction
    try {
      paymentStxn = algosdk.decodeSignedTransaction(decodeTxnB64(paymentGroup[paymentIndex]))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { isValid: false, invalidReason: `Invalid payment transaction: ${msg}` }
    }

    const payTxn = paymentStxn.txn
    if (payTxn.type !== 'pay') {
      return { isValid: false, invalidReason: 'Guardian x402 requires ALGO payment transaction' }
    }
    if (!isAlgoAsset(requirements.asset)) {
      return { isValid: false, invalidReason: 'Requirements must specify ALGO asset "0"' }
    }

    const amount = payAmountMicroAlgos(payTxn)
    if (amount !== BigInt(requirements.amount)) {
      return {
        isValid: false,
        invalidReason: `Amount mismatch: expected ${requirements.amount}, got ${amount}`,
      }
    }

    const receiver = payReceiverAddress(payTxn)
    if (receiver !== requirements.payTo) {
      return {
        isValid: false,
        invalidReason: `Receiver mismatch: expected ${requirements.payTo}, got ${receiver}`,
      }
    }

    const payTxnFields = payTxn as PaymentTxnFields
    const senderKey = payTxnFields.sender?.publicKey ?? payTxnFields.from?.publicKey
    if (!senderKey) {
      return { isValid: false, invalidReason: 'Could not read payment sender address' }
    }
    const payer = algosdk.encodeAddress(senderKey)
    const guardianCtx = await readGuardianContext(this.guardianAppId, payer)
    if (guardianCtx.blocked) {
      return {
        isValid: false,
        invalidReason: `Guardian policy blocked: ${guardianCtx.blockReason ?? 'limit'}`,
      }
    }

    const signedTxns = paymentGroup.map((g) => decodeTxnB64(g))
    try {
      const simResult = await this.signer.simulateTransactions(signedTxns, requirements.network) as {
        txnGroups?: Array<{ failureMessage?: string }>
      }
      if (simResult.txnGroups?.[0]?.failureMessage) {
        return {
          isValid: false,
          invalidReason: `Simulation failed: ${simResult.txnGroups[0].failureMessage}`,
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { isValid: false, invalidReason: `Simulation failed: ${msg}` }
    }

    return { isValid: true, payer }
  }

  async settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse> {
    const verification = await this.verify(payload, requirements)
    if (!verification.isValid) {
      return {
        success: false,
        errorReason: verification.invalidReason,
        transaction: '',
        network: requirements.network,
        payer: verification.payer,
      }
    }

    const avmPayload = payload.payload
    if (!isExactAvmPayload(avmPayload)) {
      return {
        success: false,
        errorReason: 'Invalid payload format',
        transaction: '',
        network: requirements.network,
      }
    }

    const signedTxns = avmPayload.paymentGroup.map((g) => decodeTxnB64(g))
    try {
      const txId = await this.signer.sendTransactions(signedTxns, requirements.network)
      await this.signer.waitForConfirmation(txId, requirements.network, 4)
      return {
        success: true,
        transaction: txId,
        network: requirements.network,
        payer: verification.payer,
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return {
        success: false,
        errorReason: `Settlement failed: ${msg}`,
        transaction: '',
        network: requirements.network,
        payer: verification.payer,
      }
    }
  }
}

/** Facilitator signer backed by the Zuik server's Algod client (no fee-payer signing). */
export function createZuikFacilitatorSigner(): FacilitatorAvmSigner {
  const algod = getAlgodClient()
  return {
    getAddresses: () => [],
    signTransaction: async () => {
      throw new Error('Zuik Guardian facilitator does not sign fee payer transactions')
    },
    getAlgodClient: () => algod,
    simulateTransactions: async (txns: Uint8Array[], _network: string) => {
      const stxns = txns.map((bytes) => {
        try {
          return algosdk.decodeSignedTransaction(bytes)
        } catch {
          const txn = algosdk.decodeUnsignedTransaction(bytes)
          return { txn, sig: undefined } as algosdk.SignedTransaction
        }
      })
      const request = new algosdk.modelsv2.SimulateRequest({
        txnGroups: [
          new algosdk.modelsv2.SimulateRequestTransactionGroup({ txns: stxns }),
        ],
        allowEmptySignatures: true,
      })
      return algod.simulateTransactions(request).do()
    },
    sendTransactions: async (signedTxns: Uint8Array[]) => {
      const combined = Buffer.concat(signedTxns.map((t) => Buffer.from(t)))
      const postResult = await algod.sendRawTransaction(combined).do()
      return postResult.txid
    },
    waitForConfirmation: async (txId: string, _network: string, waitRounds = 4) => {
      return algosdk.waitForConfirmation(algod, txId, waitRounds)
    },
  }
}
