import algosdk from 'algosdk'
import { getAlgodClient } from './algorand.js'

/**
 * Read-only view of the Guardian per-agent policy and pause flag.
 *
 * This module ONLY reads on-chain state. It never builds, signs, or submits a transaction.
 * The authoritative limits live in the Guardian app (App 763727553 on TestNet); the AI
 * decision layer reads them here so it can pre-clamp proposals, but the real enforcement is
 * still done on-chain by authorize_trade when sendAuthorizedPayment submits the atomic group.
 */

export interface GuardianPolicy {
  maxPerTradeMicroAlgos: bigint
  dailyCapMicroAlgos: bigint
  dailySpentMicroAlgos: bigint
  dayResetRound: bigint
  expiryRound: bigint
  executionsRemaining: bigint
  allowedDexAppId: bigint
  allowedAssetId: bigint
}

export interface GuardianContext {
  guardianAppId: number
  isPaused: boolean
  policy: GuardianPolicy | null
  /** Microalgos still spendable today against the daily cap (>= 0). */
  remainingDailyMicroAlgos: bigint
  /** True when the policy is missing, expired, paused, or out of executions. */
  blocked: boolean
  blockReason?: string
}

const enc = new TextEncoder()

function policyBoxName(agentAddress: string): Uint8Array {
  return new Uint8Array([...enc.encode('pol'), ...algosdk.decodeAddress(agentAddress).publicKey])
}

/**
 * Decode the AgentPolicy ARC-4 struct (8 big-endian uint64s, 64 bytes) from the policy box value.
 * Returns null when the box does not exist (agent not bootstrapped).
 */
function decodePolicy(value: Uint8Array): GuardianPolicy | null {
  if (value.length < 64) return null
  const dv = new DataView(value.buffer, value.byteOffset, value.byteLength)
  return {
    maxPerTradeMicroAlgos: dv.getBigUint64(0),
    dailyCapMicroAlgos: dv.getBigUint64(8),
    dailySpentMicroAlgos: dv.getBigUint64(16),
    dayResetRound: dv.getBigUint64(24),
    expiryRound: dv.getBigUint64(32),
    executionsRemaining: dv.getBigUint64(40),
    allowedDexAppId: dv.getBigUint64(48),
    allowedAssetId: dv.getBigUint64(56),
  }
}

/**
 * Read the recipient allowlist flag from the Guardian 'rcv' BoxMap.
 * Returns false when the recipient box is absent.
 */
export async function isRecipientAllowed(
  guardianAppId: number,
  recipient: string,
): Promise<boolean> {
  if (!guardianAppId || guardianAppId <= 0) return false
  try {
    const name = new Uint8Array([...enc.encode('rcv'), ...algosdk.decodeAddress(recipient).publicKey])
    const box = await getAlgodClient().getApplicationBoxByName(guardianAppId, name).do()
    const v = box.value
    // ARC-4 bool is a single byte; allowed when the stored flag is non-zero.
    return v.length > 0 && v[v.length - 1] !== 0
  } catch {
    return false
  }
}

/**
 * Read the full Guardian context for an agent: pause flag, policy box, and derived headroom.
 * Pure read path - no signing. Used by the AI decision layer to bound its proposals.
 */
export async function readGuardianContext(
  guardianAppId: number,
  agentAddress: string,
): Promise<GuardianContext> {
  const base: GuardianContext = {
    guardianAppId,
    isPaused: false,
    policy: null,
    remainingDailyMicroAlgos: 0n,
    blocked: true,
    blockReason: 'unknown',
  }

  if (!guardianAppId || guardianAppId <= 0) {
    return { ...base, blockReason: 'Guardian app id not configured' }
  }

  const algod = getAlgodClient()

  let isPaused = false
  try {
    const appInfo = await algod.getApplicationByID(guardianAppId).do()
    const globalState = appInfo.params?.globalState ?? []
    for (const kv of globalState) {
      const keyBytes = typeof kv.key === 'string' ? Buffer.from(kv.key, 'base64') : Buffer.from(kv.key)
      if (keyBytes.toString('utf8') === 'isPaused') {
        isPaused = Number(kv.value?.uint ?? 0) !== 0
      }
    }
  } catch {
    // Global state read is best effort; authorize_trade still enforces pause on-chain.
  }

  let policy: GuardianPolicy | null = null
  try {
    const box = await algod.getApplicationBoxByName(guardianAppId, policyBoxName(agentAddress)).do()
    policy = decodePolicy(box.value)
  } catch {
    policy = null
  }

  if (!policy) {
    return { ...base, isPaused, blockReason: 'No Guardian policy registered for this agent' }
  }

  let round = 0n
  try {
    const status = await algod.status().do()
    round = BigInt(status.lastRound ?? 0)
  } catch {
    round = 0n
  }

  // Daily cap headroom: the on-chain counter resets when round >= dayResetRound.
  const spentToday = round >= policy.dayResetRound ? 0n : policy.dailySpentMicroAlgos
  const remainingDaily = policy.dailyCapMicroAlgos > spentToday
    ? policy.dailyCapMicroAlgos - spentToday
    : 0n

  let blocked = false
  let blockReason: string | undefined
  if (isPaused) {
    blocked = true
    blockReason = 'Guardian is paused (emergency_stop active)'
  } else if (round > 0n && round > policy.expiryRound) {
    blocked = true
    blockReason = 'Agent policy has expired'
  } else if (policy.executionsRemaining <= 0n) {
    blocked = true
    blockReason = 'No executions remaining on the agent policy'
  } else if (remainingDaily <= 0n) {
    blocked = true
    blockReason = 'Daily cap reached'
  }

  return {
    guardianAppId,
    isPaused,
    policy,
    remainingDailyMicroAlgos: remainingDaily,
    blocked,
    blockReason,
  }
}

/**
 * The hard ceiling (microAlgos) a single proposed spend may take, given the policy headroom.
 * Returns 0n when nothing can be spent (blocked or out of headroom).
 */
export function maxSpendableMicroAlgos(ctx: GuardianContext): bigint {
  if (ctx.blocked || !ctx.policy) return 0n
  const perTrade = ctx.policy.maxPerTradeMicroAlgos
  const daily = ctx.remainingDailyMicroAlgos
  return perTrade < daily ? perTrade : daily
}
