import { computeRiskScore, getServerMaxTokenRisk, isRiskScoreAllowed, scoreToBand, type TokenRiskResult } from './tokenRisk.js'
import type { GuardianContext } from './guardianPolicy.js'

const BLOCK_TOKEN_FIELDS: Record<string, string[]> = {
  'send-payment': ['asset'],
  'swap-token': ['fromAsset', 'toAsset'],
  'opt-in-asa': ['assetId'],
  'get-token-price': ['assetId'],
  'get-pool-reserves': ['asset1', 'asset2'],
  'get-swap-quote': ['fromAsset', 'toAsset'],
  'wallet-event': ['assetId'],
}

export function collectAssetIdsFromConfig(
  blockId: string,
  config: Record<string, string | number | undefined>,
): number[] {
  const fields = BLOCK_TOKEN_FIELDS[blockId]
  if (!fields) return []
  const ids: number[] = []
  for (const field of fields) {
    const raw = config[field]
    if (raw === '' || raw === undefined || raw === null) continue
    if (typeof raw === 'string' && /\{\{.*\}\}/.test(raw)) continue
    const id = Number(raw)
    if (Number.isFinite(id) && id > 0) ids.push(id)
  }
  return ids
}

export interface TokenRiskGateResult {
  allowed: boolean
  assetId?: number
  risk?: TokenRiskResult
  maxScore: number
  reason?: string
}

/**
 * Off-chain risk gate aligned with the Guardian model: on-chain policy caps spend,
 * this layer blocks workflows that reference ASAs above the configured risk ceiling.
 */
export async function checkAssetRiskGate(
  assetId: number,
  maxScore: number = getServerMaxTokenRisk(),
): Promise<TokenRiskGateResult> {
  if (assetId === 0) {
    return { allowed: true, maxScore }
  }
  const risk = await computeRiskScore(assetId)
  if (!isRiskScoreAllowed(risk.score, maxScore)) {
    return {
      allowed: false,
      assetId,
      risk,
      maxScore,
      reason: `ASA #${assetId} risk ${risk.score}/100 (${scoreToBand(risk.score)}) exceeds limit ${maxScore}`,
    }
  }
  return { allowed: true, assetId, risk, maxScore }
}

/** Merge Guardian policy asset allowlist with token risk for agent spends. */
export async function guardianAllowsAsset(
  ctx: GuardianContext,
  assetId: number,
  maxScore: number = getServerMaxTokenRisk(),
): Promise<{ allowed: boolean; reason?: string }> {
  if (ctx.blocked) {
    return { allowed: false, reason: ctx.blockReason }
  }
  const policyAsset = ctx.policy?.allowedAssetId ?? 0n
  if (assetId !== 0 && policyAsset !== 0n && BigInt(assetId) !== policyAsset) {
    return {
      allowed: false,
      reason: `Guardian policy only allows ASA #${policyAsset.toString()}; workflow references ASA #${assetId}`,
    }
  }
  const riskGate = await checkAssetRiskGate(assetId, maxScore)
  if (!riskGate.allowed) {
    return { allowed: false, reason: riskGate.reason }
  }
  return { allowed: true }
}

export async function checkWorkflowBlockRisk(
  blockId: string,
  config: Record<string, string | number | undefined>,
  maxScore: number = getServerMaxTokenRisk(),
): Promise<TokenRiskGateResult> {
  const ids = collectAssetIdsFromConfig(blockId, config)
  for (const assetId of ids) {
    const gate = await checkAssetRiskGate(assetId, maxScore)
    if (!gate.allowed) return gate
  }
  return { allowed: true, maxScore }
}
