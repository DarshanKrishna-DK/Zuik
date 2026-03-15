import { microAlgo } from '@algorandfoundation/algokit-utils'
import type { TransactionSigner } from 'algosdk'
import { getAlgorandClient } from './algorand'

export interface SendPaymentParams {
  sender: string
  receiver: string
  amount: number | bigint
  assetId?: number
  note?: string
  signer: TransactionSigner
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
 */
export async function sendPayment(params: SendPaymentParams): Promise<SendPaymentResult> {
  const { sender, receiver, amount, assetId = 0, note, signer } = params

  try {
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
