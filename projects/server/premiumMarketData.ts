// Richer CoinGecko fields, gated behind x402 on /api/x402/premium.

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'

export interface PremiumAlgoQuote {
  coinId: string
  priceUsd: number
  change24hPct: number | null
  marketCapUsd: number | null
  volume24hUsd: number | null
  lastUpdated: string
  source: 'x402-premium-coingecko'
  tier: 'premium'
}

export async function fetchPremiumAlgoQuote(coinId = 'algorand'): Promise<PremiumAlgoQuote | null> {
  try {
    const url =
      `${COINGECKO_BASE}/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'ZuikServer/1.0 (x402-premium)' },
    })
    if (!res.ok) {
      console.warn(`[x402/premium] CoinGecko premium fetch failed: HTTP ${res.status}`)
      return null
    }

    const data = await res.json() as {
      market_data?: {
        current_price?: { usd?: number }
        price_change_percentage_24h?: number
        market_cap?: { usd?: number }
        total_volume?: { usd?: number }
        last_updated?: string
      }
    }

    const md = data.market_data
    const priceUsd = md?.current_price?.usd
    if (typeof priceUsd !== 'number' || !Number.isFinite(priceUsd)) {
      return null
    }

    return {
      coinId,
      priceUsd,
      change24hPct: typeof md?.price_change_percentage_24h === 'number' ? md.price_change_percentage_24h : null,
      marketCapUsd: typeof md?.market_cap?.usd === 'number' ? md.market_cap.usd : null,
      volume24hUsd: typeof md?.total_volume?.usd === 'number' ? md.total_volume.usd : null,
      lastUpdated: md?.last_updated ?? new Date().toISOString(),
      source: 'x402-premium-coingecko',
      tier: 'premium',
    }
  } catch (e) {
    console.warn('[x402/premium] CoinGecko premium fetch error:', e)
    return null
  }
}
