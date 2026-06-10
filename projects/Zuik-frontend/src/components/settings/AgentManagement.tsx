import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useWallet } from '@txnlab/use-wallet-react'
import { Plus, RefreshCw, Shield, ShieldOff, Sparkles } from 'lucide-react'
import {
  createAgentWallet,
  fundAgentWallet,
  deleteAgentWallet,
  fetchWorkflowAgentBindings,
  type WorkflowAgentBinding,
} from '../../services/agentWallet'
import { guardianContract, algoToMicroAlgos } from '../../services/guardianContract'
import { getAlgorandClient } from '../../services/algorand'
import {
  fetchAgentOverview,
  fetchPolicyTemplates,
  createCustomPolicyTemplate,
  savePolicyBinding,
  syncPolicyStatus,
  updateAgentDisplay,
  policyStatusLabel,
  policyStatusVariant,
  microToAlgo,
  type AgentOverviewEntry,
  type PolicyTemplate,
} from '../../services/agentManagement'
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
import { ToggleSwitch } from './ToggleSwitch'
import { IconTrash, IconChevronRight } from './SettingsIcons'
import { accountExplorerUrl } from './settingsExplorer'
import './AgentManagement.css'

const EXPIRY_ROUND_HORIZON = 30_000n

type WizardStep = 'create' | 'fund' | 'policy' | 'ready'

interface CustomPolicy {
  name: string
  maxPerTrade: string
  dailyCap: string
  dailyExecutions: string
  expiryDays: string
}

