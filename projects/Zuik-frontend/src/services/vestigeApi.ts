function marketApiBase(envKey: string, devPath: string, serverSuffix: string, prodUrl: string): string {
  const fromEnv = import.meta.env[envKey] as string | undefined
  if (fromEnv?.trim()) return fromEnv.trim().replace(/\/$/, '')
  if (import.meta.env.DEV) return devPath
  const server = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim()
  if (server) return `${server.replace(/\/$/, '')}/api/market${serverSuffix}`
  return prodUrl
}

const VESTIGE_BASE = marketApiBase(
  'VITE_VESTIGE_API_BASE',
  '/api/vestige',
  '/vestige',
  'https://free-api.vestige.fi',
)
const COINGECKO_BASE = marketApiBase(
  'VITE_COINGECKO_API_BASE',
  '/api/coingecko',
  '/coingecko',
  'https://api.coingecko.com/api/v3',
)

export type MarketTokenId = number | string

export interface MarketToken {
  id: MarketTokenId
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

const COINGECKO_PREFIX = 'cg:'

function isCoingeckoId(id: MarketTokenId): id is string {
  return typeof id === 'string' && id.startsWith(COINGECKO_PREFIX)
}

function toCoingeckoId(id: string): string {
  return `${COINGECKO_PREFIX}${id}`
}

function stripCoingeckoId(id: string): string {
  return id.replace(COINGECKO_PREFIX, '')
}

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

function normalizeCoingeckoSearch(row: RawRow): MarketToken {
  const id = pickString(row, ['id']) ?? 'unknown'
  const name = pickString(row, ['name']) ?? id
  const unitName = (pickString(row, ['symbol']) ?? name).toUpperCase()
  const logoUrl = pickString(row, ['large', 'thumb'])
  return {
    id: toCoingeckoId(id),
    name,
    unitName,
    priceUsd: null,
    change1h: null,
    change24h: null,
    change7d: null,
    volume24h: null,
    liquidityUsd: null,
    marketCapUsd: null,
    logoUrl,
    decimals: null,
  }
}

function normalizeCoingeckoDetails(id: string, row: RawRow): MarketToken {
  const market = row.market_data as RawRow | undefined
  const priceUsd = readNumber((market?.current_price as RawRow | undefined)?.usd)
  const volume24h = readNumber((market?.total_volume as RawRow | undefined)?.usd)
  const marketCapUsd = readNumber((market?.market_cap as RawRow | undefined)?.usd)
  const change24h = readNumber(market?.price_change_percentage_24h)
  const change7d = readNumber(market?.price_change_percentage_7d)
  const name = pickString(row, ['name']) ?? id
  const unitName = (pickString(row, ['symbol']) ?? name).toUpperCase()
  const logoUrl = pickString(row, ['image', 'large', 'thumb'])
  return {
    id: toCoingeckoId(id),
    name,
    unitName,
    priceUsd,
    change1h: null,
    change24h,
    change7d,
    volume24h,
    liquidityUsd: null,
    marketCapUsd,
    logoUrl,
    decimals: null,
  }
}

async function fetchVestige<T>(path: string): Promise<T> {
  const res = await fetch(`${VESTIGE_BASE}${path}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'ZuikFrontend/1.0',
    },
  })
  if (!res.ok) {
    throw new Error(`Vestige API error: ${res.status}`)
  }
  return res.json() as Promise<T>
}

async function fetchCoingecko<T>(path: string): Promise<T> {
  const res = await fetch(`${COINGECKO_BASE}${path}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'ZuikFrontend/1.0',
    },
  })
  if (!res.ok) {
    throw new Error(`CoinGecko API error: ${res.status}`)
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
  try {
    const data = await fetchVestige<unknown>('/asset/trending')
    const rows = Array.isArray(data) ? data : (data as RawRow).data ?? []
    const results = Array.isArray(rows) ? rows.map((row) => normalizeToken(row as RawRow)) : []
    if (results.length > 0) return results
  } catch {
    // fall back to CoinGecko trending
  }

  try {
    const data = await fetchCoingecko<unknown>('/search/trending')
    const rows = (data as RawRow).coins ?? []
    if (!Array.isArray(rows)) return []
    return rows.map((row) => normalizeCoingeckoSearch((row as RawRow).item as RawRow))
  } catch {
    return []
  }
}

