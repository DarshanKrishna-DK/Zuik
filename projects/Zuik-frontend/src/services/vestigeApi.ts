const VESTIGE_BASE = 'https://free-api.vestige.fi'

export interface MarketToken {
  id: number
  name: string
  unitName: string
  priceUsd: number | null
  change1h: number | null
  change24h: number | null
  change7d: number | null
  volume24h: number | null
  liquidityUsd: number | null
  marketCapUsd: number | null
  logoUrl: string | null
  decimals: number | null
}

export interface OhlcvPoint {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

type RawRow = Record<string, unknown>

const SEARCH_CACHE_KEY = 'zuik_market_search_cache_v1'
const SEARCH_TTL_MS = 10 * 60_000

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function pickNumber(row: RawRow, keys: string[]): number | null {
  for (const key of keys) {
    const val = readNumber(row[key])
    if (val !== null) return val
  }
  return null
}

function pickString(row: RawRow, keys: string[]): string | null {
  for (const key of keys) {
    const val = row[key]
    if (typeof val === 'string' && val.trim()) return val.trim()
  }
  return null
}

function normalizeToken(row: RawRow): MarketToken {
  const id = pickNumber(row, ['asset_id', 'assetId', 'id']) ?? 0
  const name = pickString(row, ['name', 'asset_name', 'title']) ?? `ASA #${id}`
  const unitName = pickString(row, ['unit_name', 'unitName', 'ticker', 'symbol']) ?? name
  const priceUsd = pickNumber(row, ['price', 'price_usd', 'priceUsd'])
  const change1h = pickNumber(row, ['change_1h', 'change1h', 'price_change_1h', 'priceChange1h'])
  const change24h = pickNumber(row, ['change_24h', 'change24h', 'price_change_24h', 'priceChange24h'])
  const change7d = pickNumber(row, ['change_7d', 'change7d', 'price_change_7d', 'priceChange7d'])
  const volume24h = pickNumber(row, ['volume_24h', 'volume24h', 'volumeUsd24h', 'volumeUSD24H'])
  const liquidityUsd = pickNumber(row, ['liquidity', 'liquidity_usd', 'liquidityUsd', 'tvl'])
  const marketCapUsd = pickNumber(row, ['market_cap', 'marketCap', 'market_cap_usd'])
  const logoUrl = pickString(row, ['logo', 'icon', 'image', 'logo_url', 'logoUrl'])
  const decimals = pickNumber(row, ['decimals', 'decimal'])

  return {
    id,
    name,
    unitName,
    priceUsd,
    change1h,
    change24h,
    change7d,
    volume24h,
    liquidityUsd,
    marketCapUsd,
    logoUrl,
    decimals,
  }
}

async function fetchVestige<T>(path: string): Promise<T> {
  const res = await fetch(`${VESTIGE_BASE}${path}`)
  if (!res.ok) {
    throw new Error(`Vestige API error: ${res.status}`)
  }
  return res.json() as Promise<T>
}

function readSearchCache(query: string): MarketToken[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(SEARCH_CACHE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as Record<string, { ts: number; results: MarketToken[] }>
    const entry = data[query.toLowerCase()]
    if (!entry) return null
    if (Date.now() - entry.ts > SEARCH_TTL_MS) return null
    return entry.results
  } catch {
    return null
  }
}

function writeSearchCache(query: string, results: MarketToken[]) {
  if (typeof window === 'undefined') return
  try {
    const raw = sessionStorage.getItem(SEARCH_CACHE_KEY)
    const data = raw ? JSON.parse(raw) as Record<string, { ts: number; results: MarketToken[] }> : {}
    data[query.toLowerCase()] = { ts: Date.now(), results }
    sessionStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(data))
  } catch {
    // ignore cache failures
  }
}

export async function getTopMovers(): Promise<MarketToken[]> {
  const data = await fetchVestige<unknown>('/asset/trending')
  const rows = Array.isArray(data) ? data : (data as RawRow).data ?? []
  return Array.isArray(rows) ? rows.map((row) => normalizeToken(row as RawRow)) : []
}

export async function searchTokens(query: string): Promise<MarketToken[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const cached = readSearchCache(trimmed)
  if (cached) return cached
  const data = await fetchVestige<unknown>(`/asset/search?query=${encodeURIComponent(trimmed)}`)
  const rows = Array.isArray(data) ? data : (data as RawRow).data ?? []
  const results = Array.isArray(rows) ? rows.map((row) => normalizeToken(row as RawRow)) : []
  writeSearchCache(trimmed, results)
  return results
}

export async function getTokenDetails(assetId: number): Promise<MarketToken | null> {
  try {
    const data = await fetchVestige<unknown>(`/asset/${assetId}`)
    if (data && typeof data === 'object') {
      return normalizeToken(data as RawRow)
    }
  } catch {
    // fall through to null
  }
  return null
}

export async function getTokenOHLCV(
  assetId: number,
  interval: string,
  limit: number,
): Promise<OhlcvPoint[]> {
  const data = await fetchVestige<unknown>(`/asset/${assetId}/prices?interval=${interval}&limit=${limit}`)
  const rows = Array.isArray(data)
    ? data
    : (data as RawRow).data ?? (data as RawRow).prices ?? []

  if (!Array.isArray(rows)) return []

  return rows.map((row) => {
    if (Array.isArray(row)) {
      const [timestamp, open, high, low, close, volume] = row as unknown[]
      return {
        timestamp: Number(timestamp) * 1000,
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close),
        volume: Number(volume ?? 0),
      }
    }

    const raw = row as RawRow
    const timestamp = pickNumber(raw, ['timestamp', 'time', 't']) ?? Date.now()
    const open = pickNumber(raw, ['open', 'o']) ?? 0
    const high = pickNumber(raw, ['high', 'h']) ?? open
    const low = pickNumber(raw, ['low', 'l']) ?? open
    const close = pickNumber(raw, ['close', 'c']) ?? open
    const volume = pickNumber(raw, ['volume', 'v']) ?? 0

    return {
      timestamp: timestamp > 10_000_000_000 ? timestamp : timestamp * 1000,
      open,
      high,
      low,
      close,
      volume,
    }
  })
}
