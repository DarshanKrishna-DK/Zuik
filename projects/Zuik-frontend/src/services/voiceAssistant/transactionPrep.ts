import algosdk from 'algosdk'
import type { TransactionSigner } from 'algosdk'
import { getAlgorandClient } from '../algorand'
import { fundAgentWallet } from '../agentWallet'
import { sendPaymentViaAgent } from '../agentPayment'
import { sendPayment } from '../sendPayment'
import { guardianContract, algoToMicroAlgos, MICRO_PER_ALGO } from '../guardianContract'
import { computeRiskScore, riskBandLabel } from '../tokenRisk'
import { getMaxTokenRiskScore, isRiskScoreAllowed } from '../tokenRiskPolicy'
import { formatMicroAlgo } from '../transactionSimulator'

export type VoiceTransactionKind = 'wallet_payment' | 'fund_agent' | 'agent_payment'

export type VoiceTransactionStatus =
  | 'preparing'
  | 'ready'
  | 'awaiting_approval'
  | 'signing'
  | 'confirmed'
  | 'failed'
  | 'rejected'
  | 'cancelled'

export interface ComplianceCheck {
  id: string
  label: string
  passed: boolean
  severity: 'info' | 'warning' | 'error'
  message: string
}

export interface PreparedVoiceTransaction {
  id: string
  kind: VoiceTransactionKind
  status: VoiceTransactionStatus
  createdAt: number
  title: string
  summary: string
  sender: string
  recipient: string
  amountMicroAlgos: bigint
  amountDisplay: string
  assetId: number
  note?: string
  agentAddress?: string
  ownerAddress?: string
  compliance: ComplianceCheck[]
  approvalSteps: string[]
  voicePrompt: string
  error?: string
  txId?: string
  confirmedRound?: number
}

export interface PrepareWalletPaymentParams {
  sender: string
  recipient: string
  amountAlgo: number
  assetId?: number
  note?: string
}

export interface PrepareFundAgentParams {
  ownerAddress: string
  agentAddress: string
  amountAlgo: number
  note?: string
}

export interface PrepareAgentPaymentParams {
  ownerAddress: string
  agentAddress: string
  recipient: string
  amountAlgo: number
  note?: string
}

type TransactionListener = (tx: PreparedVoiceTransaction | null) => void

let pendingTransaction: PreparedVoiceTransaction | null = null
const listeners = new Set<TransactionListener>()

function notifyListeners(): void {
  for (const listener of listeners) {
    listener(pendingTransaction)
  }
}

function createId(): string {
  return `vtx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function isValidAlgorandAddress(addr: string): boolean {
  try {
    algosdk.decodeAddress(addr)
    return true
  } catch {
    return false
  }
}

async function getCurrentRound(): Promise<bigint> {
  const status = await getAlgorandClient().client.algod.status().do()
  const s = status as unknown as { lastRound?: number | bigint; ['last-round']?: number | bigint }
  return BigInt(s.lastRound ?? s['last-round'] ?? 0)
}

function formatAlgoAmount(amountAlgo: number): string {
  return `${amountAlgo} ALGO`
}

function buildApprovalSteps(kind: VoiceTransactionKind): string[] {
  switch (kind) {
    case 'wallet_payment':
      return [
        'Review the recipient address and amount below.',
        'Click Approve and Sign to open your wallet.',
        'Confirm the transaction in your wallet popup.',
        'Wait for on-chain confirmation before closing this panel.',
      ]
    case 'fund_agent':
      return [
        'Review the agent address and funding amount.',
        'Click Approve and Sign to authorize the transfer from your wallet.',
        'Confirm in your wallet - this funds the agent sub-account for autonomous runs.',
      ]
    case 'agent_payment':
      return [
        'Review the agent payment details and Guardian policy checks.',
        'Click Approve to execute via your registered agent wallet.',
        'The server signs with the agent key after Guardian authorization.',
      ]
    default:
      return ['Review the details, then approve when ready.']
  }
}

export async function validateTokenRiskCompliance(assetId: number): Promise<ComplianceCheck[]> {
  if (assetId === 0) {
    return [
      {
        id: 'token_risk',
        label: 'Token risk',
        passed: true,
        severity: 'info',
        message: 'ALGO transfers skip ASA risk scoring.',
      },
    ]
  }

  const maxScore = getMaxTokenRiskScore()
  try {
    const risk = await computeRiskScore(assetId)
    const allowed = isRiskScoreAllowed(risk.score, maxScore)
    return [
      {
        id: 'token_risk',
        label: 'Token risk',
        passed: allowed,
        severity: allowed ? 'info' : 'error',
        message: allowed
          ? `ASA #${assetId} risk ${risk.score}/100 (${riskBandLabel(risk.band)}) is within your limit of ${maxScore}.`
          : `ASA #${assetId} risk ${risk.score}/100 (${riskBandLabel(risk.band)}) exceeds your limit of ${maxScore}. Adjust in Settings > Risk management.`,
      },
    ]
  } catch {
    return [
      {
        id: 'token_risk',
        label: 'Token risk',
        passed: true,
        severity: 'warning',
        message: `Could not score ASA #${assetId}. Proceed with caution.`,
      },
    ]
  }
}

