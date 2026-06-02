import { computeRiskScore, riskBandLabel, type TokenRiskResult } from './tokenRisk'
import type { SimulationWarning } from './transactionSimulator'

export const MAX_TOKEN_RISK_STORAGE_KEY = 'zuik_max_token_risk_v1'
/** Default blocks extreme band (76-100); allows low through elevated. */
export const DEFAULT_MAX_TOKEN_RISK = 75

/** Block config fields that hold ASA ids (0 = ALGO). */
const BLOCK_TOKEN_FIELDS: Record<string, string[]> = {
  'send-payment': ['asset'],
  'swap-token': ['fromAsset', 'toAsset'],
  'opt-in-asa': ['assetId'],
  'get-token-price': ['assetId'],
  'get-pool-reserves': ['asset1', 'asset2'],
  'get-swap-quote': ['fromAsset', 'toAsset'],
  'wallet-event': ['assetId'],
}

export function getMaxTokenRiskScore(): number {
  if (typeof window === 'undefined') return DEFAULT_MAX_TOKEN_RISK
  try {
    const raw = localStorage.getItem(MAX_TOKEN_RISK_STORAGE_KEY)
    if (!raw) return DEFAULT_MAX_TOKEN_RISK
    const n = Number(raw)
    if (!Number.isFinite(n)) return DEFAULT_MAX_TOKEN_RISK
    return Math.max(0, Math.min(100, Math.round(n)))
  } catch {
    return DEFAULT_MAX_TOKEN_RISK
  }
}

export function setMaxTokenRiskScore(score: number): void {
  if (typeof window === 'undefined') return
  const clamped = Math.max(0, Math.min(100, Math.round(score)))
  localStorage.setItem(MAX_TOKEN_RISK_STORAGE_KEY, String(clamped))
}

export function isRiskScoreAllowed(score: number, maxScore: number): boolean {
  return score <= maxScore
}

export function collectAssetIdsFromBlocks(
  actionBlocks: { blockId: string; config: Record<string, string | number | undefined> }[],
): number[] {
  const ids = new Set<number>()
  for (const { blockId, config } of actionBlocks) {
    const fields = BLOCK_TOKEN_FIELDS[blockId]
    if (!fields) continue
    for (const field of fields) {
      const raw = config[field]
      if (raw === '' || raw === undefined || raw === null) continue
      if (typeof raw === 'string' && /\{\{.*\}\}/.test(raw)) continue
      const id = Number(raw)
      if (Number.isFinite(id) && id > 0) ids.add(id)
    }
  }
  return [...ids]
}

function formatAssetRiskMessage(assetId: number, risk: TokenRiskResult, maxScore: number): string {
  return (
    `ASA #${assetId} risk score ${risk.score}/100 (${riskBandLabel(risk.band)}) exceeds your limit of ${maxScore}. ` +
    `Lower the score in Settings > Risk management or choose a safer token.`
  )
}

/**
 * Pre-flight token risk checks for workflow execution and simulation.
 * ALGO (id 0) is always allowed.
 */
export async function checkBlocksTokenRisk(
  actionBlocks: { blockId: string; config: Record<string, string | number | undefined> }[],
  maxScore: number = getMaxTokenRiskScore(),
): Promise<{ errors: SimulationWarning[]; warnings: SimulationWarning[] }> {
  const errors: SimulationWarning[] = []
  const warnings: SimulationWarning[] = []
  const assetIds = collectAssetIdsFromBlocks(actionBlocks)

  for (const assetId of assetIds) {
    const risk = await computeRiskScore(assetId)
    if (!isRiskScoreAllowed(risk.score, maxScore)) {
      errors.push({
        severity: 'error',
        message: formatAssetRiskMessage(assetId, risk, maxScore),
        field: 'asset',
      })
      continue
    }
    if (risk.band === 'elevated' && maxScore < 100) {
      warnings.push({
        severity: 'warning',
        message: `ASA #${assetId} is elevated risk (${risk.score}/100). Review concentration and liquidity before executing.`,
      })
    }
    if (risk.band === 'extreme' && maxScore >= 76) {
      warnings.push({
        severity: 'warning',
        message: `ASA #${assetId} is extreme risk (${risk.score}/100). You raised the limit above the default - proceed only if intentional.`,
      })
    }
  }

  return { errors, warnings }
}

/** Single-asset check for Guardian ASA bootstrap. */
export async function assertAssetWithinRiskLimit(
  assetId: number,
  maxScore: number = getMaxTokenRiskScore(),
): Promise<void> {
  if (assetId === 0) return
  const risk = await computeRiskScore(assetId)
  if (!isRiskScoreAllowed(risk.score, maxScore)) {
    throw new Error(formatAssetRiskMessage(assetId, risk, maxScore))
  }
}
