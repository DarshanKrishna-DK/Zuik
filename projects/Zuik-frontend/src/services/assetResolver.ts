import { getAlgodClient } from './algorand'

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
  return cache.get(id) ?? `ASA #${id}`
}

export async function resolveAssetName(assetId: number): Promise<string> {
  if (assetId === 0) return 'ALGO'
  const cached = cache.get(assetId)
  if (cached) return cached

  try {
    const algod = getAlgodClient()
    const info = await algod.getAssetByID(BigInt(assetId)).do()
    const params = info.params ?? info
    const name = (params as Record<string, unknown>).unitName as string
      ?? (params as Record<string, unknown>)['unit-name'] as string
      ?? (params as Record<string, unknown>).name as string
      ?? `ASA #${assetId}`
    cache.set(assetId, name)
    return name
  } catch {
    const label = `ASA #${assetId}`
    cache.set(assetId, label)
    return label
  }
}

export async function preloadAssetNames(assetIds: number[]): Promise<void> {
  const unknown = assetIds.filter((id) => id !== 0 && !cache.has(id))
  await Promise.allSettled(unknown.map(resolveAssetName))
}
