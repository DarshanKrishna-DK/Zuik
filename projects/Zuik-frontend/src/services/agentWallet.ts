import algosdk from 'algosdk'
import type { TransactionSigner } from 'algosdk'
import { microAlgo } from '@algorandfoundation/algokit-utils'
import { getAlgorandClient } from './algorand'
import { getSupabase, isSupabaseConfigured } from './supabase'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

export interface AgentWalletRow {
  id: string
  workflow_id: string | null
  wallet_address: string
  agent_address: string
  guardian_app_id: number | null
  budget_microalgos: number | null
  status: string
  created_at: string
}

export interface CreatedAgentWallet {
  /** Public Algorand address of the freshly generated agent sub-account. */
  agentAddress: string
  /** 25-word mnemonic. Handed to the server keystore; never persisted in Supabase or the bundle. */
  mnemonic: string
}

/**
 * Generate a fresh Ed25519 agent sub-account for a workflow.
 *
 * The mnemonic is POSTed to the 24/7 server, which stores it in its keystore and upserts
 * public metadata (owner, agent address, guardian app id, budget) into Supabase agent_wallets.
 * The secret never touches Supabase or the frontend bundle beyond this in-memory hand-off.
 */
export async function createAgentWallet(
  workflowId: string,
  ownerAddress: string,
  options?: { guardianAppId?: number; budgetMicroAlgos?: number | bigint },
): Promise<CreatedAgentWallet> {
  const account = algosdk.generateAccount()
  const agentAddress = account.addr.toString()
  const mnemonic = algosdk.secretKeyToMnemonic(account.sk)

  const guardianAppId =
    options?.guardianAppId ?? (parseInt(import.meta.env.VITE_GUARDIAN_APP_ID || '0', 10) || undefined)

  const res = await fetch(`${SERVER_URL}/api/agent-wallets/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workflowId,
      ownerAddress,
      agentAddress,
      mnemonic,
      guardianAppId,
      budgetMicroAlgos:
        options?.budgetMicroAlgos != null ? Number(options.budgetMicroAlgos) : undefined,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Agent wallet registration failed (${res.status}): ${text}`)
  }

  return { agentAddress, mnemonic }
}

/**
 * Read the agent wallet metadata for a workflow from Supabase. Returns null when none exists.
 */
export async function getAgentWallet(workflowId: string): Promise<AgentWalletRow | null> {
  if (!isSupabaseConfigured()) return null
  try {
    const sb = getSupabase()
    const { data, error } = await sb
      .from('agent_wallets')
      .select('id, workflow_id, wallet_address, agent_address, guardian_app_id, budget_microalgos, status, created_at')
      .eq('workflow_id', workflowId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) return null
    return (data as AgentWalletRow | null) ?? null
  } catch {
    return null
  }
}

export interface FundAgentResult {
  txId: string
  confirmedRound: number
}

export interface AgentWalletBalance {
  balance: number
  minBalance: number
  available: number
  hasKey: boolean
}

const AGENT_LABELS_KEY = 'zuik_agent_labels_v1'

/** Optional display names keyed by agent address (local only). */
export function getAgentLabel(agentAddress: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(AGENT_LABELS_KEY)
    if (!raw) return null
    const map = JSON.parse(raw) as Record<string, string>
    const label = map[agentAddress]?.trim()
    return label || null
  } catch {
    return null
  }
}

