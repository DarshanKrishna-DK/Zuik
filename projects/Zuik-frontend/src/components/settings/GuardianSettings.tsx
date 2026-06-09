import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useWallet } from '@txnlab/use-wallet-react'
import { Shield, ShieldOff } from 'lucide-react'
import {
  guardianContract,
  algoToMicroAlgos,
  type GuardianAgentPolicy,
} from '../../services/guardianContract'
import { getAlgorandClient } from '../../services/algorand'
import { assertAssetWithinRiskLimit, getMaxTokenRiskScore } from '../../services/tokenRiskPolicy'
import { computeRiskScore, riskBandLabel } from '../../services/tokenRisk'
import {
  SettingsPanelHeader,
  HelpCard,
  SettingsCard,
  SettingsField,
  SettingsInput,
  StatusBadge,
  FeedbackMessage,
  LoadingBlock,
  AddressDisplay,
} from './SettingsPrimitives'
import { accountExplorerUrl } from './settingsExplorer'
import './GuardianSettings.css'

const DEFAULT_MAX_PER_TRADE_ALGO = '0.5'
const DEFAULT_DAILY_CAP_ALGO = '2'
const DEFAULT_EXECUTIONS = '3'
const EXPIRY_ROUND_HORIZON = 30_000n
const GUARDIAN_AGENT_SESSION_KEY = 'zuik_guardian_agent'

type GuardianTab = 'policy' | 'recipients' | 'status'

function formatNetworkLabel(network: string): string {
  if (network === 'mainnet') return 'Mainnet'
  if (network === 'localnet') return 'Local'
  return 'Testnet'
}

function microToAlgo(micro: bigint): string {
  return (Number(micro) / 1_000_000).toFixed(2)
}

async function getCurrentRound(): Promise<bigint> {
  const status = await getAlgorandClient().client.algod.status().do()
  const s = status as unknown as { lastRound?: number | bigint; ['last-round']?: number | bigint }
  return BigInt(s.lastRound ?? s['last-round'] ?? 0)
}