export async function validateGuardianCompliance(params: {
  ownerAddress: string
  agentAddress: string
  recipient: string
  amountMicroAlgos: bigint
  assetId?: number
}): Promise<ComplianceCheck[]> {
  const checks: ComplianceCheck[] = []
  const assetId = params.assetId ?? 0

  const info = await guardianContract.getContractInfo()
  checks.push({
    id: 'guardian_deployed',
    label: 'Guardian contract',
    passed: info.isDeployed,
    severity: info.isDeployed ? 'info' : 'error',
    message: info.isDeployed
      ? `Guardian app #${info.appId} is deployed on ${info.network}.`
      : 'Guardian contract is not deployed for this network.',
  })

  if (!info.isDeployed) return checks

  const paused = await guardianContract.isPaused(params.ownerAddress)
  checks.push({
    id: 'guardian_paused',
    label: 'Emergency stop',
    passed: !paused,
    severity: paused ? 'error' : 'info',
    message: paused
      ? 'Guardian is paused. Resume in Settings before agent payments.'
      : 'Guardian is active (not paused).',
  })

  const policy = await guardianContract.getPolicy(params.agentAddress, params.ownerAddress)
  if (!policy) {
    checks.push({
      id: 'guardian_policy',
      label: 'Agent policy',
      passed: false,
      severity: 'error',
      message: 'No Guardian policy found for this agent. Bootstrap the agent in Settings first.',
    })
    return checks
  }

  checks.push({
    id: 'guardian_policy',
    label: 'Agent policy',
    passed: true,
    severity: 'info',
    message: 'Guardian policy is registered for this agent.',
  })

  const currentRound = await getCurrentRound()
  const expired = currentRound > policy.expiryRound
  checks.push({
    id: 'policy_expiry',
    label: 'Policy expiry',
    passed: !expired,
    severity: expired ? 'error' : 'info',
    message: expired
      ? 'Agent policy has expired. Re-bootstrap in Settings.'
      : `Policy valid through round ${policy.expiryRound.toString()}.`,
  })

  const withinTradeLimit = params.amountMicroAlgos <= policy.maxPerTradeMicroAlgos
  checks.push({
    id: 'max_per_trade',
    label: 'Per-trade limit',
    passed: withinTradeLimit,
    severity: withinTradeLimit ? 'info' : 'error',
    message: withinTradeLimit
      ? `Amount ${formatMicroAlgo(Number(params.amountMicroAlgos))} ALGO is within the ${formatMicroAlgo(Number(policy.maxPerTradeMicroAlgos))} ALGO per-trade cap.`
      : `Amount exceeds per-trade cap of ${formatMicroAlgo(Number(policy.maxPerTradeMicroAlgos))} ALGO.`,
  })

  const dailyRemaining = policy.dailyCapMicroAlgos - policy.dailySpentMicroAlgos
  const withinDailyCap = params.amountMicroAlgos <= dailyRemaining
  checks.push({
    id: 'daily_cap',
    label: 'Daily cap',
    passed: withinDailyCap,
    severity: withinDailyCap ? 'info' : 'error',
    message: withinDailyCap
      ? `Daily remaining budget: ${formatMicroAlgo(Number(dailyRemaining))} ALGO.`
      : `Daily cap exceeded. Remaining: ${formatMicroAlgo(Number(dailyRemaining > 0n ? dailyRemaining : 0n))} ALGO.`,
  })

  if (assetId > 0 && policy.allowedAssetId !== 0n && BigInt(assetId) !== policy.allowedAssetId) {
    checks.push({
      id: 'allowed_asset',
      label: 'Allowed asset',
      passed: false,
      severity: 'error',
      message: `Policy allows ASA #${policy.allowedAssetId.toString()} only, not ASA #${assetId}.`,
    })
  } else if (assetId === 0 || policy.allowedAssetId === 0n || BigInt(assetId) === policy.allowedAssetId) {
    checks.push({
      id: 'allowed_asset',
      label: 'Allowed asset',
      passed: true,
      severity: 'info',
      message: assetId === 0 ? 'ALGO payment matches policy.' : `ASA #${assetId} is allowed by policy.`,
    })
  }

  const recipientAllowed = await guardianContract.isRecipientAllowed(params.recipient, params.ownerAddress)
  checks.push({
    id: 'recipient_allowlist',
    label: 'Recipient allowlist',
    passed: recipientAllowed,
    severity: recipientAllowed ? 'info' : 'error',
    message: recipientAllowed
      ? 'Recipient is on the Guardian allowlist.'
      : 'Recipient is not allowlisted. Add them in Settings > Agent Management.',
  })

  return checks
}

