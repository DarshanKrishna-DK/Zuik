import { readAssetParams, readAssetDecimals } from '../utils/algosdkCompat'
import { getAlgodClient, getIndexerClient } from './algorand'
import { fetchVestige } from './vestigeApi'

export interface ResolvedToken {
  id: number
  name: string
  unitName: string
  decimals: number
  total: number
  url: string
  creator: string
  manager: string
  reserve: string
  freeze: string
  clawback: string
  defaultFrozen: boolean
  createdAtRound?: number
}

export interface TokenSearchHit {
  id: number
  name: string
  unitName: string
  label: string
}

const ALGO_TOKEN: ResolvedToken = {
  id: 0,
  name: 'Algorand',
  unitName: 'ALGO',
  decimals: 6,
  total: 0,
  url: '',
  creator: '',
  manager: '',
  reserve: '',
  freeze: '',
  clawback: '',
  defaultFrozen: false,
}

const resolveCache = new Map<number, ResolvedToken>()
const SEARCH_CACHE_KEY = 'zuik_token_search_v1'
const SEARCH_TTL_MS = 10 * 60_000

function pickString(params: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const val = params[key]
    if (typeof val === 'string' && val.trim()) return val.trim()
  }
  return ''
}

function readTotal(params: Record<string, unknown>): number {
  const total = params.total
  if (typeof total === 'bigint') return Number(total)
  return Number(total ?? 0)
}

function readAssetIndex(info: unknown, fallback: number): number {
  const raw = info as Record<string, unknown>
  const index = raw.index ?? raw['asset-id']
  if (typeof index === 'bigint') return Number(index)
  if (typeof index === 'number' && Number.isFinite(index)) return index
  return fallback
}

/** Human-friendly label for UI (never raw "ASA undefined"). */
export function formatTokenDisplay(token: Pick<ResolvedToken, 'id' | 'name' | 'unitName'>): string {
  if (token.id === 0) return 'ALGO'
  const unit = token.unitName?.trim()
  const name = token.name?.trim()
  if (unit && !unit.startsWith('ID ') && unit !== `ASA #${token.id}`) return unit
  if (name && !name.startsWith('ASA #') && !name.startsWith('Token (')) return name
  return `Token (ID ${token.id})`
}

export async function resolveAsset(assetId: number): Promise<ResolvedToken> {
  if (assetId === 0) return ALGO_TOKEN

  const cached = resolveCache.get(assetId)
  if (cached) return cached

  const algod = getAlgodClient()
  const info = await algod.getAssetByID(BigInt(assetId)).do()
  const params = readAssetParams(info)

  let createdAtRound: number | undefined
  try {
    const indexer = getIndexerClient()
    const idxAsset = await indexer.lookupAssetByID(assetId).do()
    const asset = idxAsset.asset as unknown as Record<string, unknown> | undefined
    const round = asset?.['created-at-round'] ?? asset?.createdAtRound
    if (typeof round === 'bigint') createdAtRound = Number(round)
    else if (typeof round === 'number' && Number.isFinite(round)) createdAtRound = round
  } catch {
    // indexer optional
  }

  const token: ResolvedToken = {
    id: readAssetIndex(info, assetId),
    name: pickString(params, ['name', 'name-b64']) || `Token (ID ${assetId})`,
    unitName: pickString(params, ['unit-name', 'unitName', 'unit-name-b64']) || `ID ${assetId}`,
    decimals: readAssetDecimals(info),
    total: readTotal(params),
    url: pickString(params, ['url', 'url-b64']),
    creator: pickString(params, ['creator']),
    manager: pickString(params, ['manager']),
    reserve: pickString(params, ['reserve']),
    freeze: pickString(params, ['freeze']),
    clawback: pickString(params, ['clawback']),
    defaultFrozen: Boolean(params['default-frozen'] ?? params.defaultFrozen),
    createdAtRound,
  }

  resolveCache.set(assetId, token)
  return token
}

function readSearchCache(query: string): TokenSearchHit[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(SEARCH_CACHE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as Record<string, { ts: number; results: TokenSearchHit[] }>
    const entry = data[query.toLowerCase()]
    if (!entry) return null
    if (Date.now() - entry.ts > SEARCH_TTL_MS) return null
    return entry.results
  } catch {
    return null
  }
}

function writeSearchCache(query: string, results: TokenSearchHit[]) {
  if (typeof window === 'undefined') return
  try {
    const raw = sessionStorage.getItem(SEARCH_CACHE_KEY)
    const data = raw ? JSON.parse(raw) as Record<string, { ts: number; results: TokenSearchHit[] }> : {}
    data[query.toLowerCase()] = { ts: Date.now(), results }
    sessionStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(data))
  } catch {
    // ignore cache failures
  }
}

function normalizeVestigeRow(row: Record<string, unknown>): TokenSearchHit | null {
  const id = Number(row.asset_id ?? row.assetId ?? row.id ?? 0)
  if (!id || !Number.isFinite(id)) return null
  const name =
    (typeof row.name === 'string' && row.name.trim()) ||
    (typeof row.asset_name === 'string' && row.asset_name.trim()) ||
    `Token (ID ${id})`
  const unitName =
    (typeof row.unit_name === 'string' && row.unit_name.trim()) ||
    (typeof row.unitName === 'string' && row.unitName.trim()) ||
    (typeof row.symbol === 'string' && row.symbol.trim()) ||
    (typeof row.ticker === 'string' && row.ticker.trim()) ||
    `ID ${id}`
  return { id, name, unitName, label: unitName || name }
}

/**
 * Vestige search plus raw numeric ASA IDs for the token picker.
 */
export async function searchTokens(query: string): Promise<TokenSearchHit[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  if (/^\d+$/.test(trimmed)) {
    const id = Number(trimmed)
    if (Number.isFinite(id) && id >= 0) {
      try {
        const asset = await resolveAsset(id)
        return [{
          id: asset.id,
          name: asset.name,
          unitName: asset.unitName,
          label: formatTokenDisplay(asset),
        }]
      } catch {
        return [{
          id,
          name: `Token (ID ${id})`,
          unitName: `ID ${id}`,
          label: `Token (ID ${id})`,
        }]
      }
    }
  }

  const cached = readSearchCache(trimmed)
  if (cached) return cached

  try {
    const data = await fetchVestige<unknown>(`/asset/search?query=${encodeURIComponent(trimmed)}`)
    const rows = Array.isArray(data) ? data : (data as Record<string, unknown>).data ?? []
    const hits: TokenSearchHit[] = []
    if (Array.isArray(rows)) {
      for (const row of rows) {
        const hit = normalizeVestigeRow(row as Record<string, unknown>)
        if (hit) hits.push(hit)
      }
    }
    writeSearchCache(trimmed, hits)
    return hits
  } catch {
    return []
  }
}

export function primeResolveCache(assetId: number, displayName: string): void {
  if (assetId === 0) return
  if (!resolveCache.has(assetId)) {
    resolveCache.set(assetId, {
      id: assetId,
      name: displayName,
      unitName: displayName,
      decimals: 0,
      total: 0,
      url: '',
      creator: '',
      manager: '',
      reserve: '',
      freeze: '',
      clawback: '',
      defaultFrozen: false,
    })
  }
}
