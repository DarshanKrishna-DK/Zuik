/**
 * Policy template definitions and resolution for agent-policy bindings.
 */

export interface PolicyTemplateRow {
  id: string
  slug: string
  name: string
  description: string | null
  max_per_trade_microalgos: number
  daily_cap_microalgos: number
  daily_executions_cap: number
  expiry_round_horizon: number
  allowed_asset_id: number
  allowed_dex_app_id: number
  is_system: boolean
  wallet_address: string | null
  created_at: string
}

export interface AgentPolicyBindingRow {
  id: string
  agent_address: string
  wallet_address: string
  policy_template_id: string | null
  max_per_trade_microalgos: number | null
  daily_cap_microalgos: number | null
  daily_executions_cap: number | null
  allowed_asset_id: number | null
  allowed_dex_app_id: number | null
  expiry_round: number | null
  last_bootstrap_tx_id: string | null
  status: string
  created_at: string
  updated_at: string
}

export type PolicyLifecycleStatus = 'active' | 'expired' | 'missing' | 'paused' | 'pending'

export interface ResolvedPolicyParams {
  maxPerTradeMicroAlgos: bigint
  dailyCapMicroAlgos: bigint
  dailyExecutionsCap: bigint
  expiryRoundHorizon: bigint
  allowedAssetId: bigint
  allowedDexAppId: bigint
}

/** Merge template defaults with optional binding overrides. */
export function resolvePolicyParams(
  template: PolicyTemplateRow | null,
  binding: AgentPolicyBindingRow | null,
): ResolvedPolicyParams | null {
  if (!template && !binding) return null

  const maxPerTrade =
    binding?.max_per_trade_microalgos ?? template?.max_per_trade_microalgos ?? 0
  const dailyCap = binding?.daily_cap_microalgos ?? template?.daily_cap_microalgos ?? 0
  const executions = binding?.daily_executions_cap ?? template?.daily_executions_cap ?? 0
  const horizon = template?.expiry_round_horizon ?? 30000
  const assetId = binding?.allowed_asset_id ?? template?.allowed_asset_id ?? 0
  const dexId = binding?.allowed_dex_app_id ?? template?.allowed_dex_app_id ?? 0

  if (maxPerTrade <= 0 || dailyCap <= 0 || executions <= 0) return null

  return {
    maxPerTradeMicroAlgos: BigInt(maxPerTrade),
    dailyCapMicroAlgos: BigInt(dailyCap),
    dailyExecutionsCap: BigInt(executions),
    expiryRoundHorizon: BigInt(horizon),
    allowedAssetId: BigInt(assetId),
    allowedDexAppId: BigInt(dexId),
  }
}

/** Derive UI lifecycle status from on-chain Guardian context. */
export function derivePolicyLifecycleStatus(
  isPaused: boolean,
  hasOnChainPolicy: boolean,
  isExpired: boolean,
  bindingStatus?: string,
): PolicyLifecycleStatus {
  if (isPaused) return 'paused'
  if (!hasOnChainPolicy) return bindingStatus === 'pending' ? 'pending' : 'missing'
  if (isExpired) return 'expired'
  return 'active'
}
