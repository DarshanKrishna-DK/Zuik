import type { TransactionSigner } from 'algosdk'
import { waitForConfirmation } from 'algosdk'
import { getAlgodClient, getAlgorandClient } from './algorand'

export interface OptInToAsaParams {
  sender: string
  assetId: number
  signer: TransactionSigner
}

export interface OptInToAsaResult {
  txId: string
  assetId: number
  alreadyOptedIn: boolean
}

/**
 * Opt in to an Algorand Standard Asset.
 * First checks if already opted in; if so, returns without sending a transaction.
 * Otherwise sends a zero-amount asset transfer to self.
 */
export async function optInToAsa(params: OptInToAsaParams): Promise<OptInToAsaResult> {
  const { sender, assetId, signer } = params

  try {
    const algod = getAlgodClient()
    const accountInfo = await algod.accountInformation(sender).do()

    const assetsRaw = accountInfo.assets
    const assetList = Array.isArray(assetsRaw)
      ? assetsRaw
      : assetsRaw && typeof assetsRaw === 'object'
        ? Object.values(assetsRaw)
        : []
    const alreadyOptedIn = assetList.some((a: unknown) => {
      const holding = a as { assetId?: number | bigint; 'asset-id'?: number }
      const id = holding.assetId ?? holding['asset-id']
      return id != null && Number(id) === assetId
    })

    if (alreadyOptedIn) {
      return { txId: '', assetId, alreadyOptedIn: true }
    }

    const algorand = getAlgorandClient()
    const result = await algorand.send.assetTransfer({
      signer,
      sender,
      receiver: sender,
      assetId: BigInt(assetId),
      amount: 0n,
    })

    const txId = result.txIds[0] ?? ''
    if (txId) {
      await waitForConfirmation(algod, txId, 8)
    }

    return {
      txId,
      assetId,
      alreadyOptedIn: false,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Opt-in to ASA failed: ${message}`)
  }
}
