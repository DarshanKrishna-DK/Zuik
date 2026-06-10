const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:4021'

export type PolicyLifecycleStatus = 'active' | 'expired' | 'missing' | 'paused' | 'pending'

export interface PolicyTemplate {
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
}

export interface AgentPolicyBinding {
  id: string
  agent_address: string
  wallet_address: string
  policy_template_id: string | null
  max_per_trade_microalgos: number | null
  daily_cap_microalgos: number | null
  daily_executions_cap: number | null
  allowed_asset_id: number | null
  expiry_round: number | null
  last_bootstrap_tx_id: string | null
  status: string
}

export interface AgentWalletExtended {
  id: string
  workflow_id: string | null
  wallet_address: string
  agent_address: string
  guardian_app_id: number | null
  budget_microalgos: number | null
  status: string
  display_name: string | null
  policy_binding_id: string | null
  binding_type?: string | null
  created_at: string
}

export interface AgentOverviewEntry {
  wallet: AgentWalletExtended
  balance: {
    balance: number
    minBalance: number
    available: number
    hasKey: boolean
  }
  guardian: {
    appId: number
    isPaused: boolean
    blocked: boolean
    blockReason?: string
    remainingDailyMicroAlgos: string
    policy: {
      maxPerTradeMicroAlgos: string
      dailyCapMicroAlgos: string
      dailySpentMicroAlgos: string
      expiryRound: string
      dailyExecutionsCap: string
      dailyExecutionsSpent: string
      allowedAssetId: string
    } | null
  }
  policyBinding: AgentPolicyBinding | null
  policyTemplate: PolicyTemplate | null
  policyStatus: PolicyLifecycleStatus
  healthScore: number
  currentRound: string
}

export async function fetchPolicyTemplates(ownerAddress?: string): Promise<PolicyTemplate[]> {
  const url = ownerAddress 
    ? `${SERVER_URL}/api/agent-management/policy-templates?ownerAddress=${encodeURIComponent(ownerAddress)}`
    : `${SERVER_URL}/api/agent-management/policy-templates`
  
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to load policy templates')
  const json = (await res.json()) as { templates?: PolicyTemplate[] }
  return json.templates ?? []
}

export async function createCustomPolicyTemplate(params: {
  ownerAddress: string
  name: string
  maxPerTradeMicroAlgos: number
  dailyCapMicroAlgos: number
  dailyExecutionsCap: number
  expiryRoundHorizon?: number
}): Promise<PolicyTemplate> {
  const res = await fetch(`${SERVER_URL}/api/agent-management/policy-templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.error || `Failed to create policy template: ${res.status}`)
  }
  
  const data = await res.json()
  return data.template
}

export async function fetchAgentOverview(ownerAddress: string): Promise<AgentOverviewEntry[]> {
  const res = await fetch(
    `${SERVER_URL}/api/agent-management/overview/${encodeURIComponent(ownerAddress)}`,
  )
  if (!res.ok) throw new Error('Failed to load agent overview')
  const json = (await res.json()) as { agents?: AgentOverviewEntry[] }
  return json.agents ?? []
}

export async function savePolicyBinding(params: {
  ownerAddress: string
  agentAddress: string
  policyTemplateId?: string
  maxPerTradeMicroAlgos?: number
  dailyCapMicroAlgos?: number
  dailyExecutionsCap?: number
  allowedAssetId?: number
}): Promise<AgentPolicyBinding> {
  const res = await fetch(`${SERVER_URL}/api/agent-management/policy-bindings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to save policy binding: ${text}`)
  }
  const json = (await res.json()) as { binding: AgentPolicyBinding }
  return json.binding
}

export async function syncPolicyStatus(
  ownerAddress: string,
  agentAddress: string,
  options?: { bootstrapTxId?: string; expiryRound?: number },
): Promise<{ policyStatus: PolicyLifecycleStatus }> {
  const res = await fetch(
    `${SERVER_URL}/api/agent-management/policy-sync/${encodeURIComponent(agentAddress)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerAddress,
        bootstrapTxId: options?.bootstrapTxId,
        expiryRound: options?.expiryRound,
      }),
    },
  )
  if (!res.ok) throw new Error('Failed to sync policy status')
  const json = (await res.json()) as { policyStatus: PolicyLifecycleStatus }
  return json
}

export async function updateAgentDisplay(
  ownerAddress: string,
  agentAddress: string,
  patch: { displayName?: string; status?: string; budgetMicroAlgos?: number },
): Promise<AgentWalletExtended> {
  const res = await fetch(
    `${SERVER_URL}/api/agent-management/agents/${encodeURIComponent(agentAddress)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerAddress,
        displayName: patch.displayName,
        status: patch.status,
        budgetMicroAlgos: patch.budgetMicroAlgos,
      }),
    },
  )
  if (!res.ok) throw new Error('Failed to update agent')
  const json = (await res.json()) as { wallet: AgentWalletExtended }
  return json.wallet
}

export function policyStatusLabel(status: PolicyLifecycleStatus): string {
  switch (status) {
    case 'active':
      return 'Active'
    case 'expired':
      return 'Expired'
    case 'missing':
      return 'Missing'
    case 'paused':
      return 'Paused'
    case 'pending':
      return 'Pending'
    default:
      return status
  }
}

export function policyStatusVariant(
  status: PolicyLifecycleStatus,
): 'success' | 'warning' | 'error' | 'neutral' | 'info' {
  switch (status) {
    case 'active':
      return 'success'
    case 'expired':
      return 'error'
    case 'missing':
      return 'warning'
    case 'paused':
      return 'error'
    case 'pending':
      return 'info'
    default:
      return 'neutral'
  }
}

export function microToAlgo(micro: string | number | bigint): string {
  const n = Number(micro)
  return (n / 1_000_000).toFixed(2)
}
