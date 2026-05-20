import algosdk from 'algosdk'
import { getIndexerConfigFromViteEnvironment } from '../utils/network/getAlgoClientConfigs'

export interface FearGreedIndex {
  value: number
  classification: string
  timestamp: number
}

export interface BuySellPressure {
  buyCount: number
  sellCount: number
  buyVolumeUsd: number
  sellVolumeUsd: number
  pressure: number
}

export interface AlgoMarketSummary {
  priceUsd: number | null
  change24h: number | null
  volume24h: number | null
  marketCapUsd: number | null
}

const FEAR_GREED_CACHE_KEY = 'zuik_fear_greed_v1'
const FEAR_GREED_TTL_MS = 60 * 60_000
const FX_CACHE_KEY = 'zuik_fx_rates_v1'
const FX_TTL_MS = 30 * 60_000
const ALGO_SUMMARY_CACHE_KEY = 'zuik_algo_summary_v1'
const ALGO_SUMMARY_TTL_MS = 60_000

function getIndexerBaseUrl(): { baseUrl: string; token?: string } | null {
  try {
    const cfg = getIndexerConfigFromViteEnvironment()
    const base = cfg.port ? `${cfg.server.replace(/\/$/, '')}:${cfg.port}` : cfg.server.replace(/\/$/, '')
    return { baseUrl: base, token: cfg.token ? String(cfg.token) : undefined }
  } catch {
    return null
  }
}

async function fetchIndexer(path: string): Promise<unknown> {
  const cfg = getIndexerBaseUrl()
  if (!cfg) {
    throw new Error('Indexer not configured')
  }
  const url = `${cfg.baseUrl}${path}`
  const headers: Record<string, string> = {}
  if (cfg.token) headers['X-Indexer-API-Token'] = cfg.token
  const res = await fetch(url, { headers })
  if (!res.ok) {
    throw new Error(`Indexer error: ${res.status}`)
  }
  return res.json() as Promise<unknown>
}

export async function getFearGreedIndex(): Promise<FearGreedIndex | null> {
  if (typeof window !== 'undefined') {
    try {
      const cachedRaw = localStorage.getItem(FEAR_GREED_CACHE_KEY)
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw) as FearGreedIndex & { fetchedAt: number }
        if (Date.now() - cached.fetchedAt < FEAR_GREED_TTL_MS) {
          return { value: cached.value, classification: cached.classification, timestamp: cached.timestamp }
        }
      }
    } catch {
      // ignore cache errors
    }
  }

  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1')
    if (!res.ok) return null
    const data = await res.json() as { data?: Array<{ value: string; value_classification: string; timestamp: string }> }
    const entry = data?.data?.[0]
    if (!entry) return null
    const result = {
      value: Number(entry.value),
      classification: entry.value_classification,
      timestamp: Number(entry.timestamp) * 1000,
    }
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(FEAR_GREED_CACHE_KEY, JSON.stringify({ ...result, fetchedAt: Date.now() }))
      } catch {
        // ignore cache failures
      }
    }
    return result
  } catch {
    return null
  }
}

export async function getFxRates(): Promise<Record<string, number> | null> {
  if (typeof window !== 'undefined') {
    try {
      const cachedRaw = localStorage.getItem(FX_CACHE_KEY)
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw) as { fetchedAt: number; rates: Record<string, number> }
        if (Date.now() - cached.fetchedAt < FX_TTL_MS) {
          return cached.rates
        }
      }
    } catch {
      // ignore cache failures
    }
  }

  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD')
    if (!res.ok) return null
    const data = await res.json() as { rates?: Record<string, number> }
    if (!data?.rates) return null
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(FX_CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), rates: data.rates }))
      } catch {
        // ignore cache failures
      }
    }
    return data.rates
  } catch {
    return null
  }
}

