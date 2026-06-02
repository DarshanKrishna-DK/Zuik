/** Pure risk rubric (no network / Vite deps). Used by tokenRisk.ts and unit tests. */

export type RiskBand = 'low' | 'moderate' | 'elevated' | 'extreme'

export interface TokenRiskResult {
  score: number
  band: RiskBand
  reasons: string[]
}

export interface RubricAsset {
  id: number
  total: number
  url: string
  manager: string
  freeze: string
  clawback: string
  defaultFrozen: boolean
}

export interface HolderStats {
  top1Pct: number
  top10Pct: number
  reservePct: number
}

const ROUNDS_PER_DAY = 27_000
const ZERO_ADDR = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ'

export function scoreToBand(score: number): RiskBand {
  if (score <= 25) return 'low'
  if (score <= 50) return 'moderate'
  if (score <= 75) return 'elevated'
  return 'extreme'
}

export function riskBandLabel(band: RiskBand): string {
  switch (band) {
    case 'low': return 'Low risk'
    case 'moderate': return 'Moderate'
    case 'elevated': return 'Elevated'
    case 'extreme': return 'Extreme'
  }
}

function isNonZeroAddress(addr: string | undefined): boolean {
  if (!addr || addr.length < 10) return false
  return addr !== ZERO_ADDR
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)))
}

function isGenericUrl(url: string): boolean {
  const u = url.trim().toLowerCase()
  if (!u) return true
  if (u.length < 8) return true
  if (u === 'https://' || u === 'http://') return true
  if (u.includes('example.com') || u.includes('placeholder')) return true
  return false
}

/** Rubric on already-resolved params without network calls. */
export function applyRubricOffline(input: {
  asset: RubricAsset
  holderStats: HolderStats | null
  ageRounds: number | null
  liquidityUsd: number | null
  volume24h: number | null
  isBlueChip: boolean
}): TokenRiskResult {
  let score = 50
  const reasons: string[] = ['Unknown ASA baseline (50)']
  const { asset, holderStats, ageRounds, liquidityUsd, volume24h, isBlueChip } = input

  if (isNonZeroAddress(asset.manager) || isNonZeroAddress(asset.freeze) || isNonZeroAddress(asset.clawback)) {
    score += 15
    reasons.push('Manager, freeze, or clawback address is set (+15)')
  }
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
  return { score, band: scoreToBand(score), reasons }
}
