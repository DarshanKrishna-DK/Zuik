import { useWallet } from '@txnlab/use-wallet-react'
import {
  X, AlertTriangle, CheckCircle2, XCircle, Shield, RefreshCw, ChevronDown,
  ChevronUp, ExternalLink, Info, Loader2,
} from 'lucide-react'
import { useSnackbar } from 'notistack'
import { useState, useEffect, useCallback } from 'react'
import { blockExecutors, getActionBlocksInOrder } from '../../services/blockExecutors'
import { getAlgorandClient } from '../../services/algorand'
import { getBlockById } from '../../lib/blockRegistry'
import {
  buildSimulationPreview,
  formatMicroAlgo,
  microAlgoToUsd,
} from '../../services/transactionSimulator'
import type { SimulationResult, SimulationWarning } from '../../services/transactionSimulator'
import { runSafetyChecks, recordExecution, suggestFix } from '../../services/safetyGuards'
import type { SafetyCheckResult } from '../../services/safetyGuards'
import type { Node, Edge } from '@xyflow/react'

const PERA_EXPLORER_TESTNET = 'https://testnet.explorer.perawallet.app/tx'

type PanelPhase = 'loading' | 'review' | 'executing' | 'done' | 'error'

interface StepResult {
  txId?: string
  error?: string
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped'
}

function WarningBadge({ w }: { w: SimulationWarning }) {
  const colors: Record<string, { bg: string; border: string; text: string; Icon: typeof Info }> = {
    info: { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)', text: 'var(--zuik-info)', Icon: Info },
    warning: { bg: 'rgba(234,179,8,0.08)', border: 'rgba(234,179,8,0.2)', text: 'var(--zuik-warning)', Icon: AlertTriangle },
    error: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', text: 'var(--zuik-error)', Icon: XCircle },
  }
  const c = colors[w.severity] ?? colors.info
  return (
    <div className="sim-warning" style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
      <c.Icon size={14} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{w.message}</span>
    </div>
  )
}

export interface TransactionPanelProps {
  isOpen: boolean
  onClose: () => void
  nodes: Node[]
  edges: Edge[]
  onHighlightNode?: (nodeId: string) => void
}

