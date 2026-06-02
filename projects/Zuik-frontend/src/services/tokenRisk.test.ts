/**
 * Run: npx tsx src/services/tokenRisk.test.ts
 */
import { applyRubricOffline } from './tokenRiskCore'
import type { RubricAsset } from './tokenRiskCore'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

const baseAsset: RubricAsset = {
  id: 999,
  total: 1_000_000_000,
  url: '',
  manager: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ',
  freeze: '',
  clawback: '',
  defaultFrozen: false,
}

// Concentrated new token with no liquidity should score high
const risky = applyRubricOffline({
  asset: baseAsset,
  holderStats: { top1Pct: 80, top10Pct: 95, reservePct: 60 },
  ageRounds: 1000,
  liquidityUsd: 100,
  volume24h: 0,
  isBlueChip: false,
})
assert(risky.score >= 76, `expected extreme band, got ${risky.score}`)
assert(risky.band === 'extreme', `expected extreme band label, got ${risky.band}`)

// Blue-chip cap
const blue = applyRubricOffline({
  asset: { ...baseAsset, id: 10458941 },
  holderStats: { top1Pct: 80, top10Pct: 95, reservePct: 60 },
  ageRounds: 1000,
  liquidityUsd: 100,
  volume24h: 0,
  isBlueChip: true,
})
assert(blue.score <= 20, `blue-chip cap failed: ${blue.score}`)

// Mature liquid asset should score lower
const safer = applyRubricOffline({
  asset: { ...baseAsset, manager: '', freeze: '', clawback: '', url: 'https://example.org/asset.json' },
  holderStats: { top1Pct: 5, top10Pct: 20, reservePct: 10 },
  ageRounds: 40 * 27_000,
  liquidityUsd: 500_000,
  volume24h: 50_000,
  isBlueChip: false,
})
assert(safer.score < 50, `expected moderate or lower, got ${safer.score}`)

console.log('tokenRisk.test.ts: all assertions passed')
