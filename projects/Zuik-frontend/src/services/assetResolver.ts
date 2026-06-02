import { readAssetParams } from '../utils/algosdkCompat'
import { getAlgodClient } from './algorand'
import { formatTokenDisplay, primeResolveCache, resolveAsset } from './tokenResolver'

const KNOWN_TESTNET: Record<number, string> = {
  0: 'ALGO',
  10458941: 'USDC',
}

const cache = new Map<number, string>()

for (const [id, name] of Object.entries(KNOWN_TESTNET)) {
  cache.set(Number(id), name)
}

export function resolveAssetNameSync(assetId: number | string | undefined): string {
  if (assetId === undefined || assetId === null) return 'ALGO'
  const id = Number(assetId)
  if (id === 0) return 'ALGO'
  return cache.get(id) ?? `Token (ID ${id})` // sync path; async resolveAssetName fills cache
}

export async function resolveAssetName(assetId: number): Promise<string> {
  if (assetId === 0) return 'ALGO'
  const cached = cache.get(assetId)
  if (cached) return cached

  try {
    const token = await resolveAsset(assetId)
    const name = formatTokenDisplay(token)
    cache.set(assetId, name)
    primeResolveCache(assetId, name)
    return name
  } catch {
    try {
      const algod = getAlgodClient()
      const info = await algod.getAssetByID(BigInt(assetId)).do()
      const params = readAssetParams(info)
      const name = (params.unitName as string | undefined)
        ?? (params['unit-name'] as string | undefined)
        ?? (params.name as string | undefined)
        ?? `Token (ID ${assetId})`
      cache.set(assetId, name)
      return name
    } catch {
      const label = `Token (ID ${assetId})`
      cache.set(assetId, label)
      return label
    }
  }
}

export async function preloadAssetNames(assetIds: number[]): Promise<void> {
  const unknown = assetIds.filter((id) => id !== 0 && !cache.has(id))
  await Promise.allSettled(unknown.map(resolveAssetName))
}
