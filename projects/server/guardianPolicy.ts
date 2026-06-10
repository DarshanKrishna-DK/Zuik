import algosdk from 'algosdk'
import { getAlgodClient } from './algorand.js'

// Read-only Guardian policy view. Actual enforcement happens in authorize_trade on-chain.

export interface GuardianPolicy {
  maxPerTradeMicroAlgos: bigint
  dailyCapMicroAlgos: bigint
  dailySpentMicroAlgos: bigint
  dayResetRound: bigint
  expiryRound: bigint
  dailyExecutionsCap: bigint
  dailyExecutionsSpent: bigint
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

function decodePolicy(value: Uint8Array): GuardianPolicy | null {
  // 8 x uint64 (64 bytes) on current TestNet deploy; newer builds may pad to 72.
  if (value.length < 64) return null
  const dv = new DataView(value.buffer, value.byteOffset, value.byteLength)
  return {
    maxPerTradeMicroAlgos: dv.getBigUint64(0),
    dailyCapMicroAlgos: dv.getBigUint64(8),
    dailySpentMicroAlgos: dv.getBigUint64(16),
    dayResetRound: dv.getBigUint64(24),
    expiryRound: dv.getBigUint64(32),
    dailyExecutionsCap: dv.getBigUint64(40),
    dailyExecutionsSpent: dv.getBigUint64(48),
    allowedDexAppId: dv.getBigUint64(56),
    allowedAssetId: value.length >= 72 ? dv.getBigUint64(64) : 0n,
  }
}

export async function isRecipientAllowed(
  guardianAppId: number,
  recipient: string,
): Promise<boolean> {
  if (!guardianAppId || guardianAppId <= 0) return false
  try {
    const name = new Uint8Array([...enc.encode('rcv'), ...algosdk.decodeAddress(recipient).publicKey])
    const box = await getAlgodClient().getApplicationBoxByName(guardianAppId, name).do()
    const v = box.value
    // ARC-4 bool: last byte non-zero means allowed.
    return v.length > 0 && v[v.length - 1] !== 0
  } catch {
    return false
  }
}

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
    // If this read fails, authorize_trade still blocks paused agents on-chain.
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

  // Daily counter resets once round passes dayResetRound.
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
  } else if (policy.dailyExecutionsCap - policy.dailyExecutionsSpent <= 0n) {
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

export function maxSpendableMicroAlgos(ctx: GuardianContext): bigint {
  if (ctx.blocked || !ctx.policy) return 0n
  const perTrade = ctx.policy.maxPerTradeMicroAlgos
  const daily = ctx.remainingDailyMicroAlgos
  return perTrade < daily ? perTrade : daily
}
