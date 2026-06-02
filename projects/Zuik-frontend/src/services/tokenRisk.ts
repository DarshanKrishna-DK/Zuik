import { getAlgodClient, getIndexerClient } from './algorand'
import { resolveAsset, type ResolvedToken } from './tokenResolver'
import { getTokenDetails } from './vestigeApi'
import {
  applyRubricOffline,
  riskBandLabel,
  scoreToBand,
  type HolderStats,
  type RiskBand,
  type TokenRiskResult,
} from './tokenRiskCore'

export type { RiskBand, TokenRiskResult }
export { applyRubricOffline, riskBandLabel, scoreToBand }

const SCORE_CACHE_KEY = 'zuik_token_risk_v1'
const SCORE_TTL_MS = 10 * 60_000
const ROUNDS_PER_DAY = 27_000
const ZERO_ADDR = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ'

function isNonZeroAddress(addr: string | undefined): boolean {
  if (!addr || addr.length < 10) return false
  return addr !== ZERO_ADDR
}

const scoreCache = new Map<number, { ts: number; result: TokenRiskResult }>()

function getBlueChipIds(): Set<number> {
  const net = (import.meta.env.VITE_ALGOD_NETWORK || 'testnet').toLowerCase()
  if (net === 'mainnet') {
    return new Set([0, 31566704, 312769])
  }
  return new Set([0, 10458941])
}

function readScoreCache(assetId: number): TokenRiskResult | null {
  const mem = scoreCache.get(assetId)
  if (mem && Date.now() - mem.ts <= SCORE_TTL_MS) return mem.result

  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(SCORE_CACHE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as Record<string, { ts: number; result: TokenRiskResult }>
    const entry = data[String(assetId)]
    if (!entry || Date.now() - entry.ts > SCORE_TTL_MS) return null
    scoreCache.set(assetId, entry)
    return entry.result
  } catch {
    return null
  }
}

function writeScoreCache(assetId: number, result: TokenRiskResult) {
  const entry = { ts: Date.now(), result }
  scoreCache.set(assetId, entry)
  if (typeof window === 'undefined') return
  try {
    const raw = sessionStorage.getItem(SCORE_CACHE_KEY)
    const data = raw ? JSON.parse(raw) as Record<string, { ts: number; result: TokenRiskResult }> : {}
    data[String(assetId)] = entry
    sessionStorage.setItem(SCORE_CACHE_KEY, JSON.stringify(data))
  } catch {
    // ignore
  }
}

async function fetchHolderStats(assetId: number, reserveAddr: string, total: number): Promise<HolderStats | null> {
  if (total <= 0) return null
  try {
    const indexer = getIndexerClient()
    const res = await indexer.lookupAssetBalances(assetId).limit(1000).do()
    const balances = res.balances ?? []
    const amounts = balances
      .map((b) => {
        const amt = b.amount
        return typeof amt === 'bigint' ? Number(amt) : Number(amt ?? 0)
      })
      .filter((n) => n > 0)
      .sort((a, b) => b - a)

    const sum = amounts.reduce((s, n) => s + n, 0) || total
    const top1 = amounts[0] ?? 0
    const top10 = amounts.slice(0, 10).reduce((s, n) => s + n, 0)

    let reservePct = 0
    if (isNonZeroAddress(reserveAddr)) {
      const reserveRow = balances.find((b) => {
        const addr = b.address
        return typeof addr === 'string' && addr === reserveAddr
      })
      if (reserveRow) {
        const amt = reserveRow.amount
        const n = typeof amt === 'bigint' ? Number(amt) : Number(amt ?? 0)
        reservePct = (n / total) * 100
      }
    }

    return {
      top1Pct: (top1 / sum) * 100,
      top10Pct: (top10 / sum) * 100,
      reservePct,
    }
  } catch {
    return null
  }
}

async function fetchCurrentRound(): Promise<number | null> {
  try {
    const algod = getAlgodClient()
    const status = await algod.status().do()
    const round = status.lastRound
    if (typeof round === 'bigint') return Number(round)
    if (typeof round === 'number') return round
    return null
  } catch {
    return null
  }
}

function computeAgeRounds(createdAtRound: number | undefined, currentRound: number | null): number | null {
  if (createdAtRound == null || currentRound == null) return null
  return Math.max(0, currentRound - createdAtRound)
}

/**
 * 0-100 risk score per design doc section 6 (start 50, penalties, mitigations, clamp).
 */
export async function computeRiskScore(assetId: number): Promise<TokenRiskResult> {
  if (assetId === 0) {
    return { score: 0, band: 'low', reasons: ['Native ALGO'] }
  }

  const cached = readScoreCache(assetId)
  if (cached) return cached

  let asset: ResolvedToken
  try {
    asset = await resolveAsset(assetId)
  } catch {
    const unknown: TokenRiskResult = {
      score: 50,
      band: 'moderate',
      reasons: ['Could not load on-chain asset params'],
    }
    writeScoreCache(assetId, unknown)
    return unknown
  }

  const [holderStats, currentRound, market] = await Promise.all([
    fetchHolderStats(assetId, asset.reserve, asset.total),
    fetchCurrentRound(),
    getTokenDetails(assetId).catch(() => null),
  ])

  const result = applyRubricOffline({
    asset,
    holderStats,
    ageRounds: computeAgeRounds(asset.createdAtRound, currentRound),
    liquidityUsd: market?.liquidityUsd ?? null,
    volume24h: market?.volume24h ?? null,
    isBlueChip: getBlueChipIds().has(assetId),
  })

  writeScoreCache(assetId, result)
  return result
}