export function setAgentLabel(agentAddress: string, label: string): void {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(AGENT_LABELS_KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {}
    const trimmed = label.trim()
    if (trimmed) map[agentAddress] = trimmed
    else delete map[agentAddress]
    localStorage.setItem(AGENT_LABELS_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

/** List all agent wallets for the connected owner (includes inactive/archived). */
export async function listAgentWallets(ownerAddress: string): Promise<AgentWalletRow[]> {
  try {
    const res = await fetch(`${SERVER_URL}/api/agent-wallets/by-wallet/${encodeURIComponent(ownerAddress)}`)
    if (res.ok) {
      const json = (await res.json()) as { wallets?: AgentWalletRow[] }
      return json.wallets ?? []
    }
  } catch {
    /* fall through to Supabase */
  }

  if (!isSupabaseConfigured()) {
    throw new Error('Could not load agents. Start the Zuik server or configure Supabase.')
  }

  const sb = getSupabase()
  const { data, error } = await sb
    .from('agent_wallets')
    .select('id, workflow_id, wallet_address, agent_address, guardian_app_id, budget_microalgos, status, created_at')
    .eq('wallet_address', ownerAddress)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to load agents from Supabase: ${error.message}`)
  return (data as AgentWalletRow[]) ?? []
}

/** On-chain balance for an agent sub-account. */
export async function fetchAgentBalance(agentAddress: string): Promise<AgentWalletBalance> {
  const res = await fetch(`${SERVER_URL}/api/agent-wallets/${encodeURIComponent(agentAddress)}/balance`)
  if (!res.ok) {
    throw new Error('Failed to fetch agent balance')
  }
  const json = (await res.json()) as {
    balance?: { balance: number; minBalance: number; available: number }
    hasKey?: boolean
  }
  const b = json.balance
  return {
    balance: b?.balance ?? 0,
    minBalance: b?.minBalance ?? 0.1,
    available: b?.available ?? 0,
    hasKey: Boolean(json.hasKey),
  }
}

export async function updateAgentWallet(
  ownerAddress: string,
  agentAddress: string,
  patch: { status?: 'active' | 'inactive' | 'archived'; budgetMicroAlgos?: number | bigint },
): Promise<AgentWalletRow> {
  const budgetMicroAlgos =
    patch.budgetMicroAlgos != null ? Number(patch.budgetMicroAlgos) : undefined
  try {
    const res = await fetch(`${SERVER_URL}/api/agent-wallets/${encodeURIComponent(agentAddress)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerAddress,
        status: patch.status,
        budgetMicroAlgos,
      }),
    })
    if (res.ok) {
      const json = (await res.json()) as { wallet: AgentWalletRow }
      return json.wallet
    }
  } catch {
    /* fall through */
  }

  if (!isSupabaseConfigured()) {
    throw new Error('Could not update agent. Start the Zuik server or configure Supabase.')
  }

  const rowPatch: Record<string, unknown> = {}
  if (patch.status) rowPatch.status = patch.status
  if (budgetMicroAlgos != null) rowPatch.budget_microalgos = budgetMicroAlgos

  const sb = getSupabase()
  const { data, error } = await sb
    .from('agent_wallets')
    .update(rowPatch)
    .eq('agent_address', agentAddress)
    .eq('wallet_address', ownerAddress)
    .select('id, workflow_id, wallet_address, agent_address, guardian_app_id, budget_microalgos, status, created_at')
    .maybeSingle()

  if (error || !data) throw new Error(error?.message ?? 'Agent wallet not found')
  return data as AgentWalletRow
}

export async function deleteAgentWallet(ownerAddress: string, agentAddress: string): Promise<void> {
  const res = await fetch(
    `${SERVER_URL}/api/agent-wallets/${encodeURIComponent(agentAddress)}?ownerAddress=${encodeURIComponent(ownerAddress)}`,
    { method: 'DELETE' },
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Delete failed (${res.status}): ${text}`)
  }
}

/**
 * Build and send the ONE user-signed funding payment from the connected wallet to the agent
 * sub-account. This is the single routine signature the user makes for autonomous execution.
 */
export async function fundAgentWallet(params: {
  ownerAddress: string
  agentAddress: string
  amountMicroAlgos: number | bigint
  signer: TransactionSigner
  note?: string
}): Promise<FundAgentResult> {
  const { ownerAddress, agentAddress, amountMicroAlgos, signer, note } = params
  const algorand = getAlgorandClient()
  const result = await algorand.send.payment({
    signer,
    sender: ownerAddress,
    receiver: agentAddress,
    amount:
      typeof amountMicroAlgos === 'bigint'
        ? microAlgo(amountMicroAlgos)
        : microAlgo(Number(amountMicroAlgos)),
    note: note ? new TextEncoder().encode(note) : undefined,
  })
  return {
    txId: result.txIds[0] ?? '',
    confirmedRound: Number(result.confirmation?.confirmedRound ?? 0),
  }
}
