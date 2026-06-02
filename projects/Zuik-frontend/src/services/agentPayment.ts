const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

export interface AgentPaymentParams {
  ownerAddress: string
  agentAddress: string
  recipient: string
  amountMicroAlgos: number | bigint
  assetId?: number
  note?: string
}

export interface AgentPaymentResult {
  txId: string
  txIds: string[]
  confirmedRound: number
}

/**
 * Send ALGO via the server-held agent sub-account and Guardian policy (no browser wallet signature).
 */
export async function sendPaymentViaAgent(params: AgentPaymentParams): Promise<AgentPaymentResult> {
  const { ownerAddress, agentAddress, recipient, amountMicroAlgos, assetId = 0, note } = params

  if (assetId !== 0) {
    throw new Error('Agent execution currently supports ALGO payments only (asset 0).')
  }

  const res = await fetch(`${SERVER_URL}/api/agent-wallets/${encodeURIComponent(agentAddress)}/send-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ownerAddress,
      recipient,
      amountMicroAlgos: Number(amountMicroAlgos),
      assetId,
      note,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Agent payment failed (${res.status}): ${text || res.statusText}`)
  }

  const json = (await res.json()) as {
    txIds?: string[]
    txId?: string
    confirmedRound?: number
  }
  const txIds = json.txIds ?? (json.txId ? [json.txId] : [])
  return {
    txId: txIds[0] ?? '',
    txIds,
    confirmedRound: Number(json.confirmedRound ?? 0),
  }
}

export interface HeadlessWorkflowResult {
  success: boolean
  error?: string
  txIds?: string[]
}

/**
 * Run the full workflow on the server (agent signs send-payment; notifications run server-side).
 */
export async function executeWorkflowHeadless(params: {
  workflowId: string
  ownerAddress: string
  flowJson: { nodes: unknown[]; edges: unknown[] }
}): Promise<HeadlessWorkflowResult> {
  const res = await fetch(`${SERVER_URL}/api/workflows/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { success: false, error: text || res.statusText }
  }

  return (await res.json()) as HeadlessWorkflowResult
}
