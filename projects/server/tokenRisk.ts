// ASA risk scoring for headless workflows (same rubric as the frontend).
import algosdk from 'algosdk'
import { getAlgodClient } from './algorand.js'

const VESTIGE_BASE = 'https://free-api.vestige.fi'
const ROUNDS_PER_DAY = 27_000
const ZERO_ADDR = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ'

export type RiskBand = 'low' | 'moderate' | 'elevated' | 'extreme'

export interface TokenRiskResult {
  score: number
  band: RiskBand
  reasons: string[]
}

interface ResolvedAsset {
  id: number
  total: number
  url: string
  manager: string
  reserve: string
  freeze: string
  clawback: string
  defaultFrozen: boolean
  createdAtRound?: number
}

interface HolderStats {
  top1Pct: number
  top10Pct: number
  reservePct: number
}

const scoreCache = new Map<number, { ts: number; result: TokenRiskResult }>()
const SCORE_TTL_MS = 10 * 60_000

function getBlueChipIds(): Set<number> {
  const net = (process.env.ALGOD_NETWORK || process.env.VITE_ALGOD_NETWORK || 'testnet').toLowerCase()
  if (net === 'mainnet') return new Set([0, 31566704, 312769])
  return new Set([0, 10458941])
}

export function scoreToBand(score: number): RiskBand {
  if (score <= 25) return 'low'
  if (score <= 50) return 'moderate'
  if (score <= 75) return 'elevated'
  return 'extreme'
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)))
}

function isNonZeroAddress(addr: string | undefined): boolean {
  if (!addr || addr.length < 10) return false
  return addr !== ZERO_ADDR
}

function readScoreCache(assetId: number): TokenRiskResult | null {
  const mem = scoreCache.get(assetId)
  if (mem && Date.now() - mem.ts <= SCORE_TTL_MS) return mem.result
  return null
}

function writeScoreCache(assetId: number, result: TokenRiskResult) {
  scoreCache.set(assetId, { ts: Date.now(), result })
}

async function resolveAsset(assetId: number): Promise<ResolvedAsset> {
  const algod = getAlgodClient()
  const info = await algod.getAssetByID(BigInt(assetId)).do()
  const infoRecord = info as unknown as Record<string, unknown>
  const params = (infoRecord.params as Record<string, unknown> | undefined) ?? infoRecord
  let createdAtRound: number | undefined
  try {
    const indexer = new algosdk.Indexer(
      process.env.INDEXER_TOKEN ?? '',
      process.env.INDEXER_URL ?? process.env.ALGOD_URL ?? 'https://testnet-idx.algonode.cloud',
      process.env.INDEXER_PORT ? Number(process.env.INDEXER_PORT) : '',
    )
    const idxAsset = await indexer.lookupAssetByID(assetId).do()
    const asset = idxAsset.asset as unknown as Record<string, unknown> | undefined
    const round = asset?.['created-at-round'] ?? asset?.createdAtRound
    if (typeof round === 'bigint') createdAtRound = Number(round)
    else if (typeof round === 'number') createdAtRound = round
  } catch {
    // indexer optional
  }

  const total = params.total
  return {
    id: assetId,
    total: typeof total === 'bigint' ? Number(total) : Number(total ?? 0),
    url: String(params.url ?? params['url-b64'] ?? ''),
    manager: String(params.manager ?? ''),
    reserve: String(params.reserve ?? ''),
    freeze: String(params.freeze ?? ''),
    clawback: String(params.clawback ?? ''),
    defaultFrozen: Boolean(params['default-frozen'] ?? params.defaultFrozen),
    createdAtRound,
  }
}

async function fetchHolderStats(assetId: number, reserveAddr: string, total: number): Promise<HolderStats | null> {
  if (total <= 0) return null
  try {
    const indexer = new algosdk.Indexer(
      process.env.INDEXER_TOKEN ?? '',
      process.env.INDEXER_URL ?? process.env.ALGOD_URL ?? 'https://testnet-idx.algonode.cloud',
      process.env.INDEXER_PORT ? Number(process.env.INDEXER_PORT) : '',
    )
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
    let reservePct = 0
    if (isNonZeroAddress(reserveAddr)) {
      const row = balances.find((b) => b.address === reserveAddr)
      if (row) {
        const n = typeof row.amount === 'bigint' ? Number(row.amount) : Number(row.amount ?? 0)
        reservePct = (n / total) * 100
      }
    }
    return {
      top1Pct: ((amounts[0] ?? 0) / sum) * 100,
      top10Pct: (amounts.slice(0, 10).reduce((s, n) => s + n, 0) / sum) * 100,
      reservePct,
    }
  } catch {
    return null
  }
}