function formatAlgo(amount: number): string {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

async function getCurrentRound(): Promise<bigint> {
  const status = await getAlgorandClient().client.algod.status().do()
  const s = status as unknown as { lastRound?: number | bigint; ['last-round']?: number | bigint }
  return BigInt(s.lastRound ?? s['last-round'] ?? 0)
}

function agentTitle(entry: AgentOverviewEntry): string {
  return entry.wallet.display_name?.trim() || `Agent ${entry.wallet.agent_address.slice(0, 6)}...`
}

export function AgentManagement() {
  const { activeAccount, activeAddress, transactionSigner } = useWallet()
  const network = import.meta.env.VITE_ALGOD_NETWORK || 'testnet'
  const guardianAppId = parseInt(import.meta.env.VITE_GUARDIAN_APP_ID || '0', 10)
  const guardianReady = guardianAppId > 0

  const [agents, setAgents] = useState<AgentOverviewEntry[]>([])
  const [workflowBindings, setWorkflowBindings] = useState<WorkflowAgentBinding[]>([])
  const [templates, setTemplates] = useState<PolicyTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)

  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState<WizardStep>('create')
  const [wizardAgent, setWizardAgent] = useState<string | null>(null)
  const [wizardAgentName, setWizardAgentName] = useState('')
  const [wizardFundAlgo, setWizardFundAlgo] = useState('2')
  const [wizardTemplateId, setWizardTemplateId] = useState<string | null>(null)
  const [wizardCustomPolicy, setWizardCustomPolicy] = useState<CustomPolicy>({
    name: 'Custom Policy',
    maxPerTrade: '0.5',
    dailyCap: '2.0',
    dailyExecutions: '3',
    expiryDays: '30'
  })
  const [saveCustomPolicyAsTemplate, setSaveCustomPolicyAsTemplate] = useState(false)
  const [wizardBusy, setWizardBusy] = useState(false)
  
  // Policy editing state
  const [editingPolicy, setEditingPolicy] = useState<string | null>(null)
  const [editPolicy, setEditPolicy] = useState<CustomPolicy>({
    name: '',
    maxPerTrade: '',
    dailyCap: '',
    dailyExecutions: '',
    expiryDays: ''
  })

  const [fundTarget, setFundTarget] = useState<string | null>(null)
  const [fundAmountAlgo, setFundAmountAlgo] = useState('2')
  const [funding, setFunding] = useState(false)

  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)
  const [recipientInput, setRecipientInput] = useState('')
  const [globalPaused, setGlobalPaused] = useState(false)
  const [emergencyStopBusy, setEmergencyStopBusy] = useState(false)

  const showMessage = useCallback((type: 'success' | 'error' | 'info', text: string) => {
    setFeedback({ type, text })
  }, [])

  const loadAll = useCallback(async () => {
    if (!activeAddress) return
    setLoading(true)
    try {
      const [overview, tpls, bindings] = await Promise.all([
        fetchAgentOverview(activeAddress),
        fetchPolicyTemplates(activeAddress),
        fetchWorkflowAgentBindings(activeAddress).catch(() => []),
      ])
      setAgents(overview)
      setTemplates(tpls)
      setWorkflowBindings(bindings)
      if (guardianReady) {
        const paused = await guardianContract.isPaused(activeAddress)
        setGlobalPaused(paused)
      }
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Could not load agents.')
    } finally {
      setLoading(false)
    }
  }, [activeAddress, guardianReady, showMessage])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const bindingsByAgent = useMemo(() => {
    const map = new Map<string, WorkflowAgentBinding[]>()
    for (const b of workflowBindings) {
      if (!b.agentAddress) continue
      const list = map.get(b.agentAddress) ?? []
      list.push(b)
      map.set(b.agentAddress, list)
    }
    return map
  }, [workflowBindings])

  const totalBalance = agents.reduce((sum, a) => sum + a.balance.balance, 0)
  const activePolicies = agents.filter((a) => a.policyStatus === 'active').length
  const avgHealth =
    agents.length > 0
      ? Math.round(agents.reduce((s, a) => s + a.healthScore, 0) / agents.length)
      : 0

  const openWizard = () => {
    setWizardOpen(true)
    setWizardStep('create')
    setWizardAgent(null)
    setWizardTemplateId(templates.find((t) => t.slug === 'standard')?.id ?? null)
    setWizardFundAlgo('2')
    setFeedback(null)
  }

  const handleWizardCreate = async () => {
    if (!activeAddress) return
    setWizardBusy(true)
    try {
      const workflowId = crypto.randomUUID()
      const agentName = wizardAgentName.trim() || `Agent ${Date.now().toString().slice(-4)}`
      
      console.log('Creating agent wallet...', { workflowId, activeAddress, agentName })
      
      const created = await createAgentWallet(workflowId, activeAddress, {
        guardianAppId: guardianAppId || undefined,
        displayName: agentName,
      })
      
      console.log('Agent created:', created)
      setWizardAgent(created.agentAddress)
      setWizardStep('fund')
      showMessage('success', `Agent "${agentName}" created. Fund it to continue setup.`)
      await loadAll()
    } catch (error) {
      console.error('Agent creation failed:', error)
      showMessage('error', error instanceof Error ? error.message : 'Could not create agent.')
    } finally {
      setWizardBusy(false)
    }
  }

  const handleWizardFund = async () => {
    if (!activeAddress || !transactionSigner || !wizardAgent) return
    const amount = parseFloat(wizardFundAlgo)
    if (!Number.isFinite(amount) || amount <= 0) {
      showMessage('error', 'Enter a valid funding amount.')
      return
    }
    setWizardBusy(true)
    try {
      await fundAgentWallet({
        ownerAddress: activeAddress,
        agentAddress: wizardAgent,
        amountMicroAlgos: algoToMicroAlgos(amount),
        signer: transactionSigner,
        note: 'Zuik agent setup',
      })
      setWizardStep('policy')
      showMessage('success', `Funded with ${amount} ALGO.`)
      await loadAll()
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Funding failed.')
    } finally {
      setWizardBusy(false)
    }
  }

  const bootstrapPolicy = async (agentAddress: string, templateId: string | null, customPolicy?: CustomPolicy, retryCount = 0) => {
    if (!activeAddress || !transactionSigner) {
      showMessage('info', 'Connect your owner wallet to register the on-chain policy.')
      return
    }

    let policyValues: any
    let policyName: string

    if (customPolicy) {
      // Use custom policy values
      policyValues = {
        max_per_trade_microalgos: Math.round(parseFloat(customPolicy.maxPerTrade) * 1_000_000),
        daily_cap_microalgos: Math.round(parseFloat(customPolicy.dailyCap) * 1_000_000),
        daily_executions_cap: parseInt(customPolicy.dailyExecutions),
        allowed_asset_id: 0,
        allowed_dex_app_id: 0,
      }
      policyName = customPolicy.name
    } else {
      // Use template values
      const template = templates.find((t) => t.id === templateId)
      if (!template) {
        showMessage('error', 'Select a policy template first.')
        return
      }
      policyValues = template
      policyName = template.name
    }

    setWizardBusy(true)
    try {
      console.log('Saving policy binding...', { agentAddress, policyValues })
      
      await savePolicyBinding({
        ownerAddress: activeAddress,
        agentAddress,
        policyTemplateId: templateId,
      })

      console.log('Bootstrapping Guardian contract...', policyValues)

      // Get fresh network parameters to avoid expired transactions
      const currentRound = await getCurrentRound()
      const expiryRounds = customPolicy ? parseInt(customPolicy.expiryDays) * 1000 : 30000
      
      console.log(`Transaction attempt ${retryCount + 1} - Current round: ${currentRound}`)
      
      const txId = await guardianContract.bootstrapGuardian(activeAddress, transactionSigner, {
        agent: agentAddress,
        maxPerTradeMicroAlgos: BigInt(policyValues.max_per_trade_microalgos),
        dailyCapMicroAlgos: BigInt(policyValues.daily_cap_microalgos),
        expiryRound: currentRound + BigInt(expiryRounds),
        dailyExecutionsCap: BigInt(policyValues.daily_executions_cap),
        allowedAssetId: BigInt(policyValues.allowed_asset_id),
        allowedDexAppId: BigInt(policyValues.allowed_dex_app_id),
      })

      console.log('Policy bootstrapped, syncing status...', { txId })

      await syncPolicyStatus(activeAddress, agentAddress, {
        bootstrapTxId: txId,
        expiryRound: Number(currentRound + BigInt(expiryRounds)),
      })

      showMessage('success', `Policy "${policyName}" registered on-chain. Tx: ${txId.slice(0, 12)}...`)
      await loadAll()
      return true
    } catch (error) {
      console.error('Policy registration failed:', error)
      
      // Retry on transaction expiry errors  
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      if (errorMessage.includes('txn dead') || errorMessage.includes('round outside') && retryCount < 3) {
        console.log(`Transaction expired, retrying... (attempt ${retryCount + 1}/3)`)
        showMessage('info', `Transaction expired, retrying... (${retryCount + 1}/3)`)
        
        // Wait a moment then retry with fresh params
        await new Promise(resolve => setTimeout(resolve, 2000))
        return bootstrapPolicy(agentAddress, templateId, customPolicy, retryCount + 1)
      }
      
      showMessage(
        'error',
        errorMessage.includes('txn dead') 
          ? 'Transaction expired. Please try again with fresh network parameters.'
          : error instanceof Error ? error.message : 'Policy registration failed.',
      )
      return false
    } finally {
      setWizardBusy(false)
    }
  }

  const handleWizardPolicy = async () => {
    if (!wizardAgent || !activeAddress) return
    
    const isCustomPolicy = wizardTemplateId === 'custom'
    if (isCustomPolicy) {
      // Validate custom policy values
      const maxPerTrade = parseFloat(wizardCustomPolicy.maxPerTrade)
      const dailyCap = parseFloat(wizardCustomPolicy.dailyCap)
      const dailyExecutions = parseInt(wizardCustomPolicy.dailyExecutions)
      const expiryDays = parseInt(wizardCustomPolicy.expiryDays)
      
      if (!Number.isFinite(maxPerTrade) || maxPerTrade <= 0) {
        showMessage('error', 'Enter a valid max per trade amount.')
        return
      }
      if (!Number.isFinite(dailyCap) || dailyCap <= 0) {
        showMessage('error', 'Enter a valid daily cap amount.')
        return
      }
      if (!Number.isFinite(dailyExecutions) || dailyExecutions <= 0) {
        showMessage('error', 'Enter a valid daily executions count.')
        return
      }
      if (!Number.isFinite(expiryDays) || expiryDays <= 0) {
        showMessage('error', 'Enter a valid expiry period.')
        return
      }

      // Save as template if requested
      let templateId: string | null = null
      if (saveCustomPolicyAsTemplate) {
        try {
          const template = await createCustomPolicyTemplate({
            ownerAddress: activeAddress,
            name: wizardCustomPolicy.name,
            maxPerTradeMicroAlgos: Math.round(maxPerTrade * 1_000_000),
            dailyCapMicroAlgos: Math.round(dailyCap * 1_000_000),
            dailyExecutionsCap: dailyExecutions,
            expiryRoundHorizon: expiryDays * 1000,
          })
          templateId = template.id
          showMessage('success', `Custom policy "${wizardCustomPolicy.name}" saved as template.`)
          // Reload templates to include the new one
          const updatedTemplates = await fetchPolicyTemplates(activeAddress)
          setTemplates(updatedTemplates)
        } catch (error) {
          console.error('Failed to save template:', error)
          showMessage('error', 'Failed to save policy as template, but will continue with registration.')
        }
      }
      
      const ok = await bootstrapPolicy(wizardAgent, templateId, wizardCustomPolicy)
      if (ok) {
        setWizardStep('ready')
      }
    } else {
      if (!wizardTemplateId) return
      const ok = await bootstrapPolicy(wizardAgent, wizardTemplateId)
      if (ok) {
        setWizardStep('ready')
      }
    }
  }

  const handleRenewPolicy = async (entry: AgentOverviewEntry) => {
    const templateId =
      entry.policyTemplate?.id ??
      entry.policyBinding?.policy_template_id ??
      templates.find((t) => t.slug === 'standard')?.id
    await bootstrapPolicy(entry.wallet.agent_address, templateId)
  }

  const handleFund = async (agentAddress: string) => {
    if (!activeAddress || !transactionSigner) return
    const amount = parseFloat(fundAmountAlgo)
    if (!Number.isFinite(amount) || amount <= 0) {
      showMessage('error', 'Enter a valid funding amount.')
      return
    }
    setFunding(true)
    try {
      await fundAgentWallet({
        ownerAddress: activeAddress,
        agentAddress,
        amountMicroAlgos: algoToMicroAlgos(amount),
        signer: transactionSigner,
        note: 'Zuik agent funding',
      })
      showMessage('success', `Funded with ${amount} ALGO.`)
      setFundTarget(null)
      setTimeout(() => void loadAll(), 3000)
      await loadAll()
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Funding failed.')
    } finally {
      setFunding(false)
    }
  }

  const handleToggle = async (entry: AgentOverviewEntry, enabled: boolean) => {
    if (!activeAddress) return
    try {
      await updateAgentDisplay(activeAddress, entry.wallet.agent_address, {
        status: enabled ? 'active' : 'inactive',
      })
      await loadAll()
      showMessage('success', enabled ? 'Agent enabled.' : 'Agent paused.')
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Could not update status.')
    }
  }

  const handleDelete = async (entry: AgentOverviewEntry) => {
    if (!activeAddress) return
    const ok = window.confirm(
      `Archive agent ${entry.wallet.agent_address.slice(0, 8)}...? This removes the server signing key.`,
    )
    if (!ok) return
    try {
      await deleteAgentWallet(activeAddress, entry.wallet.agent_address)
      showMessage('success', 'Agent archived.')
      await loadAll()
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Could not archive agent.')
    }
  }

  const handleAllowRecipient = async (agentAddress: string) => {
    if (!activeAddress || !transactionSigner || !recipientInput.trim()) return
    try {
      const txId = await guardianContract.allowRecipient(
        activeAddress,
        transactionSigner,
        agentAddress,
        recipientInput.trim(),
      )
      showMessage('success', `Recipient allowlisted. Tx: ${txId.slice(0, 12)}...`)
      setRecipientInput('')
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Could not allowlist recipient.')
    }
  }

  const handleEmergencyToggle = async () => {
    if (!activeAddress) {
      showMessage('error', 'Connect your wallet to control Guardian emergency stop.')
      return
    }
    if (!transactionSigner) {
      showMessage(
        'error',
        'Wallet signing is required. Reconnect your wallet and approve the connection request, then try again.',
      )
      return
    }

    setEmergencyStopBusy(true)
    setFeedback(null)
    try {
      const txId = globalPaused
        ? await guardianContract.resume(activeAddress, transactionSigner)
        : await guardianContract.emergencyStop(activeAddress, transactionSigner)
      setGlobalPaused(!globalPaused)
      showMessage(
        'success',
        globalPaused
          ? `Guardian resumed. All agent payments are allowed again. Tx: ${txId.slice(0, 12)}...`
          : `Emergency stop activated. All agent payments are blocked. Tx: ${txId.slice(0, 12)}...`,
      )
      await loadAll()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Guardian toggle failed.'
      if (/reject|cancel/i.test(msg)) {
        showMessage('error', 'Transaction was rejected in your wallet.')
      } else if (/owner|unauthorized|logic eval/i.test(msg)) {
        showMessage('error', 'Only the Guardian contract owner can pause or resume. Connect the owner wallet.')
      } else {
        showMessage('error', msg)
      }
    } finally {
      setEmergencyStopBusy(false)
    }
  }

  if (!activeAccount) {
    return (
      <section className="st-section st-section--wide agent-mgmt" data-testid="agent-management">
        <SettingsPanelHeader
          title="Agent Management"
          subtitle="Create funded agents, attach Guardian policies, and monitor health in one place."
        />
        <SettingsCard>
          <p className="st-muted st-center">Connect your wallet to manage agents.</p>
        </SettingsCard>
      </section>
    )
  }

  return (
    <section className="st-section st-section--wide agent-mgmt" data-testid="agent-management">
      <div className="agent-mgmt__hero">
        <SettingsPanelHeader
          title="Agent Management"
          subtitle="Unified control for agent wallets, Guardian policies, and automation readiness."
        />
        <div className="agent-mgmt__toolbar">
          <button
            type="button"
            className="z-btn z-btn-ghost z-btn-sm"
            onClick={() => void loadAll()}
            disabled={loading}
            aria-label="Refresh"
          >
            <RefreshCw size={16} className={loading ? 'agent-mgmt__spin' : ''} />
            Refresh
          </button>
          <button
            type="button"
            className="z-btn z-btn-primary"
            onClick={openWizard}
            data-testid="create-agent-wallet"
          >
            <Plus size={16} />
            New agent
          </button>
        </div>
      </div>

      <HelpCard title="How it works">
        Create an agent sub-account, fund it once, then pick a policy template. Guardian enforces limits
        on-chain for every autonomous payment.
      </HelpCard>

      {!guardianReady && (
        <div className="guardian-settings__banner guardian-settings__banner-warn" role="alert">
          Guardian is not configured. Set VITE_GUARDIAN_APP_ID for on-chain policy enforcement.
        </div>
      )}

      <div className="agent-mgmt__stats">
        <div className="agent-mgmt__stat">
          <span className="agent-mgmt__stat-label">Total balance</span>
          <span className="agent-mgmt__stat-value">{formatAlgo(totalBalance)} ALGO</span>
        </div>
        <div className="agent-mgmt__stat">
          <span className="agent-mgmt__stat-label">Agents</span>
          <span className="agent-mgmt__stat-value">{agents.length}</span>
        </div>
        <div className="agent-mgmt__stat">
          <span className="agent-mgmt__stat-label">Active policies</span>
          <span className="agent-mgmt__stat-value">{activePolicies}</span>
        </div>
        <div className="agent-mgmt__stat">
          <span className="agent-mgmt__stat-label">Avg health</span>
          <span className="agent-mgmt__stat-value">{avgHealth}%</span>
        </div>
      </div>

      {globalPaused && (
        <FeedbackMessage variant="error">
          Guardian emergency stop is active. All agent payments are blocked until you resume.
        </FeedbackMessage>
      )}

      {loading && agents.length === 0 && <LoadingBlock label="Loading agents..." />}

      {!loading && agents.length === 0 && (
        <SettingsCard className="agent-mgmt__empty">
          <Sparkles size={28} style={{ color: 'var(--z-accent)' }} aria-hidden />
          <p className="st-muted">No agents yet. Launch the setup wizard to create, fund, and protect your first agent.</p>
          <button type="button" className="z-btn z-btn-primary" onClick={openWizard}>
            <Plus size={16} />
            Start setup wizard
          </button>
        </SettingsCard>
      )}

      <div className="agent-mgmt__grid">
        {agents.map((entry) => {
          const explorerUrl = accountExplorerUrl(network, entry.wallet.agent_address)
          const isFunding = fundTarget === entry.wallet.agent_address
          const isExpanded = expandedAgent === entry.wallet.agent_address
          const policyName = entry.policyTemplate?.name ?? 'Custom policy'
          const dailyCap = entry.guardian.policy?.dailyCapMicroAlgos
          const maxTrade = entry.guardian.policy?.maxPerTradeMicroAlgos

          return (
            <article
              key={entry.wallet.id}
              className="agent-mgmt__card"
              data-testid={`agent-card-${entry.wallet.id}`}
            >
              <div className="agent-mgmt__card-head">
                <div className="agent-mgmt__card-title-row">
                  <h4 className="agent-mgmt__card-title">{agentTitle(entry)}</h4>
                  <StatusBadge variant={entry.wallet.status === 'active' ? 'success' : 'warning'}>
                    Agent: {entry.wallet.status === 'active' ? 'Active' : 'Inactive'}
                  </StatusBadge>
                  <StatusBadge variant={policyStatusVariant(entry.policyStatus)}>
                    Policy: {policyStatusLabel(entry.policyStatus)}
                  </StatusBadge>
                  {!entry.balance.hasKey && (
                    <StatusBadge variant="warning">No server key</StatusBadge>
                  )}
                </div>
                <AddressDisplay address={entry.wallet.agent_address} explorerUrl={explorerUrl} />
              </div>

              <div className="agent-mgmt__health">
                <div className="agent-mgmt__health-row">
                  <span>Health score</span>
                  <span>{entry.healthScore}%</span>
                </div>
                <div className="agent-mgmt__health-bar">
                  <div
                    className="agent-mgmt__health-fill"
                    style={{ width: `${entry.healthScore}%` }}
                  />
                </div>
              </div>

              <div className="agent-mgmt__metrics">
                <div>
                  <span className="agent-mgmt__metric-label">Balance</span>
                  <span className="agent-mgmt__metric-value">
                    {formatAlgo(entry.balance.balance)} ALGO
                  </span>
                </div>
                <div>
                  <span className="agent-mgmt__metric-label">Available</span>
                  <span className="agent-mgmt__metric-value">
                    {formatAlgo(entry.balance.available)} ALGO
                  </span>
                </div>
                <div>
                  <span className="agent-mgmt__metric-label">Executions left</span>
                  <span className="agent-mgmt__metric-value">
                    {entry.guardian.policy
                      ? String(
                          Number(entry.guardian.policy.dailyExecutionsCap) -
                            Number(entry.guardian.policy.dailyExecutionsSpent),
                        )
                      : '-'}
                  </span>
                </div>
              </div>

              {(bindingsByAgent.get(entry.wallet.agent_address)?.length ?? 0) > 0 && (
                <div className="agent-mgmt__workflows" data-testid={`agent-workflows-${entry.wallet.id}`}>
                  <div className="agent-mgmt__workflows-title">Linked workflows</div>
                  {bindingsByAgent.get(entry.wallet.agent_address)?.map((b) => (
                    <Link
                      key={b.workflowId}
                      to={`/builder?wf=${b.workflowId}`}
                      className="agent-mgmt__workflow-chip"
                      title={b.bindingType ? `${b.bindingType} binding` : 'Workflow'}
                    >
                      {b.workflowName}
                      {b.bindingType && (
                        <span className="st-muted" style={{ fontSize: '0.65rem' }}>
                          {b.bindingType}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              )}

              <div className="agent-mgmt__policy-row">
                <Shield size={16} aria-hidden style={{ color: 'var(--z-accent)' }} />
                <span className="agent-mgmt__policy-name">{policyName}</span>
                {maxTrade && dailyCap && (
                  <span className="st-muted" style={{ fontSize: '0.75rem' }}>
                    {microToAlgo(maxTrade)} / trade, {microToAlgo(dailyCap)} daily
                  </span>
                )}
                {(entry.policyStatus === 'expired' || entry.policyStatus === 'missing') && (
                  <button
                    type="button"
                    className="z-btn z-btn-primary z-btn-sm"
                    onClick={() => void handleRenewPolicy(entry)}
                  >
                    Renew policy
                  </button>
                )}
                {entry.policyStatus === 'active' && (
                  <button
                    type="button"
                    className="z-btn z-btn-ghost z-btn-sm"
                    onClick={() => {
                      setEditingPolicy(entry.wallet.agent_address)
                      if (entry.policyBinding) {
                        setEditPolicy({
                          name: entry.policyTemplate?.name || 'Custom Policy',
                          maxPerTrade: microToAlgo(entry.policyBinding.max_per_trade_microalgos || 0).toString(),
                          dailyCap: microToAlgo(entry.policyBinding.daily_cap_microalgos || 0).toString(),
                          dailyExecutions: (entry.policyBinding.daily_executions_cap || 0).toString(),
                          expiryDays: '30'
                        })
                      }
                    }}
                  >
                    Edit policy
                  </button>
                )}
              </div>

              <div className="agent-mgmt__card-actions">
                <ToggleSwitch
                  id={`toggle-${entry.wallet.id}`}
                  checked={entry.wallet.status === 'active'}
                  onChange={(v) => void handleToggle(entry, v)}
                  showLabels
                  onLabel="ACTIVE"
                  offLabel="INACTIVE"
                  testId={`agent-toggle-${entry.wallet.id}`}
                />
                <div className="agent-mgmt__card-buttons">
                  <button
                    type="button"
                    className="z-btn z-btn-ghost z-btn-sm"
                    onClick={() => {
                      setFundTarget(isFunding ? null : entry.wallet.agent_address)
                      setFundAmountAlgo('2')
                    }}
                  >
                    Fund
                  </button>
                  <button
                    type="button"
                    className="st-icon-btn st-btn-icon--danger"
                    onClick={() => void handleDelete(entry)}
                    aria-label="Archive agent"
                  >
                    <IconTrash />
                  </button>
                  <button
                    type="button"
                    className="agent-mgmt__advanced-toggle"
                    onClick={() =>
                      setExpandedAgent(isExpanded ? null : entry.wallet.agent_address)
                    }
                  >
                    Advanced
                    <IconChevronRight />
                  </button>
                </div>
              </div>

              {isFunding && (
                <div className="agent-mgmt__fund">
                  <SettingsField label="Amount (ALGO)" htmlFor={`fund-${entry.wallet.id}`}>
                    <div className="agent-mgmt__fund-row">
                      <SettingsInput
                        id={`fund-${entry.wallet.id}`}
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={fundAmountAlgo}
                        onChange={(e) => setFundAmountAlgo(e.target.value)}
                      />
                      <button
                        type="button"
                        className="z-btn z-btn-primary"
                        disabled={funding}
                        onClick={() => void handleFund(entry.wallet.agent_address)}
                        data-testid="fund-agent-wallet"
                      >
                        {funding ? 'Sending...' : 'Send ALGO'}
                      </button>
                    </div>
                  </SettingsField>
                </div>
              )}

              {isExpanded && (
                <div className="agent-mgmt__advanced">
                  <SettingsField label="Allow recipient" htmlFor={`rcv-${entry.wallet.id}`}>
                    <div className="agent-mgmt__fund-row">
                      <SettingsInput
                        id={`rcv-${entry.wallet.id}`}
                        value={recipientInput}
                        onChange={(e) => setRecipientInput(e.target.value)}
                        placeholder="Recipient Algorand address"
                      />
                      <button
                        type="button"
                        className="z-btn z-btn-ghost z-btn-sm"
                        onClick={() => void handleAllowRecipient(entry.wallet.agent_address)}
                      >
                        Allow
                      </button>
                    </div>
                  </SettingsField>
                  {entry.guardian.blockReason && (
                    <p className="st-muted" style={{ fontSize: '0.75rem', marginTop: 8 }}>
                      {entry.guardian.blockReason}
                    </p>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>

      {feedback && <FeedbackMessage variant={feedback.type}>{feedback.text}</FeedbackMessage>}

      {guardianReady && (
        <SettingsCard className="agent-mgmt__global-guardian" style={{ marginTop: 20 }}>
          <div className="agent-mgmt__card-actions">
            <div>
              <strong>Global Guardian control</strong>
              <p className="st-muted" style={{ fontSize: '0.8125rem', margin: '4px 0 0' }}>
                Emergency stop blocks all agent payments until resumed.
                {!transactionSigner && activeAddress && (
                  <span className="agent-mgmt__wallet-hint"> Connect wallet with signing enabled to use this control.</span>
                )}
              </p>
            </div>
            <button
              type="button"
              className={`z-btn agent-mgmt__emergency-btn ${globalPaused ? 'z-btn-primary' : 'z-btn-ghost'}`}
              onClick={() => void handleEmergencyToggle()}
              disabled={emergencyStopBusy || !activeAddress}
              data-testid="emergency-stop-btn"
              title={
                !activeAddress
                  ? 'Connect your wallet first'
                  : !transactionSigner
                    ? 'Wallet signing required - reconnect your wallet'
                    : globalPaused
                      ? 'Resume Guardian and allow agent payments'
                      : 'Emergency stop - block all agent payments'
              }
            >
              {emergencyStopBusy ? (
                <RefreshCw size={16} className="agent-mgmt__spin" aria-hidden />
              ) : globalPaused ? (
                <Shield size={16} aria-hidden />
              ) : (
                <ShieldOff size={16} aria-hidden />
              )}
              {emergencyStopBusy
                ? globalPaused
                  ? 'Resuming...'
                  : 'Stopping...'
                : globalPaused
                  ? 'Resume Guardian'
                  : 'Emergency stop'}
            </button>
          </div>
        </SettingsCard>
      )}

      {wizardOpen && (
        <div className="agent-mgmt__wizard-backdrop" role="dialog" aria-modal="true" aria-label="Agent setup wizard">
          <div className="agent-mgmt__wizard">
            <h3 style={{ margin: '0 0 8px', color: 'var(--z-text)' }}>Agent setup wizard</h3>
            <p className="st-muted" style={{ fontSize: '0.8125rem', marginBottom: 16 }}>
              Create, fund, select a policy, and go live.
            </p>

            <div className="agent-mgmt__wizard-steps">
              {(['create', 'fund', 'policy', 'ready'] as WizardStep[]).map((step, i) => {
                const steps: WizardStep[] = ['create', 'fund', 'policy', 'ready']
                const currentIdx = steps.indexOf(wizardStep)
                const stepIdx = steps.indexOf(step)
                const cls =
                  stepIdx < currentIdx
                    ? 'agent-mgmt__wizard-step agent-mgmt__wizard-step--done'
                    : stepIdx === currentIdx
                      ? 'agent-mgmt__wizard-step agent-mgmt__wizard-step--current'
                      : 'agent-mgmt__wizard-step'
                return <div key={step} className={cls} />
              })}
            </div>

            {wizardStep === 'create' && (
              <div>
                <p className="st-muted">Step 1: Generate a new agent sub-account with a server-held signing key.</p>
                <SettingsField label="Agent name" htmlFor="wizard-agent-name">
                  <SettingsInput
                    id="wizard-agent-name"
                    type="text"
                    placeholder="My Trading Agent"
                    value={wizardAgentName}
                    onChange={(e) => setWizardAgentName(e.target.value)}
                  />
                </SettingsField>
                <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="z-btn z-btn-primary"
                    disabled={wizardBusy}
                    onClick={() => void handleWizardCreate()}
                  >
                    {wizardBusy ? 'Creating...' : 'Create agent'}
                  </button>
                  <button type="button" className="z-btn z-btn-ghost" onClick={() => setWizardOpen(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 'fund' && wizardAgent && (
              <div>
                <p className="st-muted">Step 2: Fund the agent from your connected wallet (one-time).</p>
                <SettingsField label="Amount (ALGO)" htmlFor="wizard-fund">
                  <SettingsInput
                    id="wizard-fund"
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={wizardFundAlgo}
                    onChange={(e) => setWizardFundAlgo(e.target.value)}
                  />
                </SettingsField>
                <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="z-btn z-btn-primary"
                    disabled={wizardBusy}
                    onClick={() => void handleWizardFund()}
                  >
                    {wizardBusy ? 'Sending...' : 'Fund agent'}
                  </button>
                  <button
                    type="button"
                    className="z-btn z-btn-ghost"
                    onClick={() => setWizardStep('policy')}
                  >
                    Skip
                  </button>
                  <button
                    type="button"
                    className="z-btn z-btn-ghost"
                    onClick={() => setWizardStep('create')}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="z-btn z-btn-ghost"
                    onClick={() => setWizardOpen(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 'policy' && wizardAgent && (
              <div>
                <p className="st-muted">Step 3: Choose a policy template and register on Guardian.</p>
                <div className="agent-mgmt__templates">
                  {templates.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      className={`agent-mgmt__template${wizardTemplateId === tpl.id ? ' agent-mgmt__template--selected' : ''}`}
                      onClick={() => setWizardTemplateId(tpl.id)}
                    >
                      <span className="agent-mgmt__template-radio" />
                      <div className="agent-mgmt__template-body">
                        <h5>{tpl.name}</h5>
                        <p>{tpl.description}</p>
                        <div className="agent-mgmt__template-meta">
                          {microToAlgo(tpl.max_per_trade_microalgos)} ALGO / trade ·{' '}
                          {microToAlgo(tpl.daily_cap_microalgos)} daily · {tpl.daily_executions_cap} runs
                        </div>
                      </div>
                    </button>
                  ))}
                  
                  {/* Custom policy option */}
                  <button
                    type="button"
                    className={`agent-mgmt__template${wizardTemplateId === 'custom' ? ' agent-mgmt__template--selected' : ''}`}
                    onClick={() => setWizardTemplateId('custom')}
                  >
                    <span className="agent-mgmt__template-radio" />
                    <div className="agent-mgmt__template-body">
                      <h5>Custom Policy</h5>
                      <p>Create your own spending limits and executions</p>
                      <div className="agent-mgmt__template-meta">
                        Full control over all parameters
                      </div>
                    </div>
                  </button>
                </div>
                
                {/* Custom policy fields */}
                {wizardTemplateId === 'custom' && (
                  <div style={{ marginTop: 16, padding: 16, backgroundColor: 'var(--z-bg-elevated)', borderRadius: 8 }}>
                    <h5 style={{ margin: '0 0 12px', color: 'var(--z-text)' }}>Custom Policy Settings</h5>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <SettingsField label="Policy name" htmlFor="custom-policy-name">
                        <SettingsInput
                          id="custom-policy-name"
                          type="text"
                          value={wizardCustomPolicy.name}
                          onChange={(e) => setWizardCustomPolicy({ ...wizardCustomPolicy, name: e.target.value })}
                        />
                      </SettingsField>
                      <SettingsField label="Max per trade (ALGO)" htmlFor="custom-max-trade">
                        <SettingsInput
                          id="custom-max-trade"
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={wizardCustomPolicy.maxPerTrade}
                          onChange={(e) => setWizardCustomPolicy({ ...wizardCustomPolicy, maxPerTrade: e.target.value })}
                        />
                      </SettingsField>
                      <SettingsField label="Daily cap (ALGO)" htmlFor="custom-daily-cap">
                        <SettingsInput
                          id="custom-daily-cap"
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={wizardCustomPolicy.dailyCap}
                          onChange={(e) => setWizardCustomPolicy({ ...wizardCustomPolicy, dailyCap: e.target.value })}
                        />
                      </SettingsField>
                      <SettingsField label="Daily executions" htmlFor="custom-daily-exec">
                        <SettingsInput
                          id="custom-daily-exec"
                          type="number"
                          min="1"
                          step="1"
                          value={wizardCustomPolicy.dailyExecutions}
                          onChange={(e) => setWizardCustomPolicy({ ...wizardCustomPolicy, dailyExecutions: e.target.value })}
                        />
                      </SettingsField>
                    </div>
                    <SettingsField label="Expiry (days from now)" htmlFor="custom-expiry-days" style={{ marginTop: 12 }}>
                      <SettingsInput
                        id="custom-expiry-days"
                        type="number"
                        min="1"
                        step="1"
                        value={wizardCustomPolicy.expiryDays}
                        onChange={(e) => setWizardCustomPolicy({ ...wizardCustomPolicy, expiryDays: e.target.value })}
                      />
                    </SettingsField>
                    
                    <div style={{ marginTop: 12 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                        <input
                          type="checkbox"
                          checked={saveCustomPolicyAsTemplate}
                          onChange={(e) => setSaveCustomPolicyAsTemplate(e.target.checked)}
                        />
                        Save this custom policy as a reusable template
                      </label>
                    </div>
                  </div>
                )}
                
                <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="z-btn z-btn-primary"
                    disabled={wizardBusy || !wizardTemplateId}
                    onClick={() => void handleWizardPolicy()}
                  >
                    {wizardBusy ? 'Registering...' : 'Register policy'}
                  </button>
                  <button
                    type="button"
                    className="z-btn z-btn-ghost"
                    onClick={() => setWizardStep('fund')}
                    disabled={wizardBusy}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="z-btn z-btn-ghost"
                    onClick={() => setWizardOpen(false)}
                    disabled={wizardBusy}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 'ready' && (
              <div>
                <p style={{ color: 'var(--z-success)', fontWeight: 600 }}>Agent is ready for automation.</p>
                <p className="st-muted" style={{ fontSize: '0.8125rem' }}>
                  Allowlist payment recipients in the Advanced section of each agent card before sending.
                </p>
                <button
                  type="button"
                  className="z-btn z-btn-primary"
                  style={{ marginTop: 16 }}
                  onClick={() => setWizardOpen(false)}
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Policy Editing Modal */}
      {editingPolicy && (
        <div className="agent-mgmt__wizard-backdrop" role="dialog" aria-modal="true" aria-label="Edit policy">
          <div className="agent-mgmt__wizard">
            <h3 style={{ margin: '0 0 8px', color: 'var(--z-text)' }}>Edit Policy</h3>
            <p className="st-muted" style={{ fontSize: '0.8125rem', marginBottom: 16 }}>
              Update spending limits and execution parameters.
            </p>
            
            <div style={{ padding: 16, backgroundColor: 'var(--z-bg-elevated)', borderRadius: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <SettingsField label="Policy name" htmlFor="edit-policy-name">
                  <SettingsInput
                    id="edit-policy-name"
                    type="text"
                    value={editPolicy.name}
                    onChange={(e) => setEditPolicy({ ...editPolicy, name: e.target.value })}
                  />
                </SettingsField>
                <SettingsField label="Max per trade (ALGO)" htmlFor="edit-max-trade">
                  <SettingsInput
                    id="edit-max-trade"
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={editPolicy.maxPerTrade}
                    onChange={(e) => setEditPolicy({ ...editPolicy, maxPerTrade: e.target.value })}
                  />
                </SettingsField>
                <SettingsField label="Daily cap (ALGO)" htmlFor="edit-daily-cap">
                  <SettingsInput
                    id="edit-daily-cap"
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={editPolicy.dailyCap}
                    onChange={(e) => setEditPolicy({ ...editPolicy, dailyCap: e.target.value })}
                  />
                </SettingsField>
                <SettingsField label="Daily executions" htmlFor="edit-daily-exec">
                  <SettingsInput
                    id="edit-daily-exec"
                    type="number"
                    min="1"
                    step="1"
                    value={editPolicy.dailyExecutions}
                    onChange={(e) => setEditPolicy({ ...editPolicy, dailyExecutions: e.target.value })}
                  />
                </SettingsField>
              </div>
              <SettingsField label="Expiry (days from now)" htmlFor="edit-expiry-days" style={{ marginTop: 12 }}>
                <SettingsInput
                  id="edit-expiry-days"
                  type="number"
                  min="1"
                  step="1"
                  value={editPolicy.expiryDays}
                  onChange={(e) => setEditPolicy({ ...editPolicy, expiryDays: e.target.value })}
                />
              </SettingsField>
            </div>
            
            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="z-btn z-btn-primary"
                onClick={async () => {
                  if (editingPolicy) {
                    const ok = await bootstrapPolicy(editingPolicy, null, editPolicy)
                    if (ok) {
                      setEditingPolicy(null)
                    }
                  }
                }}
              >
                Save changes
              </button>
              <button 
                type="button" 
                className="z-btn z-btn-ghost" 
                onClick={() => setEditingPolicy(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
