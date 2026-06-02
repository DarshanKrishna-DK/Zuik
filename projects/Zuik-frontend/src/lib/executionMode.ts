import type { FlowNode } from './runAgent'
import {
  getAgentWallet,
  fetchAgentBalance,
  createAgentWallet,
  type AgentWalletRow,
  type AgentWalletBalance,
} from '../services/agentWallet'
import { estimateStepFee } from '../services/transactionSimulator'

export type ExecutionMode = 'user' | 'agent'

const STORAGE_KEY = 'zuik_execution_mode_v1'

const BROWSER_SIGNER_BLOCKS = new Set(['swap-token', 'opt-in-asa', 'create-asa', 'call-contract'])

export function getStoredExecutionMode(workflowId: string | null): ExecutionMode {
  if (typeof window === 'undefined') return 'user'
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return 'user'
    const map = JSON.parse(raw) as Record<string, ExecutionMode>
    const key = workflowId ?? '__global__'
    return map[key] === 'agent' ? 'agent' : 'user'
  } catch {
    return 'user'
  }
}

export function setStoredExecutionMode(workflowId: string | null, mode: ExecutionMode): void {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, ExecutionMode>) : {}
    map[workflowId ?? '__global__'] = mode
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

export function workflowUsesBrowserSigner(nodes: FlowNode[]): boolean {
  return nodes.some((n) => {
    const blockId = n.data?.blockId
    return blockId ? BROWSER_SIGNER_BLOCKS.has(blockId) : false
  })
}

/** Sum configured ALGO send-payment amounts (human units) for a rough funding check. */
export function estimateAlgoSpendFromNodes(nodes: FlowNode[]): number {
  let total = 0
  for (const n of nodes) {
    if (n.data.blockId !== 'send-payment') continue
    const asset = Number(n.data.config?.asset ?? 0)
    if (asset !== 0) continue
    const amount = Number(n.data.config?.amount ?? 0)
    if (Number.isFinite(amount) && amount > 0) total += amount
  }
  return total
}

export function estimateRequiredMicroAlgos(nodes: FlowNode[]): number {
  const spendAlgo = estimateAlgoSpendFromNodes(nodes)
  const spendMicro = Math.round(spendAlgo * 1_000_000)
  let fees = 0
  for (const n of nodes) {
    fees += estimateStepFee(n.data.blockId)
  }
  const reserveMicro = 200_000
  return spendMicro + fees + reserveMicro
}

export type AgentReadiness =
  | {
      ok: true
      wallet: AgentWalletRow
      balance: AgentWalletBalance
      requiredMicroAlgos: number
    }
  | {
      ok: false
      code: 'no_workflow' | 'no_agent' | 'no_key' | 'low_balance' | 'incompatible'
      message: string
      wallet?: AgentWalletRow
      balance?: AgentWalletBalance
      requiredMicroAlgos?: number
    }

export async function checkAgentReadiness(
  workflowId: string | null,
  nodes: FlowNode[],
  ownerAddress: string | undefined,
): Promise<AgentReadiness> {
  if (!ownerAddress) {
    return { ok: false, code: 'no_agent', message: 'Connect your wallet first.' }
  }
  if (workflowUsesBrowserSigner(nodes)) {
    return {
      ok: false,
      code: 'incompatible',
      message:
        'This workflow includes swaps or other blocks that need your wallet to sign. Use "You sign" mode or remove those blocks for agent execution.',
    }
  }
  if (!workflowId) {
    return {
      ok: false,
      code: 'no_workflow',
      message: 'Save the workflow first so an agent wallet can be linked to it.',
    }
  }

  let wallet = await getAgentWallet(workflowId)
  if (!wallet) {
    return {
      ok: false,
      code: 'no_agent',
      message: 'No agent wallet for this workflow. Create one below or in Settings.',
    }
  }

  const requiredMicroAlgos = estimateRequiredMicroAlgos(nodes)
  let balance: AgentWalletBalance
  try {
    balance = await fetchAgentBalance(wallet.agent_address)
  } catch {
    return { ok: false, code: 'no_key', message: 'Could not reach the Zuik server for agent balance. Is it running?' }
  }

  if (!balance.hasKey) {
    return {
      ok: false,
      code: 'no_key',
      message: 'Agent key is not on the server. Re-register the agent in Settings.',
      wallet,
      balance,
      requiredMicroAlgos,
    }
  }

  const availableMicro = Math.round(balance.available * 1_000_000)
  if (availableMicro < requiredMicroAlgos) {
    const needAlgo = (requiredMicroAlgos / 1_000_000).toFixed(3)
    const haveAlgo = balance.available.toFixed(3)
    return {
      ok: false,
      code: 'low_balance',
      message: `Agent has ${haveAlgo} ALGO available but this run needs about ${needAlgo} ALGO (payments + fees).`,
      wallet,
      balance,
      requiredMicroAlgos,
    }
  }

  return { ok: true, wallet, balance, requiredMicroAlgos }
}

export async function ensureAgentWalletForWorkflow(
  workflowId: string,
  ownerAddress: string,
  guardianAppId?: number,
): Promise<AgentWalletRow> {
  const existing = await getAgentWallet(workflowId)
  if (existing) return existing
  await createAgentWallet(workflowId, ownerAddress, { guardianAppId })
  const created = await getAgentWallet(workflowId)
  if (!created) throw new Error('Agent wallet was created but could not be loaded.')
  return created
}