async function fetchVestigeMarket(assetId: number): Promise<{ liquidityUsd: number | null; volume24h: number | null }> {
  try {
    const res = await fetch(`${VESTIGE_BASE}/asset/${assetId}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'ZuikServer/1.0 (token-risk)' },
    })
    if (!res.ok) return { liquidityUsd: null, volume24h: null }
    const row = await res.json() as Record<string, unknown>
    const liquidityUsd = typeof row.liquidity === 'number' ? row.liquidity : null
    const volume24h = typeof row.volume24h === 'number' ? row.volume24h : null
    return { liquidityUsd, volume24h }
  } catch {
    return { liquidityUsd: null, volume24h: null }
  }
}

function isGenericUrl(url: string): boolean {
  const u = url.trim().toLowerCase()
  if (!u || u.length < 8) return true
  if (u === 'https://' || u === 'http://') return true
  if (u.includes('example.com') || u.includes('placeholder')) return true
  return false
}

export async function computeRiskScore(assetId: number): Promise<TokenRiskResult> {
  if (assetId === 0) {
    return { score: 0, band: 'low', reasons: ['Native ALGO'] }
  }

  const cached = readScoreCache(assetId)
  if (cached) return cached

  let score = 50
  const reasons: string[] = ['Unknown ASA baseline (50)']

  let asset: ResolvedAsset
  try {
    asset = await resolveAsset(assetId)
  } catch {
    const unknown: TokenRiskResult = { score: 50, band: 'moderate', reasons: ['Could not load on-chain asset params'] }
    writeScoreCache(assetId, unknown)
    return unknown
  }

  const isBlueChip = getBlueChipIds().has(assetId)

  if (isNonZeroAddress(asset.manager) || isNonZeroAddress(asset.freeze) || isNonZeroAddress(asset.clawback)) {
    score += 15
    reasons.push('Manager, freeze, or clawback address is set (+15)')
  }

  const algod = getAlgodClient()
  const status = await algod.status().do().catch(() => null)
  const currentRound = status ? Number(status.lastRound ?? 0) : null

  const [holderStats, market] = await Promise.all([
    fetchHolderStats(assetId, asset.reserve, asset.total),
    fetchVestigeMarket(assetId),
  ])

  const liquidityUsd = market.liquidityUsd
  const volume24h = market.volume24h

  if (holderStats && holderStats.reservePct > 50) {
    score += 20
    reasons.push(`Reserve concentration (+20)`)
  }
  if (holderStats && holderStats.top1Pct > 30) {
    score += 15
    reasons.push(`Top holder concentration (+15)`)
  }
  if (holderStats && holderStats.top10Pct > 70) {
    score += 10
    reasons.push(`Top 10 concentration (+10)`)
  }
  if (liquidityUsd == null || liquidityUsd < 1_000) {
    score += 15
    reasons.push('Low or unknown liquidity (+15)')
  } else if (liquidityUsd < 10_000) {
    score += 8
    reasons.push('Moderate liquidity (+8)')
  }

  const ageRounds =
    asset.createdAtRound != null && currentRound != null
      ? Math.max(0, currentRound - asset.createdAtRound)
      : null

  if (ageRounds != null) {
    if (ageRounds < ROUNDS_PER_DAY) score += 12
    else if (ageRounds < ROUNDS_PER_DAY * 7) score += 6
  }
  if (asset.total > 1_000 && (volume24h == null || volume24h === 0)) score += 8
  if (asset.defaultFrozen) score += 5
  if (isGenericUrl(asset.url)) score += 3
  if (liquidityUsd != null && liquidityUsd > 100_000 && ageRounds != null && ageRounds > ROUNDS_PER_DAY * 30) {
    score -= 15
    reasons.push('Deep liquidity and age over 30 days (-15)')
  }

  score = clampScore(score)
  if (isBlueChip) {
    score = Math.min(score, 20)
    reasons.push('Blue-chip asset cap applied (max 20)')
  }

  const result: TokenRiskResult = { score, band: scoreToBand(score), reasons }
  writeScoreCache(assetId, result)
  return result
}

export function getServerMaxTokenRisk(): number {
  const raw = process.env.ZUIK_MAX_TOKEN_RISK ?? process.env.MAX_TOKEN_RISK
  if (!raw) return 75
  const n = Number(raw)
  if (!Number.isFinite(n)) return 75
  return Math.max(0, Math.min(100, Math.round(n)))
}

export function isRiskScoreAllowed(score: number, maxScore: number): boolean {
  return score <= maxScore
}
