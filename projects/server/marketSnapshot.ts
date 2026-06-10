// Market data for the AI layer: free CoinGecko/Vestige, or x402 premium when an agent wallet is set.

import type { AgentExecutionContext } from './agentSigner.js'
import { fetchWithGuardianX402 } from './x402AgentClient.js'
import type { PremiumAlgoQuote } from './premiumMarketData.js'

const VESTIGE_BASE = 'https://free-api.vestige.fi'
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'

const SERVER_BASE = process.env.X402_SERVER_BASE
  ?? process.env.SERVER_URL
  ?? `http://localhost:${process.env.PORT ?? '4021'}`

export interface MarketSnapshot {
  algoUsd: number | null
  algoChange24h: number | null
  asset?: {
    assetId: number
    priceUsd: number | null
    liquidityUsd: number | null
    volume24h: number | null
    change24h: number | null
  }
  takenAt: string
  sources: string[]
  /** Set when premium x402 data was used. */
  premium?: {
    marketCapUsd: number | null
    volume24hUsd: number | null
    paymentTxId?: string
  }
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

async function fetchFreeAlgoSpot(): Promise<{ algoUsd: number | null; algoChange24h: number | null }> {
  const cg = await fetchJson<Record<string, { usd?: number; usd_24h_change?: number }>>(
    `${COINGECKO_BASE}/simple/price?ids=algorand&vs_currencies=usd&include_24hr_change=true`,
  )
  return {
    algoUsd: typeof cg?.algorand?.usd === 'number' ? cg.algorand.usd : null,
    algoChange24h: typeof cg?.algorand?.usd_24h_change === 'number' ? cg.algorand.usd_24h_change : null,
  }
}

export async function fetchPremiumAlgoQuoteViaX402(
  agent: AgentExecutionContext,
  coinId = 'algorand',
): Promise<{ quote: PremiumAlgoQuote; paymentTxId?: string } | null> {
  const url = `${SERVER_BASE.replace(/\/$/, '')}/api/x402/premium/algo-quote?coin=${encodeURIComponent(coinId)}`
  try {
    const result = await fetchWithGuardianX402<PremiumAlgoQuote>(agent, url)
    return { quote: result.data, paymentTxId: result.paymentTxId }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn(`[marketSnapshot] x402 premium fetch failed: ${msg}`)
    return null
  }
}

export async function getMarketSnapshot(
  assetId = 0,
  agentContext?: AgentExecutionContext | null,
): Promise<MarketSnapshot> {
  const sources: string[] = []
  const useX402 = agentContext && process.env.X402_DISABLE !== '1'

  let algoUsd: number | null = null
  let algoChange24h: number | null = null
  let premium: MarketSnapshot['premium']

  if (useX402 && agentContext) {
    const paid = await fetchPremiumAlgoQuoteViaX402(agentContext)
    if (paid) {
      sources.push('x402-premium')
      algoUsd = paid.quote.priceUsd
      algoChange24h = paid.quote.change24hPct
      premium = {
        marketCapUsd: paid.quote.marketCapUsd,
        volume24hUsd: paid.quote.volume24hUsd,
        paymentTxId: paid.paymentTxId,
      }
      if (paid.paymentTxId) {
        console.log(`[marketSnapshot] x402 premium payment confirmed: ${paid.paymentTxId}`)
      }
    }
  }

  if (algoUsd === null) {
    const free = await fetchFreeAlgoSpot()
    algoUsd = free.algoUsd
    algoChange24h = free.algoChange24h
    if (algoUsd !== null) sources.push('coingecko')
  }

  const snapshot: MarketSnapshot = {
    algoUsd,
    algoChange24h,
    takenAt: new Date().toISOString(),
    sources,
    premium,
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
