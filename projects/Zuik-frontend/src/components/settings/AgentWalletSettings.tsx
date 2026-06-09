import { useState, useEffect, useCallback } from 'react'
import { useWallet } from '@txnlab/use-wallet-react'
import { Link } from 'react-router-dom'
import { Plus, RefreshCw, Wallet } from 'lucide-react'
import {
  createAgentWallet,
  fundAgentWallet,
  listAgentWallets,
  fetchAgentBalance,
  updateAgentWallet,
  deleteAgentWallet,
  getAgentLabel,
  setAgentLabel,
  type AgentWalletRow,
  type AgentWalletBalance,
} from '../../services/agentWallet'
import { algoToMicroAlgos } from '../../services/guardianContract'
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
import { IconEdit, IconTrash } from './SettingsIcons'
import { accountExplorerUrl } from './settingsExplorer'
import './AgentWalletSettings.css'

interface AgentWithBalance extends AgentWalletRow {
  balance?: AgentWalletBalance
  label: string
}

function defaultAgentTitle(row: AgentWalletRow, index: number): string {
  const custom = getAgentLabel(row.agent_address)
  if (custom) return custom
  if (row.workflow_id) return `Workflow agent`
  return `Agent ${index + 1}`
}

function formatAlgo(amount: number): string {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

function statusVariant(status: string): 'success' | 'warning' | 'error' | 'neutral' {
  if (status === 'active') return 'success'
  if (status === 'inactive') return 'warning'
  if (status === 'archived') return 'neutral'
  return 'neutral'
}

export function AgentWalletSettings() {
  const { activeAccount, activeAddress, transactionSigner } = useWallet()
  const network = import.meta.env.VITE_ALGOD_NETWORK || 'testnet'
  const guardianAppId = parseInt(import.meta.env.VITE_GUARDIAN_APP_ID || '0', 10)

  const [agents, setAgents] = useState<AgentWithBalance[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [fundTarget, setFundTarget] = useState<string | null>(null)
  const [fundAmountAlgo, setFundAmountAlgo] = useState('2')
  const [funding, setFunding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editBudgetAlgo, setEditBudgetAlgo] = useState('')

  const showMessage = useCallback((type: 'success' | 'error' | 'info', text: string) => {
    setFeedback({ type, text })
  }, [])

  const loadAgents = useCallback(async () => {
    if (!activeAddress) return
    setLoading(true)
    try {
      const rows = await listAgentWallets(activeAddress)
      const visible = rows.filter((r) => r.status !== 'archived')
      const withBalances: AgentWithBalance[] = await Promise.all(
        visible.map(async (row, i) => {
          let balance: AgentWalletBalance | undefined
          try {
            balance = await fetchAgentBalance(row.agent_address)
          } catch {
            balance = undefined
          }
          return {
            ...row,
            balance,
            label: defaultAgentTitle(row, i),
          }
        }),
      )
      setAgents(withBalances)
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Could not load agent wallets.')
    } finally {
      setLoading(false)
    }
  }, [activeAddress, showMessage])

  useEffect(() => {
    void loadAgents()
  }, [loadAgents])

  const totalBalance = agents.reduce((sum, a) => sum + (a.balance?.balance ?? 0), 0)
  const activeCount = agents.filter((a) => a.status === 'active').length

  const handleCreate = async () => {
    if (!activeAddress) {
      showMessage('info', 'Connect your wallet first.')
      return
    }
    setCreating(true)
    setFeedback(null)
    try {
      const workflowId = crypto.randomUUID()
      await createAgentWallet(workflowId, activeAddress, {
        guardianAppId: guardianAppId || undefined,
      })
      showMessage('success', 'Agent wallet created. Fund it and register Guardian policy before autonomous runs.')
      await loadAgents()
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Could not create agent wallet.')
    } finally {
      setCreating(false)
    }
  }

  const handleFund = async (agentAddress: string) => {
    if (!activeAddress || !transactionSigner) return
    const amount = parseFloat(fundAmountAlgo)
    if (!Number.isFinite(amount) || amount <= 0) {
      showMessage('error', 'Enter a valid funding amount in ALGO.')
      return
    }
    setFunding(true)
    setFeedback(null)
    try {
      const res = await fundAgentWallet({
        ownerAddress: activeAddress,
        agentAddress,
        amountMicroAlgos: algoToMicroAlgos(amount),
        signer: transactionSigner,
        note: 'Zuik agent funding',
      })
      showMessage('success', `Funded with ${amount} ALGO. Tx: ${res.txId.slice(0, 12)}...`)
      setFundTarget(null)
      
      // 🔧 FIX: Refresh agent balances after successful funding
      setTimeout(() => {
        void loadAgents()
      }, 3000) // Wait 3s for transaction to propagate on TestNet
      await loadAgents()
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Funding failed.')
    } finally {
      setFunding(false)
    }
  }

  const handleToggle = async (row: AgentWithBalance, enabled: boolean) => {
    if (!activeAddress) return
    const next = enabled ? 'active' : 'inactive'
    try {
      await updateAgentWallet(activeAddress, row.agent_address, { status: next })
      await loadAgents()
      showMessage('success', enabled ? 'Agent enabled for automation.' : 'Agent paused.')
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Could not update status.')
    }
  }

  const handleDelete = async (row: AgentWithBalance) => {
    if (!activeAddress) return
    const ok = window.confirm(
      `Archive agent ${row.agent_address.slice(0, 8)}...? This removes the server signing key. You can create a new agent later.`,
    )
    if (!ok) return
    try {
      await deleteAgentWallet(activeAddress, row.agent_address)
      showMessage('success', 'Agent archived.')
      await loadAgents()
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Could not delete agent.')
    }
  }

  const startEdit = (row: AgentWithBalance) => {
    setEditingId(row.id)
    setEditLabel(getAgentLabel(row.agent_address) ?? '')
    setEditBudgetAlgo(
      row.budget_microalgos != null ? String(Number(row.budget_microalgos) / 1_000_000) : '',
    )
  }

  const saveEdit = async (row: AgentWithBalance) => {
    if (!activeAddress) return
    setAgentLabel(row.agent_address, editLabel)
    try {
      if (editBudgetAlgo.trim()) {
        const algo = parseFloat(editBudgetAlgo)
        if (!Number.isFinite(algo) || algo < 0) {
          showMessage('error', 'Budget must be a valid ALGO amount.')
          return
        }
        await updateAgentWallet(activeAddress, row.agent_address, {
          budgetMicroAlgos: algoToMicroAlgos(algo),
        })
      }
      setEditingId(null)
      await loadAgents()
      showMessage('success', 'Agent updated.')
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Could not save changes.')
    }
  }

  if (!activeAccount) {
    return (
      <section className="st-section st-section--wide agent-settings" data-testid="agent-wallet-settings">
        <SettingsPanelHeader
          title="Agent wallets"
          subtitle="Dedicated sub-accounts that run your workflows within Guardian limits."
        />
        <SettingsCard>
          <p className="st-muted st-center">Connect your wallet to manage agent wallets.</p>
        </SettingsCard>
      </section>
    )
  }

  return (
    <section className="st-section st-section--wide agent-settings" data-testid="agent-wallet-settings">
      <div className="agent-settings__top">
        <SettingsPanelHeader
          title="Agent wallets"
          subtitle="Create funded sub-accounts for 24/7 automation. Toggle, fund, and link each agent to Guardian policies."
        />
        <div className="agent-settings__toolbar">
          <button
            type="button"
            className="z-btn z-btn-ghost z-btn-sm"
            onClick={() => void loadAgents()}
            disabled={loading}
            aria-label="Refresh agents"
          >
            <RefreshCw size={16} className={loading ? 'agent-settings__spin' : ''} />
            Refresh
          </button>
          <button
            type="button"
            className="z-btn z-btn-primary"
            onClick={() => void handleCreate()}
            disabled={creating}
            data-testid="create-agent-wallet"
          >
            <Plus size={16} />
            {creating ? 'Creating...' : 'New agent'}
          </button>
        </div>
      </div>

      <HelpCard title="One-time funding model">
        You sign once to fund each agent wallet. The Zuik server holds the agent key securely and signs
        transactions only within Guardian limits you set on-chain.
      </HelpCard>

      <div className="agent-settings__stats">
        <div className="agent-settings__stat">
          <Wallet size={18} aria-hidden />
          <div>
            <span className="agent-settings__stat-label">Total balance</span>
            <span className="agent-settings__stat-value">{formatAlgo(totalBalance)} ALGO</span>
          </div>
        </div>
        <div className="agent-settings__stat">
          <span className="agent-settings__stat-label">Agents</span>
          <span className="agent-settings__stat-value">{agents.length}</span>
        </div>
        <div className="agent-settings__stat">
          <span className="agent-settings__stat-label">Active</span>
          <span className="agent-settings__stat-value">{activeCount}</span>
        </div>
      </div>

      {loading && agents.length === 0 && <LoadingBlock label="Loading agents..." />}

      {!loading && agents.length === 0 && (
        <SettingsCard className="agent-settings__empty">
          <p className="st-muted">No agent wallets yet. Create one to enable autonomous workflow execution.</p>
          <button type="button" className="z-btn z-btn-primary" onClick={() => void handleCreate()} disabled={creating}>
            <Plus size={16} />
            Create your first agent
          </button>
        </SettingsCard>
      )}

      <div className="agent-settings__list">
        {agents.map((row) => {
          const explorerUrl = accountExplorerUrl(network, row.agent_address)
          const isEditing = editingId === row.id
          const isFunding = fundTarget === row.agent_address

          return (
            <article key={row.id} className="agent-settings__card" data-testid={`agent-card-${row.id}`}>
              <div className="agent-settings__card-head">
                <div className="agent-settings__card-title-row">
                  <h4 className="agent-settings__card-title">{row.label}</h4>
                  <StatusBadge variant={statusVariant(row.status)}>{row.status}</StatusBadge>
                  {!row.balance?.hasKey && row.status === 'active' && (
                    <StatusBadge variant="warning">No server key</StatusBadge>
                  )}
                </div>
                <AddressDisplay address={row.agent_address} explorerUrl={explorerUrl} />
              </div>

              <div className="agent-settings__card-metrics">
                <div className="agent-settings__metric">
                  <span className="agent-settings__metric-label">Balance</span>
                  <span className="agent-settings__metric-value">
                    {row.balance != null ? `${formatAlgo(row.balance.balance)} ALGO` : '-'}
                  </span>
                  {row.balance != null && (
                    <span className="agent-settings__metric-sub">
                      {formatAlgo(row.balance.available)} available
                    </span>
                  )}
                </div>
                <div className="agent-settings__metric">
                  <span className="agent-settings__metric-label">Budget (planned)</span>
                  <span className="agent-settings__metric-value">
                    {row.budget_microalgos != null
                      ? `${formatAlgo(Number(row.budget_microalgos) / 1_000_000)} ALGO`
                      : 'Not set'}
                  </span>
                </div>
                <div className="agent-settings__metric">
                  <span className="agent-settings__metric-label">Created</span>
                  <span className="agent-settings__metric-value agent-settings__metric-value--sm">
                    {new Date(row.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {isEditing ? (
                <div className="agent-settings__edit">
                  <SettingsField label="Display name" htmlFor={`label-${row.id}`}>
                    <SettingsInput
                      id={`label-${row.id}`}
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      placeholder="e.g. Trading bot"
                    />
                  </SettingsField>
                  <SettingsField label="Planned budget (ALGO)" htmlFor={`budget-${row.id}`}>
                    <SettingsInput
                      id={`budget-${row.id}`}
                      type="number"
                      min="0"
                      step="0.1"
                      value={editBudgetAlgo}
                      onChange={(e) => setEditBudgetAlgo(e.target.value)}
                      placeholder="Optional metadata"
                    />
                  </SettingsField>
                  <div className="agent-settings__edit-actions">
                    <button type="button" className="z-btn z-btn-primary z-btn-sm" onClick={() => void saveEdit(row)}>
                      Save
                    </button>
                    <button type="button" className="z-btn z-btn-ghost z-btn-sm" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="agent-settings__card-actions">
                  <ToggleSwitch
                    id={`toggle-${row.id}`}
                    checked={row.status === 'active'}
                    onChange={(v) => void handleToggle(row, v)}
                    showLabels={true}
                    onLabel="ACTIVE"
                    offLabel="INACTIVE"
                    testId={`agent-toggle-${row.id}`}
                  />
                  <div className="agent-settings__card-buttons">
                    <button
                      type="button"
                      className="z-btn z-btn-ghost z-btn-sm"
                      onClick={() => {
                        setFundTarget(isFunding ? null : row.agent_address)
                        setFundAmountAlgo('2')
                      }}
                    >
                      Fund
                    </button>
                    <button type="button" className="st-icon-btn" onClick={() => startEdit(row)} aria-label="Edit agent">
                      <IconEdit />
                    </button>
                    <button
                      type="button"
                      className="st-icon-btn st-btn-icon--danger"
                      onClick={() => void handleDelete(row)}
                      aria-label="Delete agent"
                    >
                      <IconTrash />
                    </button>
                    <Link
                      to={`/settings?section=guardian`}
                      className="z-btn z-btn-ghost z-btn-sm"
                      onClick={() => {
                        try {
                          sessionStorage.setItem('zuik_guardian_agent', row.agent_address)
                        } catch {
                          /* ignore */
                        }
                      }}
                    >
                      Guardian
                    </Link>
                  </div>
                </div>
              )}

              {isFunding && (
                <div className="agent-settings__fund">
                  <SettingsField label="Amount (ALGO)" htmlFor={`fund-${row.id}`}>
                    <div className="agent-settings__fund-row">
                      <SettingsInput
                        id={`fund-${row.id}`}
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
                        onClick={() => void handleFund(row.agent_address)}
                        data-testid="fund-agent-wallet"
                      >
                        {funding ? 'Sending...' : 'Send ALGO'}
                      </button>
                    </div>
                  </SettingsField>
                </div>
              )}
            </article>
          )
        })}
      </div>

      {feedback && <FeedbackMessage variant={feedback.type}>{feedback.text}</FeedbackMessage>}
    </section>
  )
}
