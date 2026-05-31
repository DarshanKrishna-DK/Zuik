import { useState, useEffect, useCallback } from 'react'
import { useWallet } from '@txnlab/use-wallet-react'
import { useSnackbar } from 'notistack'
import { formatAlgoAmount, formatAddress } from '../../lib/format'
import { deactivateLogicSigVault } from '../../services/logicSigDelegation'
import { agentWalletApi, type EnhancedAgentWallet } from '../../services/agentWalletApi'
import { IconCopy, IconExternalLink } from './SettingsIcons'
import { PanelSection, InfoBox, LoadingSpinner } from './SettingsPrimitives'
import './Settings.css'

export function AgentWalletSettings() {
  const { activeAddress } = useWallet()
  const { enqueueSnackbar } = useSnackbar()
  const [wallets, setWallets] = useState<EnhancedAgentWallet[]>([])
  const [loading, setLoading] = useState(true)
  const [showDetails, setShowDetails] = useState<Record<string, boolean>>({})

  const loadWallets = useCallback(async () => {
    if (!activeAddress) return

    setLoading(true)
    try {
      const enhancedWallets = await agentWalletApi.getWallets(activeAddress)
      setWallets(enhancedWallets)
    } catch (error) {
      console.error('Failed to load agent wallets:', error)
      enqueueSnackbar('Failed to load delegation status', { variant: 'error' })
    } finally {
      setLoading(false)
    }
  }, [activeAddress, enqueueSnackbar])

  const deactivateWallet = useCallback(async (vault: EnhancedAgentWallet) => {
    try {
      await deactivateLogicSigVault(vault.id)
      enqueueSnackbar('Delegation deactivated', { variant: 'success' })
      await loadWallets()
    } catch (error) {
      console.error('Deactivation failed:', error)
      enqueueSnackbar('Failed to deactivate delegation', { variant: 'error' })
    }
  }, [loadWallets, enqueueSnackbar])

  const copyAddress = useCallback((address: string) => {
    navigator.clipboard.writeText(address)
    enqueueSnackbar('Address copied to clipboard', { variant: 'success' })
  }, [enqueueSnackbar])

  const openExplorer = useCallback((address: string) => {
    const network = import.meta.env.VITE_ALGOD_NETWORK || 'testnet'
    const baseUrl = network === 'mainnet'
      ? 'https://allo.info/account/'
      : 'https://testnet.allo.info/account/'
    window.open(baseUrl + address, '_blank')
  }, [])

  useEffect(() => {
    loadWallets()
  }, [loadWallets])

  if (!activeAddress) {
    return (
      <div className="st-panel-content">
        <PanelSection
          title="Agent Delegation"
          description="View automated spending permissions for your wallet"
        >
          <InfoBox type="warning">
            Please connect your wallet to view delegation status.
          </InfoBox>
        </PanelSection>
      </div>
    )
  }

  return (
    <div className="st-panel-content">
      <PanelSection
        title="Agent Delegation"
        description="Workflows spend directly from your wallet using a one-time LogicSig delegation. No separate agent address funding is required."
      >
        <InfoBox type="info">
          Funds remain in your connected wallet. Zuik only signs transactions that match the limits you approved.
        </InfoBox>

        {loading ? (
          <div className="st-loading-state">
            <LoadingSpinner />
            <p>Loading delegation status...</p>
          </div>
        ) : wallets.length === 0 ? (
          <InfoBox type="neutral">
            No active delegation found. Create automation permissions in Automation settings.
          </InfoBox>
        ) : (
          <div className="st-wallet-list">
            {wallets.map((vault) => (
              <div key={vault.id} className="st-wallet-card">
                <div className="st-wallet-header">
                  <div className="st-wallet-info">
                    <div className="st-wallet-title">
                      <h4>Delegated Wallet</h4>
                      <span className={`st-wallet-status ${vault.is_active ? 'active' : 'inactive'}`}>
                        {vault.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="st-wallet-address">
                      <span>{formatAddress(vault.wallet_address)}</span>
                      <button
                        type="button"
                        onClick={() => copyAddress(vault.wallet_address)}
                        className="st-icon-btn"
                        title="Copy address"
                      >
                        <IconCopy />
                      </button>
                      <button
                        type="button"
                        onClick={() => openExplorer(vault.wallet_address)}
                        className="st-icon-btn"
                        title="View on explorer"
                      >
                        <IconExternalLink />
                      </button>
                    </div>
                  </div>

                  <div className="st-wallet-balance">
                    <div className="st-balance-main">
                      {vault.balance ? formatAlgoAmount(vault.balance.balance) : '...'} ALGO
                    </div>
                    <div className="st-balance-sub">
                      Available: {vault.balance ? formatAlgoAmount(vault.balance.available) : '...'} ALGO
                    </div>
                  </div>
                </div>

                <div className="st-wallet-limits">
                  <div className="st-limit-item">
                    <span>Max per trade:</span>
                    <span>{formatAlgoAmount(Number(vault.max_per_trade) / 1_000_000)} ALGO</span>
                  </div>
                  <div className="st-limit-item">
                    <span>Daily cap:</span>
                    <span>{formatAlgoAmount(Number(vault.daily_cap) / 1_000_000)} ALGO</span>
                  </div>
                  <div className="st-limit-item">
                    <span>Asset:</span>
                    <span>{vault.allowed_from_asset === '0' ? 'ALGO' : `ASA ${vault.allowed_from_asset}`}</span>
                  </div>
                </div>

                <div className="st-wallet-controls">
                  <button
                    type="button"
                    onClick={() => setShowDetails((prev) => ({ ...prev, [vault.id]: !prev[vault.id] }))}
                    className="st-btn st-btn-secondary"
                  >
                    {showDetails[vault.id] ? 'Hide Details' : 'Show Details'}
                  </button>

                  {vault.is_active && (
                    <button
                      type="button"
                      onClick={() => deactivateWallet(vault)}
                      className="st-btn st-btn-danger"
                    >
                      Deactivate
                    </button>
                  )}
                </div>

                {showDetails[vault.id] && (
                  <div className="st-wallet-details">
                    <div className="st-stats-grid">
                      <div className="st-stat-item">
                        <label>Total spent (tracked)</label>
                        <span>{formatAlgoAmount(vault.stats?.totalSpent || 0)} ALGO</span>
                      </div>
                      <div className="st-stat-item">
                        <label>Transactions</label>
                        <span>{vault.stats?.transactionCount || 0}</span>
                      </div>
                      <div className="st-stat-item">
                        <label>Expires at round</label>
                        <span>{vault.expiry_round}</span>
                      </div>
                    </div>

                    {vault.recentActivity && vault.recentActivity.length > 0 && (
                      <div className="st-activity-section">
                        <h5>Recent Activity</h5>
                        <div className="st-activity-list">
                          {vault.recentActivity.map((activity, index) => (
                            <div key={index} className="st-activity-item">
                              <div className="st-activity-info">
                                <span className="st-activity-type">{activity.type}</span>
                                <span className="st-activity-amount">
                                  {formatAlgoAmount(activity.amount)} ALGO
                                </span>
                              </div>
                              <div className="st-activity-meta">
                                <span className={`st-activity-status ${activity.status}`}>
                                  {activity.status}
                                </span>
                                <span className="st-activity-time">
                                  {new Date(activity.timestamp).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="st-actions">
          <button
            type="button"
            onClick={loadWallets}
            className="st-btn st-btn-secondary"
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </PanelSection>
    </div>
  )
}