export default function TransactionPanel({
  isOpen,
  onClose,
  nodes,
  edges,
  onHighlightNode,
}: TransactionPanelProps) {
  const { transactionSigner, activeAddress } = useWallet()
  const { enqueueSnackbar } = useSnackbar()

  const [phase, setPhase] = useState<PanelPhase>('loading')
  const [simulation, setSimulation] = useState<SimulationResult | null>(null)
  const [safety, setSafety] = useState<SafetyCheckResult | null>(null)
  const [stepResults, setStepResults] = useState<Record<number, StepResult>>({})
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [expandedStep, setExpandedStep] = useState<number | null>(null)

  const actionBlocks = getActionBlocksInOrder(
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
      return
    }

    async function runChecks() {
      setPhase('loading')
      setGlobalError(null)

      const sim = buildSimulationPreview(actionBlocks, blockNameLookup)
      setSimulation(sim)

      if (activeAddress) {
        const safetyResult = await runSafetyChecks(actionBlocks, activeAddress)
        setSafety(safetyResult)
      }

      const initial: Record<number, StepResult> = {}
      sim.steps.forEach((s) => { initial[s.index] = { status: 'pending' } })
      setStepResults(initial)

      setPhase('review')
    }

    runChecks()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

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
      enqueueSnackbar('No action blocks to execute', { variant: 'info' })
      return
    }

    setPhase('executing')
    setGlobalError(null)

    const algorand = getAlgorandClient()
    const context = { sender: activeAddress, signer: transactionSigner, algorand }
    let hasError = false

    for (let i = 0; i < actionBlocks.length; i++) {
      const { nodeId, blockId, config } = actionBlocks[i]
      const stepIndex = i + 1
      const executor = blockExecutors[blockId]
      if (!executor) {
        setStepResults((r) => ({ ...r, [stepIndex]: { status: 'skipped' } }))
        continue
      }

      setStepResults((r) => ({ ...r, [stepIndex]: { status: 'running' } }))

      try {
        const output = await executor(config, context)
        const txId = output.txId as string | undefined
        setStepResults((r) => ({ ...r, [stepIndex]: { txId: txId ?? '', status: 'success' } }))
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setStepResults((r) => ({ ...r, [stepIndex]: { error: message, status: 'error' } }))
        hasError = true
        setGlobalError(message)
        setExpandedStep(stepIndex)

        for (let j = i + 1; j < actionBlocks.length; j++) {
          setStepResults((r) => ({ ...r, [j + 1]: { status: 'skipped' } }))
        }
        break
      }
    }

    recordExecution()

    if (hasError) {
      setPhase('error')
    } else {
      setPhase('done')
      const successCount = actionBlocks.length
      enqueueSnackbar(`${successCount} step(s) executed successfully`, { variant: 'success' })
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
      <div
        className="transaction-panel-overlay"
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 40,
          opacity: 1, backdropFilter: 'blur(2px)',
        }}
      />
      <div
        className="transaction-panel"
        style={{
          position: 'fixed', top: 0, right: 0,
          width: 'min(440px, 100vw)', height: '100vh',
          background: 'var(--zuik-surface)',
          borderLeft: '1px solid var(--zuik-border)',
          zIndex: 50, display: 'flex', flexDirection: 'column',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.3)',
          transform: 'translateX(0)', transition: 'transform 0.2s ease',
        }}
      >
        {/* Header */}
        <div className="sim-panel-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Shield size={18} style={{ color: 'var(--zuik-orange)' }} />
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--zuik-text)' }}>
              {phase === 'loading' && 'Analyzing Flow...'}
              {phase === 'review' && 'Transaction Summary'}
              {phase === 'executing' && 'Executing...'}
              {phase === 'done' && 'Execution Complete'}
              {phase === 'error' && 'Execution Failed'}
            </h2>
          </div>
          <button onClick={onClose} className="zuik-btn zuik-btn-ghost zuik-btn-sm" style={{ padding: 6 }} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
          {/* Loading */}
          {phase === 'loading' && (
            <div className="sim-loading">
              <Loader2 size={24} className="sim-spinner" />
              <p style={{ color: 'var(--zuik-text-muted)', fontSize: '0.875rem' }}>
                Running safety checks and building simulation...
              </p>
            </div>
          )}

          {/* Safety Errors */}
          {allErrors.length > 0 && (
            <div className="sim-section">
              <div className="sim-section-title" style={{ color: 'var(--zuik-error)' }}>
                <XCircle size={14} /> Errors ({allErrors.length})
              </div>
              {allErrors.map((w, i) => <WarningBadge key={`err-${i}`} w={w} />)}
            </div>
          )}

          {/* Warnings */}
          {allWarnings.length > 0 && phase !== 'loading' && (
            <div className="sim-section">
              <div className="sim-section-title" style={{ color: 'var(--zuik-warning)' }}>
                <AlertTriangle size={14} /> Warnings ({allWarnings.length})
              </div>
              {allWarnings.map((w, i) => <WarningBadge key={`warn-${i}`} w={w} />)}
            </div>
          )}

          {/* Steps */}
          {simulation && phase !== 'loading' && (
            <div className="sim-section">
              <div className="sim-section-title">
                <Info size={14} /> Steps ({simulation.steps.length})
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
                          {result?.status === 'running' && <Loader2 size={16} className="sim-spinner" />}
                          {result?.status === 'success' && <CheckCircle2 size={16} style={{ color: 'var(--zuik-success)' }} />}
                          {result?.status === 'error' && <XCircle size={16} style={{ color: 'var(--zuik-error)' }} />}
                          {result?.status === 'skipped' && <span className="sim-step-number" style={{ opacity: 0.4 }}>-</span>}
                        </div>
                        <div className="sim-step-content">
                          <div className="sim-step-name">{step.blockName}</div>
                          <div className="sim-step-desc">{step.description}</div>
                        </div>
                        <div className="sim-step-meta">
                          {step.fee > 0 && (
                            <span className="sim-step-fee">{formatMicroAlgo(step.fee)} ALGO</span>
                          )}
                          {hasResult && (isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                        </div>
                      </div>

                      {isExpanded && hasResult && (
                        <div className="sim-step-detail">
                          {result?.txId && (
                            <a
                              href={`${PERA_EXPLORER_TESTNET}/${result.txId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="sim-tx-link"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink size={12} /> View on Pera Explorer
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
              <div className="sim-section-title" style={{ color: 'var(--zuik-error)' }}>
                <XCircle size={14} /> What went wrong
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

          {/* Empty state */}
          {actionBlocks.length === 0 && phase !== 'loading' && (
            <div className="sim-section">
              <p style={{ color: 'var(--zuik-text-muted)', fontSize: '0.875rem', padding: '0 16px' }}>
                No action blocks found in this flow. Add blocks like Send Payment, Swap Token, Opt-In ASA, or Create ASA to execute transactions.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {simulation && phase !== 'loading' && (
          <div className="sim-panel-footer">
            {/* Fee Summary */}
            {simulation.totalFee > 0 && (
              <div className="sim-fee-summary">
                <span style={{ color: 'var(--zuik-text-muted)', fontSize: '0.8125rem' }}>Estimated total fees</span>
                <span style={{ color: 'var(--zuik-text)', fontSize: '0.875rem', fontWeight: 600 }}>
                  {formatMicroAlgo(simulation.totalFee)} ALGO
                  <span style={{ color: 'var(--zuik-text-dim)', fontWeight: 400, marginLeft: 6, fontSize: '0.75rem' }}>
                    ({microAlgoToUsd(simulation.totalFee)})
                  </span>
                </span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} className="zuik-btn zuik-btn-ghost" style={{ flex: 1 }}>
                {phase === 'done' || phase === 'error' ? 'Close' : 'Cancel'}
              </button>

              {(phase === 'review') && (
                <button
                  onClick={handleExecute}
                  disabled={!canExecute}
                  className="zuik-btn zuik-btn-primary"
                  style={{ flex: 2 }}
                >
                  Sign and Execute
                </button>
              )}

              {phase === 'executing' && (
                <button disabled className="zuik-btn zuik-btn-primary" style={{ flex: 2 }}>
                  <Loader2 size={14} className="sim-spinner" /> Executing...
                </button>
              )}

              {phase === 'error' && (
                <button onClick={handleRetry} className="zuik-btn zuik-btn-primary" style={{ flex: 2 }}>
                  <RefreshCw size={14} /> Retry
                </button>
              )}

              {phase === 'done' && (
                <button disabled className="zuik-btn zuik-btn-ghost" style={{ flex: 2, color: 'var(--zuik-success)', borderColor: 'var(--zuik-success)' }}>
                  <CheckCircle2 size={14} /> All steps completed
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
