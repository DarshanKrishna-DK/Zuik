import { useState, useEffect, useCallback } from 'react'
import { useWallet } from '@txnlab/use-wallet-react'
import {
  guardianContract,
  algoToMicroAlgos,
  type AgentStatus,
  type GlobalMetrics,
  type GuardianPolicy,
} from '../../services/guardianContract'
import {
  SettingsPanelHeader,
  HelpCard,
  SettingsCard,
  SettingsField,
  SettingsInput,
  StatusBadge,
  FeedbackMessage,
  LoadingBlock,
} from './SettingsPrimitives'
import './GuardianSettings.css'

const DEFAULT_DAILY_CAP_ALGO = '2'

type GuardianStep = 1 | 2 | 3

function formatNetworkLabel(network: string): string {
  if (network === 'mainnet') return 'Mainnet'
  if (network === 'localnet') return 'Local'
  return 'Testnet'
}

function microToAlgo(micro: number): string {
  return (micro / 1_000_000).toFixed(2)
}

export function GuardianSettings() {
  const { activeAccount, activeAddress, transactionSigner } = useWallet()
  const [loading, setLoading] = useState(false)
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null)
  const [globalMetrics, setGlobalMetrics] = useState<GlobalMetrics | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [activeStep, setActiveStep] = useState<GuardianStep>(1)

  const guardianAppId = parseInt(import.meta.env.VITE_GUARDIAN_APP_ID || '0', 10)
  const guardianAppAddress = import.meta.env.VITE_GUARDIAN_APP_ADDRESS || ''
  const network = import.meta.env.VITE_ALGOD_NETWORK || 'mainnet'
  const guardianReady = guardianAppId > 0 && Boolean(guardianAppAddress)

  const [registrationForm, setRegistrationForm] = useState({
    agentAddress: '',
    dailyCapAlgo: DEFAULT_DAILY_CAP_ALGO,
  })

  const [policyForm, setPolicyForm] = useState({
    agentAddress: '',
    dailyCapAlgo: DEFAULT_DAILY_CAP_ALGO,
  })

  const showMessage = useCallback((type: 'success' | 'error' | 'info', text: string) => {
    setFeedback({ type, text })
  }, [])

  const loadGuardianData = useCallback(async () => {
    if (!activeAccount || !guardianReady) return

    setLoading(true)
    try {
      const metrics = await guardianContract.getGlobalMetrics()
      setGlobalMetrics(metrics)
      setIsPaused(metrics?.isPaused || false)

      const addr = registrationForm.agentAddress.trim()
      if (addr) {
        const status = await guardianContract.getAgentStatus(addr)
        setAgentStatus(status)
        if (status?.isActive) setActiveStep(3)
      }
    } catch {
      showMessage('error', 'Could not load Guardian status. Try again in a moment.')
    } finally {
      setLoading(false)
    }
  }, [activeAccount, guardianReady, registrationForm.agentAddress, showMessage])

  useEffect(() => {
    if (activeAccount && guardianReady) {
      void loadGuardianData()
    }
  }, [activeAccount, guardianReady, loadGuardianData])

  const handleAgentOptIn = async () => {
    if (!activeAddress || !transactionSigner) {
      showMessage('info', 'Connect the wallet your automation uses, then approve signing in your wallet app.')
      return
    }
    setLoading(true)
    setFeedback(null)
    try {
      const txId = await guardianContract.agentOptIn(activeAddress, transactionSigner)
      showMessage(
        'success',
        txId ? `Agent activated on Guardian. Transaction: ${txId.slice(0, 12)}...` : 'Agent activated on Guardian.',
      )
      setActiveStep(2)
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Could not activate agent. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleRegisterAgent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeAddress || !transactionSigner) {
      showMessage('info', 'Connect your owner wallet to register spending limits.')
      return
    }

    const capAlgo = parseFloat(registrationForm.dailyCapAlgo)
    if (!Number.isFinite(capAlgo) || capAlgo <= 0) {
      showMessage('error', 'Enter a valid daily spending limit in ALGO.')
      return
    }

    setLoading(true)
    setFeedback(null)
    try {
      const policy: GuardianPolicy = {
        dailyCap: algoToMicroAlgos(capAlgo),
        allowedAssets: [],
        allowedMethods: [],
      }

      const txId = await guardianContract.registerAgent(
        activeAddress,
        transactionSigner,
        registrationForm.agentAddress.trim(),
        policy,
      )

      showMessage('success', `Daily limit set to ${capAlgo} ALGO. Transaction: ${txId.slice(0, 12)}...`)
      await loadGuardianData()
      setActiveStep(3)
    } catch (error) {
      showMessage(
        'error',
        error instanceof Error ? error.message : 'Registration failed. Confirm the agent wallet has opted in first.',
      )
    } finally {
      setLoading(false)
    }
  }

  const handleUpdatePolicy = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeAddress || !transactionSigner) {
      showMessage('info', 'Connect your owner wallet to update limits.')
      return
    }

    const capAlgo = parseFloat(policyForm.dailyCapAlgo)
    if (!Number.isFinite(capAlgo) || capAlgo <= 0) {
      showMessage('error', 'Enter a valid daily spending limit in ALGO.')
      return
    }

    setLoading(true)
    setFeedback(null)
    try {
      const newPolicy: GuardianPolicy = {
        dailyCap: algoToMicroAlgos(capAlgo),
        allowedAssets: [],
        allowedMethods: [],
      }

      const txId = await guardianContract.updateAgentPolicy(
        activeAddress,
        transactionSigner,
        policyForm.agentAddress.trim(),
        newPolicy,
      )

      showMessage('success', `Daily limit updated to ${capAlgo} ALGO. Transaction: ${txId.slice(0, 12)}...`)
      await loadGuardianData()
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Could not update limit. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleTogglePause = async () => {
    if (!activeAddress || !transactionSigner) return

    setLoading(true)
    setFeedback(null)
    try {
      const newPausedState = !isPaused
      const txId = await guardianContract.setPaused(activeAddress, transactionSigner, newPausedState)

      setIsPaused(newPausedState)
      showMessage(
        'success',
        newPausedState
          ? `All agents paused. Transaction: ${txId.slice(0, 12)}...`
          : `Agents resumed. Transaction: ${txId.slice(0, 12)}...`,
      )
      await loadGuardianData()
    } catch {
      showMessage('error', 'Only the contract owner can pause or resume Guardian.')
    } finally {
      setLoading(false)
    }
  }

  const handleCheckAgentStatus = async () => {
    if (!registrationForm.agentAddress.trim()) return

    setLoading(true)
    setFeedback(null)
    try {
      const status = await guardianContract.getAgentStatus(registrationForm.agentAddress.trim())
      setAgentStatus(status)
      if (status?.isActive) setActiveStep(3)
    } catch {
      showMessage('error', 'Could not load agent status for that address.')
    } finally {
      setLoading(false)
    }
  }

  if (!activeAccount) {
    return (
      <section className="st-section guardian-settings" data-testid="guardian-settings">
        <SettingsPanelHeader
          title="Guardian protection"
          subtitle="On-chain daily spending limits for automated agents."
        />
        <SettingsCard>
          <p className="st-muted st-center">Connect your wallet to set up Guardian protection.</p>
        </SettingsCard>
      </section>
    )
  }

  const steps = [
    { id: 1 as const, label: 'Activate agent', desc: 'Opt in once' },
    { id: 2 as const, label: 'Set limits', desc: 'Register daily cap' },
    { id: 3 as const, label: 'Manage', desc: 'Monitor and adjust' },
  ]

  return (
    <section className="st-section guardian-settings" data-testid="guardian-settings">
      <SettingsPanelHeader
        title="Guardian protection"
        subtitle="Cap how much ALGO your automation can spend each day - enforced on-chain."
      />

      <HelpCard title="Why use Guardian?">
        Guardian adds a safety layer so workflows and agents cannot spend more than you allow, even if
        something goes wrong. Limits are stored on the Algorand blockchain.
      </HelpCard>

      {!guardianReady && (
        <div className="guardian-settings__banner guardian-settings__banner-warn" role="alert">
          Guardian is not available on this deployment yet. Contact support if you need on-chain spend limits.
        </div>
      )}

      {guardianReady && (
        <>
          {globalMetrics && (
            <div className="guardian-overview">
              <div className="guardian-stat-card">
                <span className="guardian-stat-label">Protected transactions</span>
                <span className="guardian-stat-value">{globalMetrics.totalTransactions.toLocaleString()}</span>
              </div>
              <div className="guardian-stat-card">
                <span className="guardian-stat-label">Volume tracked</span>
                <span className="guardian-stat-value">{microToAlgo(globalMetrics.totalVolume)} ALGO</span>
              </div>
              <div className="guardian-stat-card">
                <span className="guardian-stat-label">System status</span>
                <StatusBadge variant={isPaused ? 'warning' : 'success'}>
                  {isPaused ? 'Paused' : 'Active'}
                </StatusBadge>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleTogglePause}
            className={`guardian-pause-btn ${isPaused ? 'guardian-pause-btn--resume' : 'guardian-pause-btn--pause'}`}
            disabled={loading}
          >
            {isPaused ? 'Resume all agents' : 'Emergency pause all agents'}
          </button>

          <div className="guardian-steps" aria-label="Setup progress">
            {steps.map((step, index) => {
              const done = activeStep > step.id
              const current = activeStep === step.id
              return (
                <div
                  key={step.id}
                  className={`guardian-step${current ? ' guardian-step--current' : ''}${done ? ' guardian-step--done' : ''}`}
                >
                  <div className="guardian-step-marker">
                    {done ? '✓' : step.id}
                  </div>
                  <div className="guardian-step-text">
                    <span className="guardian-step-label">{step.label}</span>
                    <span className="guardian-step-desc">{step.desc}</span>
                  </div>
                  {index < steps.length - 1 && <div className="guardian-step-line" aria-hidden />}
                </div>
              )
            })}
          </div>

          {loading && <LoadingBlock label="Processing..." />}

          <SettingsCard className="guardian-step-card">
            <div className="guardian-step-card-head">
              <span className="guardian-step-badge">Step 1</span>
              <h3 className="st-card-title">Activate agent wallet</h3>
            </div>
            <p className="guardian-settings__hint">
              Connect the wallet your automation will use, then opt in once on Guardian.
            </p>
            <button
              type="button"
              className="z-btn z-btn-primary"
              data-testid="guardian-agent-opt-in"
              disabled={loading}
              onClick={handleAgentOptIn}
            >
              {loading ? 'Please wait...' : 'Activate agent on Guardian'}
            </button>
          </SettingsCard>

          <SettingsCard className="guardian-step-card">
            <div className="guardian-step-card-head">
              <span className="guardian-step-badge">Step 2</span>
              <h3 className="st-card-title">Register spending limit</h3>
            </div>
            <p className="guardian-settings__hint">
              Connect your owner wallet and set how much ALGO this agent may spend per day.
            </p>
            <form onSubmit={handleRegisterAgent} className="guardian-form">
              <SettingsField label="Agent wallet address" htmlFor="agentAddress">
                <SettingsInput
                  id="agentAddress"
                  type="text"
                  value={registrationForm.agentAddress}
                  onChange={(e) =>
                    setRegistrationForm((prev) => ({ ...prev, agentAddress: e.target.value }))
                  }
                  placeholder="Paste agent address"
                  required
                  mono
                />
                <button
                  type="button"
                  onClick={handleCheckAgentStatus}
                  className="check-status-btn z-btn z-btn-ghost z-btn-sm"
                  disabled={loading || !registrationForm.agentAddress}
                >
                  Refresh status
                </button>
              </SettingsField>

              <SettingsField
                label="Daily limit (ALGO)"
                hint={`Example: ${DEFAULT_DAILY_CAP_ALGO} ALGO per day`}
                htmlFor="dailyCapAlgo"
              >
                <SettingsInput
                  id="dailyCapAlgo"
                  type="number"
                  min="0.001"
                  step="0.1"
                  value={registrationForm.dailyCapAlgo}
                  onChange={(e) =>
                    setRegistrationForm((prev) => ({ ...prev, dailyCapAlgo: e.target.value }))
                  }
                  placeholder={DEFAULT_DAILY_CAP_ALGO}
                  required
                />
              </SettingsField>

              <button
                type="submit"
                disabled={loading}
                className="z-btn z-btn-primary"
                data-testid="guardian-register-agent"
              >
                {loading ? 'Submitting...' : 'Register agent'}
              </button>
            </form>
          </SettingsCard>

          {(agentStatus || activeStep >= 3) && (
            <SettingsCard className="guardian-step-card">
              <div className="guardian-step-card-head">
                <span className="guardian-step-badge">Step 3</span>
                <h3 className="st-card-title">Agent status</h3>
              </div>
              {agentStatus ? (
                <div className="guardian-status-grid">
                  <div className="guardian-status-item">
                    <span className="guardian-status-label">Active</span>
                    <StatusBadge variant={agentStatus.isActive ? 'success' : 'neutral'}>
                      {agentStatus.isActive ? 'Yes' : 'No'}
                    </StatusBadge>
                  </div>
                  <div className="guardian-status-item">
                    <span className="guardian-status-label">Daily limit</span>
                    <span className="guardian-status-value">
                      {microToAlgo(agentStatus.dailySpendingCap)} ALGO
                    </span>
                  </div>
                  <div className="guardian-status-item">
                    <span className="guardian-status-label">Spent today</span>
                    <span className="guardian-status-value">
                      {microToAlgo(agentStatus.dailySpentAmount)} ALGO
                    </span>
                  </div>
                  <div className="guardian-status-item">
                    <span className="guardian-status-label">Transactions</span>
                    <span className="guardian-status-value">{agentStatus.transactionCount}</span>
                  </div>
                  {agentStatus.dailySpendingCap > 0 && (
                    <div className="guardian-progress-wrap">
                      <div className="guardian-progress-label">
                        <span>Today&apos;s usage</span>
                        <span>
                          {microToAlgo(agentStatus.dailySpentAmount)} /{' '}
                          {microToAlgo(agentStatus.dailySpendingCap)} ALGO
                        </span>
                      </div>
                      <div className="guardian-progress-track">
                        <div
                          className="guardian-progress-fill"
                          style={{
                            width: `${Math.min(
                              100,
                              (agentStatus.dailySpentAmount / agentStatus.dailySpendingCap) * 100,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="st-muted">Enter an agent address and refresh status to see details.</p>
              )}
            </SettingsCard>
          )}

          <SettingsCard className="guardian-step-card">
            <h3 className="st-card-title">Update daily limit</h3>
            <form onSubmit={handleUpdatePolicy} className="guardian-form">
              <SettingsField label="Agent wallet address" htmlFor="policyAgentAddress">
                <SettingsInput
                  id="policyAgentAddress"
                  type="text"
                  value={policyForm.agentAddress}
                  onChange={(e) => setPolicyForm((prev) => ({ ...prev, agentAddress: e.target.value }))}
                  placeholder="Paste agent address"
                  required
                  mono
                />
              </SettingsField>

              <SettingsField label="New daily limit (ALGO)" htmlFor="policyDailyCapAlgo">
                <SettingsInput
                  id="policyDailyCapAlgo"
                  type="number"
                  min="0.001"
                  step="0.1"
                  value={policyForm.dailyCapAlgo}
                  onChange={(e) => setPolicyForm((prev) => ({ ...prev, dailyCapAlgo: e.target.value }))}
                  required
                />
              </SettingsField>

              <button type="submit" disabled={loading} className="z-btn z-btn-ghost">
                {loading ? 'Updating...' : 'Save new limit'}
              </button>
            </form>
          </SettingsCard>

          <button
            type="button"
            className="guardian-advanced-toggle"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? 'Hide' : 'Show'} contract details
          </button>

          {showAdvanced && (
            <SettingsCard className="guardian-deployment">
              <div className="st-detail-row">
                <span className="st-detail-label">Network</span>
                <StatusBadge variant="accent">{formatNetworkLabel(network)}</StatusBadge>
              </div>
              <div className="st-detail-row">
                <span className="st-detail-label">App ID</span>
                <span className="st-detail-value st-detail-value--mono">{guardianAppId}</span>
              </div>
              <div className="st-detail-row">
                <span className="st-detail-label">Contract</span>
                <span className="st-detail-value st-detail-value--mono" title={guardianAppAddress}>
                  {guardianAppAddress.slice(0, 10)}...{guardianAppAddress.slice(-8)}
                </span>
              </div>
            </SettingsCard>
          )}
        </>
      )}

      {feedback && <FeedbackMessage variant={feedback.type}>{feedback.text}</FeedbackMessage>}
    </section>
  )
}
