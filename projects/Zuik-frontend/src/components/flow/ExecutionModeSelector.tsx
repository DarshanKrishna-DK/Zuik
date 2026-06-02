import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWallet } from '@txnlab/use-wallet-react'
import type { ExecutionMode, AgentReadiness } from '../../lib/executionMode'
import {
  checkAgentReadiness,
  ensureAgentWalletForWorkflow,
  setStoredExecutionMode,
  workflowUsesBrowserSigner,
} from '../../lib/executionMode'
import type { FlowNode } from '../../lib/runAgent'
import { fundAgentWallet } from '../../services/agentWallet'
import { algoToMicroAlgos } from '../../services/guardianContract'

function WalletIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <path d="M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2V7" />
    </svg>
  )
}

function BotIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" />
    </svg>
  )
}

export interface ExecutionModeSelectorProps {
  mode: ExecutionMode
  onModeChange: (mode: ExecutionMode) => void
  workflowId: string | null
  flowNodes: FlowNode[]
  onReadinessChange?: (readiness: AgentReadiness | null) => void
  compact?: boolean
}

export default function ExecutionModeSelector({
  mode,
  onModeChange,
  workflowId,
  flowNodes,
  onReadinessChange,
  compact = false,
}: ExecutionModeSelectorProps) {
  const { activeAddress, transactionSigner } = useWallet()
  const [readiness, setReadiness] = useState<AgentReadiness | null>(null)
  const [checking, setChecking] = useState(false)
  const [creating, setCreating] = useState(false)
  const [funding, setFunding] = useState(false)
  const [fundAlgo, setFundAlgo] = useState('2')
  const [showFund, setShowFund] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)

  const guardianAppId = parseInt(import.meta.env.VITE_GUARDIAN_APP_ID || '0', 10)
  const incompatible = workflowUsesBrowserSigner(flowNodes)

  const refresh = useCallback(async () => {
    if (mode !== 'agent') {
      setReadiness(null)
      onReadinessChange?.(null)
      return
    }
    setChecking(true)
    setBanner(null)
    try {
      const r = await checkAgentReadiness(workflowId, flowNodes, activeAddress ?? undefined)
      setReadiness(r)
      onReadinessChange?.(r)
    } finally {
      setChecking(false)
    }
  }, [mode, workflowId, flowNodes, activeAddress, onReadinessChange])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleModeSelect = (next: ExecutionMode) => {
    if (next === 'agent' && incompatible) {
      setBanner('Swaps and similar blocks require your wallet. Agent mode applies to ALGO send-payment workflows.')
      return
    }
    setStoredExecutionMode(workflowId, next)
    onModeChange(next)
  }

  const handleCreateAgent = async () => {
    if (!activeAddress || !workflowId) return
    setCreating(true)
    setBanner(null)
    try {
      await ensureAgentWalletForWorkflow(workflowId, activeAddress, guardianAppId || undefined)
      setBanner('Agent wallet created. Fund it, then set Guardian policy in Settings.')
      await refresh()
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Could not create agent wallet.')
    } finally {
      setCreating(false)
    }
  }

  const handleFund = async () => {
    if (!activeAddress || !transactionSigner) return
    if (readiness?.ok !== false || !readiness.wallet) return
    const amount = parseFloat(fundAlgo)
    if (!Number.isFinite(amount) || amount <= 0) {
      setBanner('Enter a valid ALGO amount.')
      return
    }
    setFunding(true)
    try {
      await fundAgentWallet({
        ownerAddress: activeAddress,
        agentAddress: readiness.wallet.agent_address,
        amountMicroAlgos: algoToMicroAlgos(amount),
        signer: transactionSigner,
        note: 'Zuik agent funding',
      })
      setBanner('Agent funded. You can run the workflow without signing each payment.')
      setShowFund(false)
      await refresh()
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Funding failed.')
    } finally {
      setFunding(false)
    }
  }

  const suggestedFundAlgo =
    readiness?.ok === false && readiness.code === 'low_balance' && readiness.requiredMicroAlgos
      ? Math.max(0.5, Math.ceil((readiness.requiredMicroAlgos / 1_000_000) * 100) / 100)
      : 2

  useEffect(() => {
    if (showFund) setFundAlgo(String(suggestedFundAlgo))
  }, [showFund, suggestedFundAlgo])

  return (
    <div className={`zuik-exec-mode${compact ? ' zuik-exec-mode--compact' : ''}`} data-testid="execution-mode-selector">
      <div className="zuik-exec-mode-toggle" role="group" aria-label="Execution mode">
        <button
          type="button"
          className={`zuik-exec-mode-btn${mode === 'user' ? ' active' : ''}`}
          onClick={() => handleModeSelect('user')}
          title="You approve each on-chain transaction in your wallet"
        >
          <WalletIcon /> You sign
        </button>
        <button
          type="button"
          className={`zuik-exec-mode-btn${mode === 'agent' ? ' active' : ''}`}
          onClick={() => handleModeSelect('agent')}
          title="Server agent wallet signs payments under Guardian limits (not AI)"
          disabled={incompatible}
        >
          <BotIcon /> Agent wallet
        </button>
      </div>

      {mode === 'agent' && !compact && (
        <div className="zuik-exec-mode-detail">
          {checking && <span className="zuik-exec-mode-muted">Checking agent...</span>}
          {!checking && readiness?.ok && (
            <span className="zuik-exec-mode-ok">
              Agent ready ({readiness.balance.available.toFixed(2)} ALGO available)
            </span>
          )}
          {!checking && readiness?.ok === false && readiness.code === 'no_agent' && (
            <div className="zuik-exec-mode-actions">
              <span className="zuik-exec-mode-warn">No agent for this workflow</span>
              <button
                type="button"
                className="z-btn z-btn-primary z-btn-sm"
                disabled={!workflowId || creating}
                onClick={() => void handleCreateAgent()}
              >
                {creating ? 'Creating...' : 'Create agent'}
              </button>
              <Link to="/settings?section=agents" className="zuik-exec-mode-link">
                Settings
              </Link>
            </div>
          )}
          {!checking && readiness?.ok === false && readiness.code === 'low_balance' && (
            <div className="zuik-exec-mode-actions">
              <span className="zuik-exec-mode-warn">{readiness.message}</span>
              {!showFund ? (
                <button type="button" className="z-btn z-btn-primary z-btn-sm" onClick={() => setShowFund(true)}>
                  Fund agent
                </button>
              ) : (
                <div className="zuik-exec-mode-fund">
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={fundAlgo}
                    onChange={(e) => setFundAlgo(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    aria-label="Fund amount in ALGO"
                  />
                  <button
                    type="button"
                    className="z-btn z-btn-primary z-btn-sm"
                    disabled={funding || !transactionSigner}
                    onClick={() => void handleFund()}
                  >
                    {funding ? 'Signing...' : 'Sign funding tx'}
                  </button>
                  <button type="button" className="z-btn z-btn-ghost z-btn-sm" onClick={() => setShowFund(false)}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
          {!checking && readiness?.ok === false && readiness.code === 'incompatible' && (
            <span className="zuik-exec-mode-warn">{readiness.message}</span>
          )}
          {!checking && readiness?.ok === false && readiness.code === 'no_workflow' && (
            <span className="zuik-exec-mode-warn">{readiness.message}</span>
          )}
          {!checking && readiness?.ok === false && readiness.code === 'no_key' && (
            <span className="zuik-exec-mode-warn">
              {readiness.message}{' '}
              <Link to="/settings?section=agents" className="zuik-exec-mode-link">Fix in Settings</Link>
            </span>
          )}
        </div>
      )}

      {banner && <p className="zuik-exec-mode-banner">{banner}</p>}
      {mode === 'agent' && compact && !checking && readiness?.ok && (
        <span className="zuik-exec-mode-pill" title="Agent wallet will sign ALGO payments">
          {readiness.balance.available.toFixed(2)} ALGO
        </span>
      )}
    </div>
  )
}
