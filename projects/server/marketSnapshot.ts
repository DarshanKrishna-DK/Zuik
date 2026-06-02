/**
 * Lightweight market snapshot for the AI decision layer.
 *
 * Reuses the same free upstreams the repo already proxies (Vestige free API for Algorand asset
 * data, CoinGecko for the ALGO/USD spot). One snapshot is taken per decision, never per price
 * tick, to stay inside the free tier. All fields are best effort: a missing source yields null
 * and the AI is told the data is partial rather than fabricating a number.
 */

const VESTIGE_BASE = 'https://free-api.vestige.fi'
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'

export interface MarketSnapshot {
  /** ALGO spot price in USD, or null when unavailable. */
  algoUsd: number | null
  /** 24h percent change for ALGO, or null. */
  algoChange24h: number | null
  /** Vestige data for the configured asset (when assetId provided and found). */
  asset?: {
    assetId: number
    priceUsd: number | null
    liquidityUsd: number | null
    volume24h: number | null
    change24h: number | null
  }
  takenAt: string
  /** Human note describing which sources answered (for the AI prompt + logs). */
  sources: string[]
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'ZuikServer/1.0 (ai-agent)' },
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

/**
 * Build a market snapshot. assetId 0 (ALGO) only fetches the spot price; a non-zero ASA id also
 * pulls Vestige liquidity/volume so the AI can reason about thin markets.
 */
export async function getMarketSnapshot(assetId = 0): Promise<MarketSnapshot> {
  const sources: string[] = []

  const cg = await fetchJson<Record<string, { usd?: number; usd_24h_change?: number }>>(
    `${COINGECKO_BASE}/simple/price?ids=algorand&vs_currencies=usd&include_24hr_change=true`,
  )
  const algoUsd = typeof cg?.algorand?.usd === 'number' ? cg.algorand.usd : null
  const algoChange24h = typeof cg?.algorand?.usd_24h_change === 'number' ? cg.algorand.usd_24h_change : null
  if (algoUsd !== null) sources.push('coingecko')

  const snapshot: MarketSnapshot = {
    algoUsd,
    algoChange24h,
    takenAt: new Date().toISOString(),
    sources,
  }

  if (assetId && assetId > 0) {
    const v = await fetchJson<{
      price?: number
      liquidity?: number
      volume24h?: number
      change24h?: number
    }>(`${VESTIGE_BASE}/asset/${assetId}`)
    if (v) sources.push('vestige')
    snapshot.asset = {
      assetId,
      priceUsd: typeof v?.price === 'number' ? v.price : null,
      liquidityUsd: typeof v?.liquidity === 'number' ? v.liquidity : null,
      volume24h: typeof v?.volume24h === 'number' ? v.volume24h : null,
      change24h: typeof v?.change24h === 'number' ? v.change24h : null,
    }
  }

  return snapshot
}