function hasBlockingCompliance(checks: ComplianceCheck[]): boolean {
  return checks.some((c) => !c.passed && c.severity === 'error')
}

function setPending(tx: PreparedVoiceTransaction | null): void {
  pendingTransaction = tx
  notifyListeners()
}

function patchPending(patch: Partial<PreparedVoiceTransaction>): PreparedVoiceTransaction | null {
  if (!pendingTransaction) return null
  pendingTransaction = { ...pendingTransaction, ...patch }
  notifyListeners()
  return pendingTransaction
}

export function getPendingTransaction(): PreparedVoiceTransaction | null {
  return pendingTransaction
}

export function subscribePendingTransaction(listener: TransactionListener): () => void {
  listeners.add(listener)
  listener(pendingTransaction)
  return () => listeners.delete(listener)
}

export function rejectPendingTransaction(reason = 'Cancelled by user'): void {
  if (!pendingTransaction) return
  patchPending({ status: 'rejected', error: reason })
  setTimeout(() => {
    if (pendingTransaction?.status === 'rejected') setPending(null)
  }, 400)
}

export function dismissPendingTransaction(): void {
  setPending(null)
}

export async function prepareWalletPayment(
  params: PrepareWalletPaymentParams,
): Promise<PreparedVoiceTransaction> {
  const amountMicroAlgos = algoToMicroAlgos(params.amountAlgo)
  const assetId = params.assetId ?? 0

  const tx: PreparedVoiceTransaction = {
    id: createId(),
    kind: 'wallet_payment',
    status: 'preparing',
    createdAt: Date.now(),
    title: 'Wallet payment',
    summary: `Send ${formatAlgoAmount(params.amountAlgo)} to ${params.recipient.slice(0, 8)}...`,
    sender: params.sender,
    recipient: params.recipient,
    amountMicroAlgos,
    amountDisplay: formatAlgoAmount(params.amountAlgo),
    assetId,
    note: params.note,
    compliance: [],
    approvalSteps: buildApprovalSteps('wallet_payment'),
    voicePrompt: '',
  }

  setPending(tx)

  const compliance: ComplianceCheck[] = []

  if (!isValidAlgorandAddress(params.recipient)) {
    compliance.push({
      id: 'recipient_valid',
      label: 'Recipient address',
      passed: false,
      severity: 'error',
      message: 'Recipient is not a valid Algorand address.',
    })
  } else {
    compliance.push({
      id: 'recipient_valid',
      label: 'Recipient address',
      passed: true,
      severity: 'info',
      message: 'Recipient address format is valid.',
    })
  }

  if (params.amountAlgo <= 0) {
    compliance.push({
      id: 'amount_valid',
      label: 'Amount',
      passed: false,
      severity: 'error',
      message: 'Amount must be greater than zero.',
    })
  } else {
    compliance.push({
      id: 'amount_valid',
      label: 'Amount',
      passed: true,
      severity: 'info',
      message: `Sending ${formatAlgoAmount(params.amountAlgo)}.`,
    })
  }

  compliance.push(...(await validateTokenRiskCompliance(assetId)))

  try {
    const algod = getAlgorandClient().client.algod
    const info = await algod.accountInformation(params.sender).do()
    const raw = info as unknown as Record<string, unknown>
    const balance = BigInt(String(raw['amount'] ?? 0))
    const minBal = BigInt(String(raw['min-balance'] ?? raw['minBalance'] ?? 100_000))
    const feeBuffer = 5000n
    const needed = amountMicroAlgos + feeBuffer
    const sufficient = assetId === 0 ? balance >= minBal + needed : balance >= minBal + feeBuffer
    compliance.push({
      id: 'wallet_balance',
      label: 'Wallet balance',
      passed: sufficient,
      severity: sufficient ? 'info' : 'error',
      message: sufficient
        ? `Wallet has ${formatMicroAlgo(Number(balance))} ALGO available.`
        : `Insufficient ALGO balance for this payment and fees.`,
    })
  } catch {
    compliance.push({
      id: 'wallet_balance',
      label: 'Wallet balance',
      passed: true,
      severity: 'warning',
      message: 'Could not verify wallet balance. Double-check before signing.',
    })
  }

  const blocked = hasBlockingCompliance(compliance)
  const voicePrompt = blocked
    ? 'This payment failed compliance checks. Review the errors in the approval panel.'
    : `I prepared a payment of ${formatAlgoAmount(params.amountAlgo)}. Open the approval panel to review and sign in your wallet.`

  patchPending({
    compliance,
    status: blocked ? 'failed' : 'awaiting_approval',
    voicePrompt,
    summary: assetId === 0
      ? `Send ${formatAlgoAmount(params.amountAlgo)} from your wallet to ${params.recipient.slice(0, 10)}...`
      : `Send ASA #${assetId} from your wallet to ${params.recipient.slice(0, 10)}...`,
    error: blocked ? 'Payment did not pass compliance checks.' : undefined,
  })

  return pendingTransaction!
}

