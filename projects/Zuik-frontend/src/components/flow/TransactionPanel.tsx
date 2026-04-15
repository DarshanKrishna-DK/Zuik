import { useWallet } from '@txnlab/use-wallet-react'
import { useSnackbar } from 'notistack'
import { useState, useEffect, useCallback } from 'react'
import { getExecutableBlocksInOrder } from '../../services/blockExecutors'
import { getAlgorandClient } from '../../services/algorand'
import { getBlockById } from '../../lib/blockRegistry'
import { runFlowOnce, createVariableContext } from '../../lib/runAgent'
import type { FlowNode, FlowEdge } from '../../lib/runAgent'
import {
  buildSimulationPreview,
  enrichSwapQuotes,
  formatMicroAlgo,
  microAlgoToUsd,
} from '../../services/transactionSimulator'
import type { SimulationResult, SimulationWarning } from '../../services/transactionSimulator'
import { runSafetyChecks, recordExecution as recordLocalExecution, suggestFix } from '../../services/safetyGuards'
import type { SafetyCheckResult } from '../../services/safetyGuards'
import {
  isSupabaseConfigured,
  recordExecution as recordSupabaseExecution,
  completeExecution as completeSupabaseExecution,
} from '../../services/supabase'
import type { Node, Edge } from '@xyflow/react'

/* ── Inline SVG Icons ─────────────────────────── */

function XIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
}
function AlertTriangleIcon({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
}
function CheckCircle2Icon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
}
function XCircleIcon({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
}
function ShieldIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
}
function RefreshCwIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
}
function ChevronDownIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
}
function ChevronUpIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
}
function ExternalLinkIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
}
function InfoIcon({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
}
function Loader2Icon({ size = 24 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sim-spinner"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
}
function ZapIcon({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
}

/* ── Helpers ───────────────────────────────────── */

const NETWORK = import.meta.env.VITE_ALGOD_NETWORK || 'testnet'
const EXPLORER_TX_BASE = NETWORK === 'mainnet'
  ? 'https://lora.algokit.io/mainnet/transaction'
  : 'https://lora.algokit.io/testnet/transaction'

type PanelPhase = 'loading' | 'review' | 'executing' | 'done' | 'error'

interface StepResult {
  txId?: string
  error?: string
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped'
}

type WarningIcon = (props: { size?: number }) => JSX.Element

function WarningBadge({ w }: { w: SimulationWarning }) {
  const colors: Record<string, { bg: string; border: string; text: string; Icon: WarningIcon }> = {
    info: { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)', text: 'var(--z-info)', Icon: InfoIcon },
    warning: { bg: 'rgba(234,179,8,0.08)', border: 'rgba(234,179,8,0.2)', text: 'var(--z-warning)', Icon: AlertTriangleIcon },
    error: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', text: 'var(--z-error)', Icon: XCircleIcon },
  }
  const c = colors[w.severity] ?? colors.info
  return (
    <div className="sim-warning" style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
      <c.Icon size={14} />
      <span>{w.message}</span>
    </div>
  )
}

function PhaseIndicator({ phase, stepsDone, stepsTotal }: { phase: PanelPhase; stepsDone: number; stepsTotal: number }) {
  const config: Record<PanelPhase, { color: string; label: string }> = {
    loading: { color: 'var(--z-accent)', label: 'Analyzing' },
    review: { color: 'var(--z-accent)', label: 'Ready' },
    executing: { color: 'var(--z-warning)', label: `${stepsDone}/${stepsTotal}` },
    done: { color: 'var(--z-success)', label: 'Complete' },
    error: { color: 'var(--z-error)', label: 'Failed' },
  }
  const { color, label } = config[phase]
  return (
    <span className="sim-phase-badge" style={{ color, borderColor: color }}>
      {phase === 'loading' && <Loader2Icon size={10} />}
      {phase === 'executing' && <Loader2Icon size={10} />}
      {phase === 'done' && <CheckCircle2Icon size={10} />}
      {phase === 'error' && <XCircleIcon size={10} />}
      {label}
    </span>
  )
}

/* ── Component ─────────────────────────────────── */

export interface TransactionPanelProps {
  isOpen: boolean
  onClose: () => void
  nodes: Node[]
  edges: Edge[]
  onHighlightNode?: (nodeId: string) => void
  workflowId?: string | null
  workflowName?: string
}

export default function TransactionPanel({
  isOpen,
  onClose,
  nodes,
  edges,
  onHighlightNode,
  workflowId,
  workflowName,
}: TransactionPanelProps) {
  const { transactionSigner, activeAddress } = useWallet()
  const { enqueueSnackbar } = useSnackbar()

  const [phase, setPhase] = useState<PanelPhase>('loading')
  const [simulation, setSimulation] = useState<SimulationResult | null>(null)
  const [safety, setSafety] = useState<SafetyCheckResult | null>(null)
  const [stepResults, setStepResults] = useState<Record<number, StepResult>>({})
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [expandedStep, setExpandedStep] = useState<number | null>(null)
  const [executionTxIds, setExecutionTxIds] = useState<string[]>([])
  const [executionDuration, setExecutionDuration] = useState<string | null>(null)

  const actionBlocks = getExecutableBlocksInOrder(
    nodes as { id: string; data: Record<string, unknown> }[],
    edges.map((e) => ({ source: e.source, target: e.target })),
  )

  const blockNameLookup = useCallback((blockId: string) => {
    return getBlockById(blockId)?.name ?? blockId
  }, [])

  useEffect(() => {
    if (!isOpen) {
      setPhase('loading')
      setSimulation(null)
      setSafety(null)
      setStepResults({})
      setGlobalError(null)
      setExpandedStep(null)
      setExecutionTxIds([])
      setExecutionDuration(null)
      return
    }

    async function runChecks() {
      setPhase('loading')
      setGlobalError(null)

      let sim = buildSimulationPreview(actionBlocks, blockNameLookup)
      setSimulation(sim)

      const [enrichedSim, safetyResult] = await Promise.all([
        enrichSwapQuotes(actionBlocks, sim).catch(() => sim),
        activeAddress ? runSafetyChecks(actionBlocks, activeAddress) : Promise.resolve(null),
      ])

      sim = enrichedSim
      setSimulation(sim)
      if (safetyResult) setSafety(safetyResult)

      const initial: Record<number, StepResult> = {}
      sim.steps.forEach((s) => { initial[s.index] = { status: 'pending' } })
      setStepResults(initial)

      setPhase('review')
    }

    runChecks()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const completedSteps = Object.values(stepResults).filter((r) => r.status === 'success').length
  const totalSteps = simulation?.steps.length ?? 0

  const allWarnings: SimulationWarning[] = [
    ...(simulation?.warnings ?? []),
    ...(safety?.warnings ?? []),
  ]
  const allErrors: SimulationWarning[] = [
    ...(safety?.errors ?? []),
  ]
  const canExecute =
    phase === 'review' &&
    allErrors.length === 0 &&
    actionBlocks.length > 0 &&
    !!transactionSigner &&
    !!activeAddress

  const handleExecute = async () => {
    if (!transactionSigner || !activeAddress) {
      enqueueSnackbar('Please connect wallet first', { variant: 'warning' })
      return
    }
    if (actionBlocks.length === 0) {
      enqueueSnackbar('No executable blocks to run', { variant: 'info' })
      return
    }

    setPhase('executing')
    setGlobalError(null)

    const startTime = Date.now()
    const algorand = getAlgorandClient()
    const variables = createVariableContext()
    const blockOutputs = new Map<string, Record<string, unknown>>()
    const abortController = new AbortController()
    const collectedTxIds: string[] = []

    const nodeIdToStepIndex = new Map<string, number>()
    actionBlocks.forEach((b, i) => nodeIdToStepIndex.set(b.nodeId, i + 1))

    const flowNodes: FlowNode[] = nodes.map((n) => ({
      id: n.id,
      data: n.data as FlowNode['data'],
    }))
    const flowEdges: FlowEdge[] = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
    }))

    let execId: string | null = null
    if (workflowId && isSupabaseConfigured()) {
      try {
        execId = await recordSupabaseExecution(workflowId, activeAddress, actionBlocks.length)
      } catch { /* non-blocking */ }
    }

    let errorMessage: string | null = null

    try {
      await runFlowOnce(flowNodes, flowEdges, {
        sender: activeAddress,
        signer: transactionSigner,
        algorand,
        variables,
        blockOutputs,
        log: (entry) => {
          const stepIdx = nodeIdToStepIndex.get(entry.nodeId)
          if (!stepIdx) return

          if (entry.type === 'start') {
            setStepResults((r) => ({ ...r, [stepIdx]: { status: 'running' } }))
          } else if (entry.type === 'success') {
            const txId = entry.data ? (entry.data as Record<string, unknown>).txId as string | undefined : undefined
            if (txId) collectedTxIds.push(txId)
            setStepResults((r) => ({ ...r, [stepIdx]: { txId: txId ?? '', status: 'success' } }))
          } else if (entry.type === 'error') {
            errorMessage = entry.message
            setStepResults((r) => ({ ...r, [stepIdx]: { error: entry.message, status: 'error' } }))
            setGlobalError(entry.message)
            setExpandedStep(stepIdx)
          } else if (entry.type === 'skip') {
            setStepResults((r) => ({ ...r, [stepIdx]: { status: 'skipped' } }))
          } else if (entry.type === 'trigger-fire') {
            setStepResults((r) => ({ ...r, [stepIdx]: { status: 'success' } }))
          }
        },
        onNodeStatusChange: (_nodeId, _status) => { /* handled via log */ },
        abortSignal: abortController.signal,
      })
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err)
      setGlobalError(errorMessage)
    }

    const durationMs = Date.now() - startTime
    const durationSec = (durationMs / 1000).toFixed(1)
    setExecutionTxIds(collectedTxIds)
    setExecutionDuration(durationSec)
    recordLocalExecution()

    if (execId && isSupabaseConfigured()) {
      try {
        await completeSupabaseExecution(execId, {
          status: errorMessage ? 'failed' : 'success',
          txIds: collectedTxIds,
          errorMessage: errorMessage ?? undefined,
          durationMs,
        })
      } catch { /* non-blocking */ }
    }

    const wfLabel = workflowName || 'Workflow'

    if (errorMessage) {
      setPhase('error')
      const errMsg = errorMessage.length > 120 ? errorMessage.slice(0, 120) + '...' : errorMessage
      enqueueSnackbar(`${wfLabel} failed: ${errMsg}`, {
        variant: 'error',
        autoHideDuration: 8000,
      })
    } else {
      setPhase('done')
      const txSummary = collectedTxIds.length > 0
        ? ` | ${collectedTxIds.length} txn(s)`
        : ''
      enqueueSnackbar(
        `Successfully executed "${wfLabel}" - ${actionBlocks.length} step(s) in ${durationSec}s${txSummary}`,
        { variant: 'success', autoHideDuration: 8000 },
      )
    }
  }

  const handleRetry = () => {
    setPhase('review')
    setGlobalError(null)
    const initial: Record<number, StepResult> = {}
    simulation?.steps.forEach((s) => { initial[s.index] = { status: 'pending' } })
    setStepResults(initial)
  }

  if (!isOpen) return null

  return (
    <>
      <div className="sim-overlay" onClick={onClose} />
      <div className="sim-panel">
        {/* Header */}
        <div className="sim-panel-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="sim-header-icon">
              {phase === 'done' ? <CheckCircle2Icon size={18} /> : phase === 'error' ? <XCircleIcon size={18} /> : <ShieldIcon />}
            </span>
            <div>
              <h2 className="sim-header-title">
                {phase === 'loading' && 'Analyzing Flow'}
                {phase === 'review' && 'Run Workflow'}
                {phase === 'executing' && 'Executing'}
                {phase === 'done' && 'Execution Complete'}
                {phase === 'error' && 'Execution Failed'}
              </h2>
              {phase !== 'loading' && totalSteps > 0 && (
                <span className="sim-header-subtitle">
                  {totalSteps} step{totalSteps !== 1 ? 's' : ''} - {formatMicroAlgo(simulation?.totalFee ?? 0)} ALGO est. fees
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PhaseIndicator phase={phase} stepsDone={completedSteps} stepsTotal={totalSteps} />
            <button onClick={onClose} className="sim-close-btn" aria-label="Close">
              <XIcon />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {phase === 'executing' && totalSteps > 0 && (
          <div className="sim-progress-track">
            <div
              className="sim-progress-fill"
              style={{ width: `${(completedSteps / totalSteps) * 100}%` }}
            />
          </div>
        )}

        {/* Body */}
        <div className="sim-body">
          {/* Loading */}
          {phase === 'loading' && (
            <div className="sim-loading">
              <Loader2Icon size={28} />
              <p>Running safety checks and building simulation...</p>
            </div>
          )}

          {/* Safety Errors */}
          {allErrors.length > 0 && (
            <div className="sim-section">
              <div className="sim-section-title" style={{ color: 'var(--z-error)' }}>
                <XCircleIcon size={14} /> Errors ({allErrors.length})
              </div>
              {allErrors.map((w, i) => <WarningBadge key={`err-${i}`} w={w} />)}
            </div>
          )}

          {/* Warnings */}
          {allWarnings.length > 0 && phase !== 'loading' && (
            <div className="sim-section">
              <div className="sim-section-title" style={{ color: 'var(--z-warning)' }}>
                <AlertTriangleIcon size={14} /> Warnings ({allWarnings.length})
              </div>
              {allWarnings.map((w, i) => <WarningBadge key={`warn-${i}`} w={w} />)}
            </div>
          )}

          {/* Steps */}
          {simulation && phase !== 'loading' && (
            <div className="sim-section">
              <div className="sim-section-title">
                <ZapIcon size={14} /> Steps ({simulation.steps.length})
              </div>
              <div className="sim-steps">
                {simulation.steps.map((step) => {
                  const result = stepResults[step.index]
                  const isExpanded = expandedStep === step.index
                  const hasResult = result && (result.txId || result.error)

                  return (
                    <div
                      key={step.index}
                      className={`sim-step ${result?.status ?? 'pending'}`}
                      onClick={() => {
                        if (onHighlightNode) {
                          const block = actionBlocks[step.index - 1]
                          if (block) onHighlightNode(block.nodeId)
                        }
                        setExpandedStep(isExpanded ? null : step.index)
                      }}
                    >
                      <div className="sim-step-header">
                        <div className="sim-step-status">
                          {(!result || result.status === 'pending') && (
                            <span className="sim-step-number">{step.index}</span>
                          )}
                          {result?.status === 'running' && <Loader2Icon size={16} />}
                          {result?.status === 'success' && <span style={{ color: 'var(--z-success)' }}><CheckCircle2Icon size={16} /></span>}
                          {result?.status === 'error' && <span style={{ color: 'var(--z-error)' }}><XCircleIcon size={16} /></span>}
                          {result?.status === 'skipped' && <span className="sim-step-number" style={{ opacity: 0.3 }}>-</span>}
                        </div>
                        <div className="sim-step-content">
                          <div className="sim-step-name">{step.blockName}</div>
                          <div className="sim-step-desc" title={step.description}>{step.description}</div>
                        </div>
                        <div className="sim-step-meta">
                          {step.fee > 0 && (
                            <span className="sim-step-fee">{formatMicroAlgo(step.fee)}</span>
                          )}
                          {hasResult && (isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />)}
                        </div>
                      </div>

                      {isExpanded && hasResult && (
                        <div className="sim-step-detail">
                          {result?.txId && (
                            <a
                              href={`${EXPLORER_TX_BASE}/${result.txId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="sim-tx-link"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLinkIcon /> View on Lora Explorer
                            </a>
                          )}
                          {result?.error && (
                            <div className="sim-step-error">
                              <p className="sim-error-msg">{result.error}</p>
                              {suggestFix(result.error) && (
                                <p className="sim-error-fix">
                                  <strong>Suggestion:</strong> {suggestFix(result.error)}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Global Error Recovery */}
          {phase === 'error' && globalError && (
            <div className="sim-section">
              <div className="sim-section-title" style={{ color: 'var(--z-error)' }}>
                <XCircleIcon size={14} /> What went wrong
              </div>
              <div className="sim-error-box">
                <p>{globalError}</p>
                {suggestFix(globalError) && (
                  <p className="sim-error-fix">
                    <strong>Suggestion:</strong> {suggestFix(globalError)}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Success summary */}
          {phase === 'done' && (
            <div className="sim-section">
              <div className="sim-success-banner">
                <CheckCircle2Icon size={20} />
                <div>
                  <strong>Successfully executed "{workflowName || 'Workflow'}"</strong>
                  <span>
                    {totalSteps} step{totalSteps !== 1 ? 's' : ''} completed
                    {executionDuration ? ` in ${executionDuration}s` : ''}
                    {executionTxIds.length > 0 ? ` - ${executionTxIds.length} txn(s)` : ''}
                  </span>
                  {executionTxIds.length > 0 && (
                    <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {executionTxIds.map((txId, i) => (
                        <a
                          key={txId}
                          href={`${EXPLORER_TX_BASE}/${txId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="sim-tx-link"
                          style={{ fontSize: 12 }}
                        >
                          <ExternalLinkIcon /> Tx {i + 1}: {txId.slice(0, 8)}...
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {actionBlocks.length === 0 && phase !== 'loading' && (
            <div className="sim-section sim-empty">
              <ZapIcon size={32} />
              <p>No action blocks in this flow</p>
              <span>Add blocks like Send Payment, Swap Token, or Opt-In ASA to execute transactions.</span>
            </div>
          )}
        </div>

        {/* Footer */}
        {simulation && phase !== 'loading' && (
          <div className="sim-panel-footer">
            {simulation.totalFee > 0 && (
              <div className="sim-fee-summary">
                <span className="sim-fee-label">Estimated fees</span>
                <div className="sim-fee-value">
                  <span className="sim-fee-algo">{formatMicroAlgo(simulation.totalFee)} ALGO</span>
                  <span className="sim-fee-usd">{microAlgoToUsd(simulation.totalFee)}</span>
                </div>
              </div>
            )}

            <div className="sim-actions">
              <button onClick={onClose} className="sim-btn sim-btn-ghost">
                {phase === 'done' || phase === 'error' ? 'Close' : 'Cancel'}
              </button>

              {phase === 'review' && (
                <button
                  onClick={handleExecute}
                  disabled={!canExecute}
                  className="sim-btn sim-btn-primary"
                >
                  <ZapIcon size={14} /> Sign and Execute
                </button>
              )}

              {phase === 'executing' && (
                <button disabled className="sim-btn sim-btn-primary">
                  <Loader2Icon size={14} /> Executing...
                </button>
              )}

              {phase === 'error' && (
                <button onClick={handleRetry} className="sim-btn sim-btn-primary">
                  <RefreshCwIcon /> Retry
                </button>
              )}

              {phase === 'done' && (
                <button disabled className="sim-btn sim-btn-success">
                  <CheckCircle2Icon size={14} /> All done
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
