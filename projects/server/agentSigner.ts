import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import algosdk, { type TransactionSigner } from 'algosdk'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Server-side keystore for funded agent sub-account secrets.
 *
 * Secrets live ONLY on the server: either in process.env.ZUIK_AGENT_KEYS (a JSON map of
 * agentAddress -> 25-word mnemonic) or in a gitignored .keystore.json next to the server.
 * The agent SECRET is never stored in Supabase, never logged, and never returned to the client.
 */

const KEYSTORE_PATH = path.resolve(process.cwd(), process.env.ZUIK_KEYSTORE_FILE ?? '.keystore.json')
const GUARDIAN_APP_ID = Number(process.env.GUARDIAN_APP_ID ?? process.env.VITE_GUARDIAN_APP_ID ?? 0)

type KeystoreMap = Record<string, string>

let cachedKeystore: KeystoreMap | null = null

function loadEnvKeys(): KeystoreMap {
  const raw = process.env.ZUIK_AGENT_KEYS
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as KeystoreMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    console.warn('[AgentSigner] ZUIK_AGENT_KEYS is not valid JSON; ignoring it.')
    return {}
  }
}

function loadFileKeys(): KeystoreMap {
  try {
    if (!fs.existsSync(KEYSTORE_PATH)) return {}
    const parsed = JSON.parse(fs.readFileSync(KEYSTORE_PATH, 'utf8')) as KeystoreMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    console.warn('[AgentSigner] Could not read keystore file; ignoring it.')
    return {}
  }
}

function getKeystore(): KeystoreMap {
  if (!cachedKeystore) {
    cachedKeystore = { ...loadFileKeys(), ...loadEnvKeys() }
  }
  return cachedKeystore
}

function persistFileKeys(map: KeystoreMap): void {
  try {
    fs.writeFileSync(KEYSTORE_PATH, JSON.stringify(map, null, 2), { mode: 0o600 })
  } catch (e) {
    console.warn('[AgentSigner] Could not persist keystore file:', e instanceof Error ? e.message : e)
  }
}

/**
 * Validate that a mnemonic derives the given agentAddress, then store it server-side.
 * NEVER logs the mnemonic.
 */
export function storeAgentKey(agentAddress: string, mnemonic: string): void {
  let account: algosdk.Account
  try {
    account = algosdk.mnemonicToSecretKey(mnemonic)
  } catch {
    throw new Error('Invalid agent mnemonic')
  }
  if (account.addr.toString() !== agentAddress) {
    throw new Error('Mnemonic does not match the provided agent address')
  }

  const keystore = getKeystore()
  keystore[agentAddress] = mnemonic
  // Only the env-provided keys are read-only; everything registered at runtime is file-backed.
  const fileKeys = loadFileKeys()
  fileKeys[agentAddress] = mnemonic
  persistFileKeys(fileKeys)
}

export function hasAgentKey(agentAddress: string): boolean {
  return Boolean(getKeystore()[agentAddress])
}

/** Remove an agent secret from the runtime keystore and gitignored file store. */
export function removeAgentKey(agentAddress: string): void {
  const keystore = getKeystore()
  delete keystore[agentAddress]
  const fileKeys = loadFileKeys()
  delete fileKeys[agentAddress]
  persistFileKeys(fileKeys)
}

/**
 * Returns an algosdk TransactionSigner for the agent sub-account, or null if no key is held.
 */
export function getAgentSigner(agentAddress: string): TransactionSigner | null {
  const mnemonic = getKeystore()[agentAddress]
  if (!mnemonic) return null
  try {
    const account = algosdk.mnemonicToSecretKey(mnemonic)
    return algosdk.makeBasicAccountTransactionSigner(account)
  } catch {
    return null
  }
}

export interface AgentExecutionContext {
  agentAddress: string
  signer: TransactionSigner
  guardianAppId: number
}

/**
 * Build the execution context for a known agent address (signer + Guardian app id).
 * Returns null when the server does not hold the key for that agent.
 */
export async function getAgentExecutionContext(
  agentAddress: string | null | undefined,
  guardianAppId?: number,
): Promise<AgentExecutionContext | null> {
  if (!agentAddress) return null
  const signer = getAgentSigner(agentAddress)
  if (!signer) {
    console.warn(`[AgentSigner] No key held for agent ${agentAddress.slice(0, 8)}...; send-payment will be skipped.`)
    return null
  }
  return {
    agentAddress,
    signer,
    guardianAppId: guardianAppId ?? GUARDIAN_APP_ID,
  }
}

/**
 * Resolve the agent execution context for a workflow by reading agent_wallets metadata.
 * First tries workflow-specific agent, then falls back to shared agent for the owner.
 * Returns null when no active agent wallet exists or the server lacks the key.
 */
export async function getAgentExecutionContextForWorkflow(
  sb: SupabaseClient,
  workflowId: string,
): Promise<AgentExecutionContext | null> {
  try {
    // First, try workflow-specific agent
    const { data: workflowAgent, error: workflowError } = await sb
      .from('agent_wallets')
      .select('agent_address, guardian_app_id, status, wallet_address')
      .eq('workflow_id', workflowId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (workflowAgent?.agent_address) {
      return getAgentExecutionContext(
        workflowAgent.agent_address as string,
        workflowAgent.guardian_app_id ? Number(workflowAgent.guardian_app_id) : GUARDIAN_APP_ID || undefined,
      )
    }

    // Fallback: find any active agent for this owner (agent sharing)
    const { data: workflow } = await sb
      .from('workflows')
      .select('wallet_address')
      .eq('id', workflowId)
      .single()

    if (workflow?.wallet_address) {
      const { data: sharedAgent } = await sb
        .from('agent_wallets')
        .select('agent_address, guardian_app_id, status')
        .eq('wallet_address', workflow.wallet_address)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (sharedAgent?.agent_address) {
        console.log(`[AgentSigner] Using shared agent ${sharedAgent.agent_address.slice(0, 8)}... for workflow ${workflowId}`)
        return getAgentExecutionContext(
          sharedAgent.agent_address as string,
          sharedAgent.guardian_app_id ? Number(sharedAgent.guardian_app_id) : GUARDIAN_APP_ID || undefined,
        )
      }
    }

    return null
  } catch {
    return null
  }
}
