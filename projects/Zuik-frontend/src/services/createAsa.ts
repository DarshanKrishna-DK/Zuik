import type { TransactionSigner } from 'algosdk'
import { getAlgorandClient } from './algorand'

export interface CreateAsaParams {
  sender: string
  name: string
  unitName: string
  totalSupply: number
  decimals: number
  url?: string
  signer: TransactionSigner
}

export interface CreateAsaResult {
  txId: string
  assetId: number
}

/**
 * Create a new Algorand Standard Asset.
 * The sender becomes the creator and receives all units.
 */
export async function createAsa(params: CreateAsaParams): Promise<CreateAsaResult> {
  const { sender, name, unitName, totalSupply, decimals, url, signer } = params

  try {
    const totalBaseUnits = BigInt(Math.floor(totalSupply * 10 ** decimals))

    const algorand = getAlgorandClient()
    const result = await algorand.send.assetCreate({
      signer,
      sender,
      total: totalBaseUnits,
      decimals,
      assetName: name,
      unitName,
      url,
      manager: sender,
      reserve: sender,
    })

    return {
      txId: result.txIds[0] ?? '',
      assetId: Number(result.assetId),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Create ASA failed: ${message}`)
  }
}