export async function prepareFundAgent(
  params: PrepareFundAgentParams,
): Promise<PreparedVoiceTransaction> {
  const amountMicroAlgos = algoToMicroAlgos(params.amountAlgo)

  const tx: PreparedVoiceTransaction = {
    id: createId(),
    kind: 'fund_agent',
    status: 'preparing',
    createdAt: Date.now(),
    title: 'Fund agent wallet',
    summary: `Fund agent with ${formatAlgoAmount(params.amountAlgo)}`,
    sender: params.ownerAddress,
    recipient: params.agentAddress,
    amountMicroAlgos,
    amountDisplay: formatAlgoAmount(params.amountAlgo),
    assetId: 0,
    note: params.note,
    agentAddress: params.agentAddress,
    ownerAddress: params.ownerAddress,
    compliance: [],
    approvalSteps: buildApprovalSteps('fund_agent'),
    voicePrompt: '',
  }

  setPending(tx)

  const compliance: ComplianceCheck[] = []

  if (!isValidAlgorandAddress(params.agentAddress)) {
    compliance.push({
      id: 'agent_valid',
      label: 'Agent address',
      passed: false,
      severity: 'error',
      message: 'Agent address is invalid.',
    })
  } else {
    compliance.push({
      id: 'agent_valid',
      label: 'Agent address',
      passed: true,
      severity: 'info',
      message: `Agent ${params.agentAddress.slice(0, 10)}...`,
    })
  }

  if (params.amountAlgo <= 0) {
    compliance.push({
      id: 'amount_valid',
      label: 'Amount',
      passed: false,
      severity: 'error',
      message: 'Funding amount must be greater than zero.',
    })
  }

  const blocked = hasBlockingCompliance(compliance)
  const voicePrompt = blocked
    ? 'Agent funding failed validation. Check the approval panel for details.'
    : `I prepared funding of ${formatAlgoAmount(params.amountAlgo)} for your agent. Review and sign in your wallet when ready.`

  patchPending({
    compliance,
    status: blocked ? 'failed' : 'awaiting_approval',
    voicePrompt,
    error: blocked ? 'Funding did not pass validation.' : undefined,
  })

  return pendingTransaction!
}