function readPrefillAgent(): string {
  try {
    return sessionStorage.getItem(GUARDIAN_AGENT_SESSION_KEY)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function GuardianSettings() {
  const { activeAccount, activeAddress, transactionSigner } = useWallet()
  const [tab, setTab] = useState<GuardianTab>('policy')
  const [loading, setLoading] = useState(false)
  const [policy, setPolicy] = useState<GuardianAgentPolicy | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)

  const guardianAppId = parseInt(import.meta.env.VITE_GUARDIAN_APP_ID || '0', 10)
  const guardianAppAddress = import.meta.env.VITE_GUARDIAN_APP_ADDRESS || ''
  const network = import.meta.env.VITE_ALGOD_NETWORK || 'testnet'
  const guardianReady = guardianAppId > 0 && Boolean(guardianAppAddress)
  const maxTokenRisk = getMaxTokenRiskScore()

  const [bootstrapForm, setBootstrapForm] = useState({
    agentAddress: readPrefillAgent(),
    maxPerTradeAlgo: DEFAULT_MAX_PER_TRADE_ALGO,
    dailyCapAlgo: DEFAULT_DAILY_CAP_ALGO,
    executions: DEFAULT_EXECUTIONS,
    allowedAssetId: '0',
  })

  const [recipientForm, setRecipientForm] = useState({
    agentAddress: readPrefillAgent(),
    recipient: '',
  })

  const [allowedAssetPreview, setAllowedAssetPreview] = useState<string | null>(null)

  const showMessage = useCallback((type: 'success' | 'error' | 'info', text: string) => {
    setFeedback({ type, text })
  }, [])

  const loadGuardianData = useCallback(async () => {
    if (!activeAddress || !guardianReady) return
    setLoading(true)
    try {
      const paused = await guardianContract.isPaused(activeAddress)
      setIsPaused(paused)

      const addr = bootstrapForm.agentAddress.trim()
      if (addr) {
        const p = await guardianContract.getPolicy(addr, activeAddress)
        setPolicy(p)
      }
    } catch {
      showMessage('error', 'Could not load Guardian status. Try again in a moment.')
    } finally {
      setLoading(false)
    }
  }, [activeAddress, guardianReady, bootstrapForm.agentAddress, showMessage])

  useEffect(() => {
    const prefill = readPrefillAgent()
    if (prefill) {
      setBootstrapForm((p) => ({ ...p, agentAddress: prefill }))
      setRecipientForm((p) => ({ ...p, agentAddress: prefill }))
      try {
        sessionStorage.removeItem(GUARDIAN_AGENT_SESSION_KEY)
      } catch {
        /* ignore */
      }
    }
  }, [])

  useEffect(() => {
    if (activeAddress && guardianReady) {
      void loadGuardianData()
    }
  }, [activeAddress, guardianReady, loadGuardianData])

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeAddress || !transactionSigner) {
      showMessage('info', 'Connect your owner wallet to register the agent policy.')
      return
    }

    const maxPerTrade = parseFloat(bootstrapForm.maxPerTradeAlgo)
    const dailyCap = parseFloat(bootstrapForm.dailyCapAlgo)
    const executions = parseInt(bootstrapForm.executions, 10)
    if (!Number.isFinite(maxPerTrade) || maxPerTrade <= 0) {
      showMessage('error', 'Enter a valid max-per-trade amount in ALGO.')
      return
    }
    if (!Number.isFinite(dailyCap) || dailyCap < maxPerTrade) {
      showMessage('error', 'Daily cap must be at least the max-per-trade amount.')
      return
    }
    if (!Number.isInteger(executions) || executions <= 0) {
      showMessage('error', 'Enter a valid number of allowed executions.')
      return
    }

    const allowedAssetId = parseInt(bootstrapForm.allowedAssetId, 10)
    if (!Number.isFinite(allowedAssetId) || allowedAssetId < 0) {
      showMessage('error', 'Allowed ASA id must be 0 (ALGO only) or a positive asset id.')
      return
    }

    setLoading(true)
    setFeedback(null)
    try {
      if (allowedAssetId > 0) {
        await assertAssetWithinRiskLimit(allowedAssetId, maxTokenRisk)
      }
      const currentRound = await getCurrentRound()
      const txId = await guardianContract.bootstrapGuardian(activeAddress, transactionSigner, {
        agent: bootstrapForm.agentAddress.trim(),
        maxPerTradeMicroAlgos: algoToMicroAlgos(maxPerTrade),
        dailyCapMicroAlgos: algoToMicroAlgos(dailyCap),
        expiryRound: currentRound + EXPIRY_ROUND_HORIZON,
        dailyExecutionsCap: BigInt(executions),
        allowedAssetId: BigInt(allowedAssetId),
        allowedDexAppId: 0n,
      })
      showMessage('success', `Agent policy registered. Transaction: ${txId.slice(0, 12)}...`)
      setTab('status')
      await loadGuardianData()
    } catch (error) {
      showMessage(
        'error',
        error instanceof Error ? error.message : 'Bootstrap failed. Confirm you are the Guardian owner.',
      )
    } finally {
      setLoading(false)
    }
  }

  const handleAllowRecipient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeAddress || !transactionSigner) {
      showMessage('info', 'Connect your owner wallet to allowlist a recipient.')
      return
    }
    if (!recipientForm.recipient.trim()) {
      showMessage('error', 'Enter a recipient address to allow.')
      return
    }

    setLoading(true)
    setFeedback(null)
    try {
      const txId = await guardianContract.allowRecipient(
        activeAddress,
        transactionSigner,
        recipientForm.agentAddress.trim() || bootstrapForm.agentAddress.trim(),
        recipientForm.recipient.trim(),
      )
      showMessage('success', `Recipient allowlisted. Transaction: ${txId.slice(0, 12)}...`)
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Could not allowlist recipient.')
    } finally {
      setLoading(false)
    }
  }

  const handleTogglePause = async () => {
    if (!activeAddress || !transactionSigner) return
    setLoading(true)
    setFeedback(null)
    try {
      const newPaused = !isPaused
      const txId = newPaused
        ? await guardianContract.emergencyStop(activeAddress, transactionSigner)
        : await guardianContract.resume(activeAddress, transactionSigner)
      setIsPaused(newPaused)
      showMessage(
        'success',
        newPaused
          ? `All agents paused. Transaction: ${txId.slice(0, 12)}...`
          : `Agents resumed. Transaction: ${txId.slice(0, 12)}...`,
      )
    } catch {
      showMessage('error', 'Only the contract owner can pause or resume Guardian.')
    } finally {
      setLoading(false)
    }
  }

  const handleCheckPolicy = async () => {
    if (!activeAddress || !bootstrapForm.agentAddress.trim()) return
    setLoading(true)
    setFeedback(null)
    try {
      const p = await guardianContract.getPolicy(bootstrapForm.agentAddress.trim(), activeAddress)
      setPolicy(p)
      if (!p) showMessage('info', 'No policy registered for that agent yet.')
      else setTab('status')
    } catch {
      showMessage('error', 'Could not load policy for that address.')
    } finally {
      setLoading(false)
    }
  }

  if (!activeAccount) {
    return (
      <section className="st-section st-section--wide guardian-settings" data-testid="guardian-settings">
        <SettingsPanelHeader
          title="Guardian protection"
          subtitle="On-chain spending limits for automated agents."
        />
        <SettingsCard>
          <p className="st-muted st-center">Connect your wallet to set up Guardian protection.</p>
        </SettingsCard>
      </section>
    )
  }

  return (
    <section className="st-section st-section--wide guardian-settings" data-testid="guardian-settings">
      <SettingsPanelHeader
        title="Guardian protection"
        subtitle="Cap how much ALGO each agent sub-account can spend - enforced on-chain per trade and per day."
      />

      <HelpCard title="Before you start">
        Create and fund an agent in{' '}
        <Link to="/settings?section=agents">Agent wallets</Link>, then register its policy here. Token ASA
        limits use your score from{' '}
        <Link to="/settings?section=risk">Risk management</Link> (currently max {maxTokenRisk}).
      </HelpCard>

      {!guardianReady && (
        <div className="guardian-settings__banner guardian-settings__banner-warn" role="alert">
          Guardian is not available on this deployment yet. Set VITE_GUARDIAN_APP_ID and VITE_GUARDIAN_APP_ADDRESS.
        </div>
      )}

      {guardianReady && (
        <>
          <div className="guardian-settings__control-bar">
            <div className="guardian-overview">
              <div className="guardian-stat-card">
                <span className="guardian-stat-label">System status</span>
                <StatusBadge variant={isPaused ? 'warning' : 'success'}>
                  {isPaused ? 'Paused' : 'Active'}
                </StatusBadge>
              </div>
              <div className="guardian-stat-card">
                <span className="guardian-stat-label">Network</span>
                <StatusBadge variant="accent">{formatNetworkLabel(network)}</StatusBadge>
              </div>
              <div className="guardian-stat-card">
                <span className="guardian-stat-label">Policy loaded</span>
                <span className="guardian-stat-value">{policy ? 'Yes' : 'No'}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleTogglePause}
              className={`guardian-pause-btn ${isPaused ? 'guardian-pause-btn--resume' : 'guardian-pause-btn--pause'}`}
              disabled={loading}
            >
              {isPaused ? <Shield size={16} /> : <ShieldOff size={16} />}
              {isPaused ? 'Resume all agents' : 'Emergency pause all agents'}
            </button>
          </div>

          <div className="guardian-tabs" role="tablist" aria-label="Guardian sections">
            {(
              [
                ['policy', 'Register policy'],
                ['recipients', 'Allowlist'],
                ['status', 'Live policy'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`guardian-tab${tab === id ? ' guardian-tab--active' : ''}`}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {loading && <LoadingBlock label="Processing..." />}

          {tab === 'policy' && (
            <SettingsCard className="guardian-step-card">
              <h3 className="st-card-title">Register agent policy</h3>
              <p className="guardian-settings__hint">
                Set per-trade and daily ALGO limits plus daily execution count for this agent.
              </p>
              <form onSubmit={handleBootstrap} className="guardian-form guardian-form--grid">
                <SettingsField label="Agent wallet address" htmlFor="agentAddress">
                  <SettingsInput
                    id="agentAddress"
                    type="text"
                    value={bootstrapForm.agentAddress}
                    onChange={(e) => setBootstrapForm((p) => ({ ...p, agentAddress: e.target.value }))}
                    placeholder="Paste agent sub-account address"
                    required
                    mono
                  />
                  <button
                    type="button"
                    onClick={handleCheckPolicy}
                    className="guardian-inline-btn z-btn z-btn-ghost z-btn-sm"
                    disabled={loading || !bootstrapForm.agentAddress}
                  >
                    Load policy
                  </button>
                </SettingsField>

                <SettingsField label="Max per trade (ALGO)" htmlFor="maxPerTradeAlgo">
                  <SettingsInput
                    id="maxPerTradeAlgo"
                    type="number"
                    min="0.001"
                    step="0.1"
                    value={bootstrapForm.maxPerTradeAlgo}
                    onChange={(e) => setBootstrapForm((p) => ({ ...p, maxPerTradeAlgo: e.target.value }))}
                    required
                  />
                </SettingsField>

                <SettingsField label="Daily cap (ALGO)" htmlFor="dailyCapAlgo">
                  <SettingsInput
                    id="dailyCapAlgo"
                    type="number"
                    min="0.001"
                    step="0.1"
                    value={bootstrapForm.dailyCapAlgo}
                    onChange={(e) => setBootstrapForm((p) => ({ ...p, dailyCapAlgo: e.target.value }))}
                    required
                  />
                </SettingsField>

                <SettingsField label="Daily executions allowed" htmlFor="executions">
                  <SettingsInput
                    id="executions"
                    type="number"
                    min="1"
                    step="1"
                    value={bootstrapForm.executions}
                    onChange={(e) => setBootstrapForm((p) => ({ ...p, executions: e.target.value }))}
                    required
                  />
                  <span className="guardian-settings__hint">
                    📅 Maximum number of transactions this agent can execute per day. 
                    The limit resets every 24 hours automatically.
                  </span>
                </SettingsField>

                <SettingsField label="Allowed ASA (0 = ALGO only)" htmlFor="allowedAssetId">
                  <SettingsInput
                    id="allowedAssetId"
                    type="number"
                    min="0"
                    step="1"
                    value={bootstrapForm.allowedAssetId}
                    onChange={(e) => {
                      setBootstrapForm((p) => ({ ...p, allowedAssetId: e.target.value }))
                      setAllowedAssetPreview(null)
                    }}
                    onBlur={async () => {
                      const id = parseInt(bootstrapForm.allowedAssetId, 10)
                      if (!Number.isFinite(id) || id <= 0) {
                        setAllowedAssetPreview(null)
                        return
                      }
                      try {
                        const risk = await computeRiskScore(id)
                        setAllowedAssetPreview(`${risk.score}/100 - ${riskBandLabel(risk.band)}`)
                      } catch {
                        setAllowedAssetPreview('Could not score asset')
                      }
                    }}
                  />
                  {allowedAssetPreview && (
                    <span className="guardian-settings__hint">Risk preview: {allowedAssetPreview}</span>
                  )}
                </SettingsField>

                <div className="guardian-form__submit">
                  <button type="submit" disabled={loading} className="z-btn z-btn-primary" data-testid="guardian-bootstrap">
                    {loading ? 'Submitting...' : 'Register policy on-chain'}
                  </button>
                </div>
              </form>
            </SettingsCard>
          )}

          {tab === 'recipients' && (
            <SettingsCard className="guardian-step-card">
              <h3 className="st-card-title">Allowlist payout addresses</h3>
              <p className="guardian-settings__hint">
                Agents can only pay addresses you allow. Add each destination once per agent.
              </p>
              <form onSubmit={handleAllowRecipient} className="guardian-form guardian-form--grid">
                <SettingsField label="Agent wallet address" htmlFor="recipientAgentAddress">
                  <SettingsInput
                    id="recipientAgentAddress"
                    type="text"
                    value={recipientForm.agentAddress}
                    onChange={(e) => setRecipientForm((p) => ({ ...p, agentAddress: e.target.value }))}
                    placeholder="Agent address"
                    mono
                  />
                </SettingsField>
                <SettingsField label="Recipient address" htmlFor="recipient">
                  <SettingsInput
                    id="recipient"
                    type="text"
                    value={recipientForm.recipient}
                    onChange={(e) => setRecipientForm((p) => ({ ...p, recipient: e.target.value }))}
                    placeholder="Paste allowed recipient address"
                    required
                    mono
                  />
                </SettingsField>
                <div className="guardian-form__submit">
                  <button type="submit" disabled={loading} className="z-btn z-btn-primary" data-testid="guardian-allow-recipient">
                    {loading ? 'Submitting...' : 'Allow recipient'}
                  </button>
                </div>
              </form>
            </SettingsCard>
          )}

          {tab === 'status' && (
            <SettingsCard className="guardian-step-card">
              <h3 className="st-card-title">On-chain policy snapshot</h3>
              {bootstrapForm.agentAddress.trim() && (
                <AddressDisplay
                  address={bootstrapForm.agentAddress.trim()}
                  explorerUrl={accountExplorerUrl(network, bootstrapForm.agentAddress.trim())}
                />
              )}
              {policy ? (
                <div className="guardian-status-grid">
                  <div className="guardian-status-item">
                    <span className="guardian-status-label">Max per trade</span>
                    <span className="guardian-status-value">{microToAlgo(policy.maxPerTradeMicroAlgos)} ALGO</span>
                  </div>
                  <div className="guardian-status-item">
                    <span className="guardian-status-label">Daily cap</span>
                    <span className="guardian-status-value">{microToAlgo(policy.dailyCapMicroAlgos)} ALGO</span>
                  </div>
                  <div className="guardian-status-item">
                    <span className="guardian-status-label">Spent today</span>
                    <span className="guardian-status-value">{microToAlgo(policy.dailySpentMicroAlgos)} ALGO</span>
                  </div>
                  <div className="guardian-status-item">
                    <span className="guardian-status-label">Executions remaining today</span>
                    <span className="guardian-status-value">
                      {(policy.dailyExecutionsCap - policy.dailyExecutionsSpent).toString()}
                      {(policy.dailyExecutionsCap - policy.dailyExecutionsSpent) === 0n && " ⚠️ Daily limit reached"}
                      {(policy.dailyExecutionsCap - policy.dailyExecutionsSpent) <= 2n && (policy.dailyExecutionsCap - policy.dailyExecutionsSpent) > 0n && " ⚠️ Low"}
                    </span>
                  </div>
                  <div className="guardian-status-item">
                    <span className="guardian-status-label">Expiry round</span>
                    <span className="guardian-status-value">{policy.expiryRound.toString()}</span>
                  </div>
                  <div className="guardian-status-item">
                    <span className="guardian-status-label">Allowed ASA</span>
                    <span className="guardian-status-value">
                      {policy.allowedAssetId === 0n ? 'ALGO only' : `#${policy.allowedAssetId.toString()}`}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="guardian-settings__hint">
                  Enter an agent address under Register policy and click Load policy to view limits here.
                </p>
              )}
            </SettingsCard>
          )}

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