export async function searchTokens(query: string): Promise<MarketToken[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const cached = readSearchCache(trimmed)
  if (cached) return cached

  const [vestigeResult, coingeckoResult] = await Promise.allSettled([
    fetchVestige<unknown>(`/asset/search?query=${encodeURIComponent(trimmed)}`),
    fetchCoingecko<unknown>(`/search?query=${encodeURIComponent(trimmed)}`),
  ])

  const vestigeRows = vestigeResult.status === 'fulfilled'
    ? (Array.isArray(vestigeResult.value) ? vestigeResult.value : (vestigeResult.value as RawRow).data ?? [])
    : []
  const vestigeTokens = Array.isArray(vestigeRows)
    ? vestigeRows.map((row) => normalizeToken(row as RawRow))
    : []

  const coingeckoRows = coingeckoResult.status === 'fulfilled'
    ? ((coingeckoResult.value as RawRow).coins ?? [])
    : []
  const coingeckoTokens = Array.isArray(coingeckoRows)
    ? coingeckoRows.map((row) => normalizeCoingeckoSearch(row as RawRow))
    : []

  const deduped = new Map<string, MarketToken>()
  for (const token of [...vestigeTokens, ...coingeckoTokens]) {
    const key = `${token.name.toLowerCase()}_${token.unitName.toLowerCase()}`
    if (!deduped.has(key)) deduped.set(key, token)
  }
  const results = Array.from(deduped.values())
  writeSearchCache(trimmed, results)
  return results
}

export async function getTokenDetails(assetId: MarketTokenId): Promise<MarketToken | null> {
  if (isCoingeckoId(assetId)) {
    const geckoId = stripCoingeckoId(assetId)
    try {
      const data = await fetchCoingecko<unknown>(`/coins/${geckoId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`)
      if (data && typeof data === 'object') {
        return normalizeCoingeckoDetails(geckoId, data as RawRow)
      }
    } catch {
      return null
    }
  }

  if (typeof assetId !== 'number') return null

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

function coingeckoDaysForChart(interval: string): number {
  if (interval === '1d') return 30
  if (interval === '4h') return 7
  return 1
}

async function fetchCoingeckoMarketChartOhlc(geckoId: string, days: number, limit: number): Promise<OhlcvPoint[]> {
  try {
    const res = await fetch(
      `${COINGECKO_BASE}/coins/${geckoId}/market_chart?vs_currency=usd&days=${days}`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'ZuikFrontend/1.0',
        },
      },
    )
    if (!res.ok) return []
    const body = (await res.json()) as { prices?: [number, number][] }
    const prices = Array.isArray(body.prices) ? body.prices : []
    const slice = prices.slice(-Math.max(limit, 12))
    return slice
      .map(([timestamp, close]) => ({
        timestamp,
        open: close,
        high: close,
        low: close,
        close,
        volume: 0,
      }))
      .filter((p) => p.close > 0 && Number.isFinite(p.close))
  } catch {
    return []
  }
}

async function fetchCoingeckoOhlc(geckoId: string, interval: string, limit: number): Promise<OhlcvPoint[]> {
  const days = coingeckoDaysForChart(interval)
  try {
    const res = await fetch(`${COINGECKO_BASE}/coins/${geckoId}/ohlc?vs_currency=usd&days=${days}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'ZuikFrontend/1.0',
      },
    })
    if (!res.ok) {
      return fetchCoingeckoMarketChartOhlc(geckoId, days, limit)
    }
    const raw = await res.json() as Array<[number, number, number, number, number]>
    const rows = Array.isArray(raw) ? raw.slice(-limit) : []
    const points = rows
      .map((row) => ({
        timestamp: row[0],
        open: row[1],
        high: row[2],
        low: row[3],
        close: row[4],
        volume: 0,
      }))
      .filter((p) => p.close > 0 && Number.isFinite(p.close))
    if (points.length > 0) return points
    return fetchCoingeckoMarketChartOhlc(geckoId, days, limit)
  } catch {
    return fetchCoingeckoMarketChartOhlc(geckoId, coingeckoDaysForChart(interval), limit)
  }
}

export async function getTokenOHLCV(
  assetId: MarketTokenId,
  interval: string,
  limit: number,
): Promise<OhlcvPoint[]> {
  if (isCoingeckoId(assetId)) {
    const geckoId = stripCoingeckoId(assetId)
    return fetchCoingeckoOhlc(geckoId, interval, limit)
  }

  if (assetId === 0) {
    return fetchCoingeckoOhlc('algorand', interval, limit)
  }

  if (typeof assetId !== 'number') return []

  try {
    const data = await fetchVestige<unknown>(`/asset/${assetId}/prices?interval=${interval}&limit=${limit}`)
    const rows = Array.isArray(data)
      ? data
      : (data as RawRow).data ?? (data as RawRow).prices ?? []

    if (!Array.isArray(rows) || rows.length === 0) {
      return []
    }

    const points = rows.map((row) => {
      if (Array.isArray(row)) {
        const [timestamp, open, high, low, close, volume] = row as unknown[]
        const tsRaw = Number(timestamp)
        const tsMs = Number.isFinite(tsRaw) && tsRaw > 1e12 ? tsRaw : tsRaw * 1000
        return {
          timestamp: tsMs,
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
      const close = pickNumber(raw, ['close', 'c', 'price', 'usd', 'value']) ?? open
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

    const filtered = points.filter((p) => p.close > 0 && Number.isFinite(p.close))
    return filtered
  } catch {
    return []
  }
}