export async function prepareAgentPayment(
  params: PrepareAgentPaymentParams,
): Promise<PreparedVoiceTransaction> {
  const amountMicroAlgos = algoToMicroAlgos(params.amountAlgo)

  const tx: PreparedVoiceTransaction = {
    id: createId(),
    kind: 'agent_payment',
    status: 'preparing',
    createdAt: Date.now(),
    title: 'Agent payment',
    summary: `Agent sends ${formatAlgoAmount(params.amountAlgo)} to ${params.recipient.slice(0, 8)}...`,
    sender: params.agentAddress,
    recipient: params.recipient,
    amountMicroAlgos,
    amountDisplay: formatAlgoAmount(params.amountAlgo),
    assetId: 0,
    note: params.note,
    agentAddress: params.agentAddress,
    ownerAddress: params.ownerAddress,
    compliance: [],
    approvalSteps: buildApprovalSteps('agent_payment'),
    voicePrompt: '',
  }

  setPending(tx)

  const compliance: ComplianceCheck[] = []

  if (!isValidAlgorandAddress(params.recipient)) {
    compliance.push({
      id: 'recipient_valid',
      label: 'Recipient address',
      passed: false,
      severity: 'error',
      message: 'Recipient is not a valid Algorand address.',
    })
  }

  compliance.push(
    ...(await validateGuardianCompliance({
      ownerAddress: params.ownerAddress,
      agentAddress: params.agentAddress,
      recipient: params.recipient,
      amountMicroAlgos,
      assetId: 0,
    })),
  )

  const blocked = hasBlockingCompliance(compliance)
  const voicePrompt = blocked
    ? 'This agent payment failed Guardian checks. Review the approval panel.'
    : `I prepared an agent payment of ${formatAlgoAmount(params.amountAlgo)}. Approve in the panel to execute with Guardian enforcement.`

  patchPending({
    compliance,
    status: blocked ? 'failed' : 'awaiting_approval',
    voicePrompt,
    error: blocked ? 'Agent payment did not pass Guardian compliance.' : undefined,
  })

  return pendingTransaction!
}

export async function signPreparedTransaction(
  tx: PreparedVoiceTransaction,
  signer?: TransactionSigner,
): Promise<PreparedVoiceTransaction> {
  if (tx.status !== 'awaiting_approval') {
    throw new Error(`Transaction is not ready to sign (status: ${tx.status}).`)
  }

  if (hasBlockingCompliance(tx.compliance)) {
    throw new Error('Transaction has blocking compliance errors.')
  }

  patchPending({ ...tx, status: 'signing', error: undefined })

  try {
    switch (tx.kind) {
      case 'wallet_payment': {
        if (!signer) throw new Error('Wallet signer required for this payment.')
        const result = await sendPayment({
          sender: tx.sender,
          receiver: tx.recipient,
          amount: tx.amountMicroAlgos,
          assetId: tx.assetId,
          note: tx.note,
          signer,
        })
        return patchPending({
          status: 'confirmed',
          txId: result.txId,
          confirmedRound: result.confirmedRound,
          voicePrompt: `Payment confirmed. Transaction ID ${result.txId.slice(0, 10)}.`,
        })!
      }
      case 'fund_agent': {
        if (!signer) throw new Error('Wallet signer required to fund agent.')
        if (!tx.agentAddress) throw new Error('Missing agent address.')
        const result = await fundAgentWallet({
          ownerAddress: tx.sender,
          agentAddress: tx.agentAddress,
          amountMicroAlgos: tx.amountMicroAlgos,
          signer,
          note: tx.note,
        })
        return patchPending({
          status: 'confirmed',
          txId: result.txId,
          confirmedRound: result.confirmedRound,
          voicePrompt: `Agent funded. Transaction ID ${result.txId.slice(0, 10)}.`,
        })!
      }
      case 'agent_payment': {
        if (!tx.agentAddress || !tx.ownerAddress) throw new Error('Missing agent or owner address.')
        const result = await sendPaymentViaAgent({
          ownerAddress: tx.ownerAddress,
          agentAddress: tx.agentAddress,
          recipient: tx.recipient,
          amountMicroAlgos: tx.amountMicroAlgos,
          note: tx.note,
        })
        return patchPending({
          status: 'confirmed',
          txId: result.txId,
          confirmedRound: result.confirmedRound,
          voicePrompt: `Agent payment sent. Transaction ID ${result.txId.slice(0, 10)}.`,
        })!
      }
      default:
        throw new Error(`Unsupported transaction kind: ${tx.kind satisfies never}`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    patchPending({ status: 'failed', error: message })
    throw err
  }
}

/** Estimate fee for an unsigned payment (does not sign or submit). */
export async function buildUnsignedPaymentPreview(params: {
  sender: string
  recipient: string
  amountMicroAlgos: bigint
  note?: string
}): Promise<{ fee: number }> {
  void params
  return { fee: 1000 }
}

export { MICRO_PER_ALGO, formatMicroAlgo }