export async function getAlgoMarketSummary(): Promise<AlgoMarketSummary | null> {
  if (typeof window !== 'undefined') {
    try {
      const cachedRaw = localStorage.getItem(ALGO_SUMMARY_CACHE_KEY)
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw) as AlgoMarketSummary & { fetchedAt: number }
        if (Date.now() - cached.fetchedAt < ALGO_SUMMARY_TTL_MS) {
          return cached
        }
      }
    } catch {
      // ignore cache failures
    }
  }

  try {
    const res = await fetch('https://api.coingecko.com/api/v3/coins/algorand?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false')
    if (!res.ok) return null
    const data = await res.json() as { market_data?: Record<string, any> }
    const market = data.market_data
    if (!market) return null
    const summary: AlgoMarketSummary = {
      priceUsd: market.current_price?.usd ?? null,
      change24h: market.price_change_percentage_24h ?? null,
      volume24h: market.total_volume?.usd ?? null,
      marketCapUsd: market.market_cap?.usd ?? null,
    }
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(ALGO_SUMMARY_CACHE_KEY, JSON.stringify({ ...summary, fetchedAt: Date.now() }))
      } catch {
        // ignore cache failures
      }
    }
    return summary
  } catch {
    return null
  }
}

export async function getHolderCount(assetId: number): Promise<number | null> {
  if (assetId === 0) return null
  try {
    const data = await fetchIndexer(`/v2/assets/${assetId}/balances?limit=1000`)
    const balances = (data as { balances?: Array<Record<string, unknown>> }).balances ?? []
    return balances.length
  } catch {
    return null
  }
}

export async function getBuySellPressure(
  assetId: number,
  priceUsd: number | null,
  decimals = 6,
  windowMinutes = 60,
): Promise<BuySellPressure | null> {
  if (assetId === 0) {
    return null
  }
  try {
    const data = await fetchIndexer(`/v2/assets/${assetId}/transactions?limit=200`)
    const transactions = (data as { transactions?: Array<Record<string, unknown>> }).transactions ?? []
    if (!transactions.length) {
      return { buyCount: 0, sellCount: 0, buyVolumeUsd: 0, sellVolumeUsd: 0, pressure: 0.5 }
    }

    const cutoff = Date.now() - windowMinutes * 60_000
    const grouped = new Map<string, Array<Record<string, unknown>>>()

    for (const tx of transactions) {
      const roundTime = Number(tx['round-time'] ?? 0) * 1000
      if (roundTime && roundTime < cutoff) continue
      const group = (tx.group as string | undefined) ?? `single_${tx.id as string}`
      const bucket = grouped.get(group) ?? []
      bucket.push(tx)
      grouped.set(group, bucket)
    }

    let buys = 0
    let sells = 0
    let buyVolume = 0
    let sellVolume = 0

    for (const [, groupTxs] of grouped) {
      const appTx = groupTxs.find((tx) => tx['application-transaction'])
      const appId = appTx
        ? Number((appTx['application-transaction'] as Record<string, unknown>)['application-id'])
        : null
      const appAddress = appId ? algosdk.getApplicationAddress(appId) : null

      for (const tx of groupTxs) {
        const axfer = tx['asset-transfer-transaction'] as Record<string, unknown> | undefined
        if (!axfer) continue
        const txAssetId = Number(axfer['asset-id'] ?? axfer.assetId ?? 0)
        if (txAssetId !== assetId) continue

        const sender = String(tx.sender ?? '')
        const receiver = String(axfer.receiver ?? '')
        const amount = Number(axfer.amount ?? 0) / Math.pow(10, decimals)

        const appAddrStr = appAddress?.toString() ?? ''
        if (appAddrStr && receiver === appAddrStr) {
          sells += 1
          sellVolume += amount
        } else if (appAddrStr && sender === appAddrStr) {
          buys += 1
          buyVolume += amount
        }
      }
    }

    const total = buys + sells
    const pressure = total > 0 ? buys / total : 0.5
    const price = priceUsd ?? 0

    return {
      buyCount: buys,
      sellCount: sells,
      buyVolumeUsd: price ? (buyVolume * price) : 0,
      sellVolumeUsd: price ? (sellVolume * price) : 0,
      pressure,
    }
  } catch {
    return null
  }
}
