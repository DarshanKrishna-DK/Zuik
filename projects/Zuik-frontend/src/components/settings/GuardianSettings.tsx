import React, { useState, useEffect } from 'react'
import { useWallet } from '@txnlab/use-wallet-react'
import { guardianContract, AgentStatus, GlobalMetrics, GuardianPolicy } from '../../services/guardianContract'
import './GuardianSettings.css'

interface GuardianSettingsProps {
  className?: string
}

export const GuardianSettings: React.FC<GuardianSettingsProps> = ({ className = '' }) => {
  const { activeAccount } = useWallet()
  const [loading, setLoading] = useState(false)
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null)
  const [globalMetrics, setGlobalMetrics] = useState<GlobalMetrics | null>(null)
  const [isPaused, setIsPaused] = useState(false)

  // Deployment info from environment
  const guardianAppId = import.meta.env.VITE_GUARDIAN_APP_ID || '0'
  const guardianAppAddress = import.meta.env.VITE_GUARDIAN_APP_ADDRESS || ''
  const network = import.meta.env.VITE_ALGOD_NETWORK || 'localnet'
  
  // Agent registration form
  const [registrationForm, setRegistrationForm] = useState({
    agentAddress: '',
    dailyCap: '100000000', // 100 ALGO in microAlgos
    allowedAssets: '0,31566704', // ALGO and USDC
    allowedMethods: 'swap(uint64,uint64,account)void,transfer(account,uint64)void'
  })
  
  // Policy update form
  const [policyForm, setPolicyForm] = useState({
    agentAddress: '',
    newDailyCap: '100000000',
    newAllowedAssets: '0,31566704',
    newAllowedMethods: 'swap(uint64,uint64,account)void,transfer(account,uint64)void'
  })

  useEffect(() => {
    if (activeAccount) {
      loadGuardianData()
    }
  }, [activeAccount])

  const loadGuardianData = async () => {
    if (!activeAccount) return
    
    setLoading(true)
    try {
      // Load global metrics
      const metrics = await guardianContract.getGlobalMetrics()
      setGlobalMetrics(metrics)
      setIsPaused(metrics?.isPaused || false)
      
      // Load agent status if agent address is provided
      if (registrationForm.agentAddress) {
        const status = await guardianContract.getAgentStatus(registrationForm.agentAddress)
        setAgentStatus(status)
      }
    } catch (error) {
      console.error('Failed to load Guardian data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRegisterAgent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeAccount) return
    
    setLoading(true)
    try {
      const policy: GuardianPolicy = {
        dailyCap: parseInt(registrationForm.dailyCap),
        allowedAssets: registrationForm.allowedAssets.split(',').map(id => parseInt(id.trim())),
        allowedMethods: registrationForm.allowedMethods.split(',').map(method => method.trim())
      }
      
      const txId = await guardianContract.registerAgent(
        activeAccount,
        registrationForm.agentAddress,
        policy
      )
      
      alert(`Agent registered successfully! Transaction ID: ${txId}`)
      await loadGuardianData()
    } catch (error) {
      console.error('Failed to register agent:', error)
      alert('Failed to register agent. Please check the console for details.')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdatePolicy = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeAccount) return
    
    setLoading(true)
    try {
      const newPolicy: GuardianPolicy = {
        dailyCap: parseInt(policyForm.newDailyCap),
        allowedAssets: policyForm.newAllowedAssets.split(',').map(id => parseInt(id.trim())),
        allowedMethods: policyForm.newAllowedMethods.split(',').map(method => method.trim())
      }
      
      const txId = await guardianContract.updateAgentPolicy(
        activeAccount,
        policyForm.agentAddress,
        newPolicy
      )
      
      alert(`Agent policy updated successfully! Transaction ID: ${txId}`)
      await loadGuardianData()
    } catch (error) {
      console.error('Failed to update agent policy:', error)
      alert('Failed to update agent policy. Please check the console for details.')
    } finally {
      setLoading(false)
    }
  }

  const handleTogglePause = async () => {
    if (!activeAccount) return
    
    setLoading(true)
    try {
      const newPausedState = !isPaused
      const txId = await guardianContract.setPaused(activeAccount, newPausedState)
      
      setIsPaused(newPausedState)
      alert(`Guardian ${newPausedState ? 'paused' : 'unpaused'} successfully! Transaction ID: ${txId}`)
    } catch (error) {
      console.error('Failed to toggle pause:', error)
      alert('Failed to toggle pause state. You might not be the owner.')
    } finally {
      setLoading(false)
    }
  }

  const handleCheckAgentStatus = async () => {
    if (!registrationForm.agentAddress) return
    
    setLoading(true)
    try {
      const status = await guardianContract.getAgentStatus(registrationForm.agentAddress)
      setAgentStatus(status)
    } catch (error) {
      console.error('Failed to check agent status:', error)
    } finally {
      setLoading(false)
    }
  }

  if (!activeAccount) {
    return (
      <div className={`guardian-settings ${className}`}>
        <div className="guardian-settings__not-connected">
          <h3>🛡️ Guardian Smart Contract</h3>
          <p>Please connect your wallet to manage AI agent governance.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`guardian-settings ${className}`}>
      <div className="guardian-settings__header">
        <h3>🛡️ Guardian Smart Contract</h3>
        <p>AI Agent Governance & Security Controls</p>
        
        {/* Deployment Information */}
        <div className="guardian-settings__deployment">
          <div className="deployment-info">
            <span className="deployment-label">App ID:</span>
            <span className="deployment-value" title={`Guardian Smart Contract ID on ${network}`}>{guardianAppId}</span>
          </div>
          <div className="deployment-info">
            <span className="deployment-label">Contract Address:</span>
            <span className="deployment-value" title={guardianAppAddress}>
              {guardianAppAddress ? `${guardianAppAddress.slice(0, 8)}...${guardianAppAddress.slice(-8)}` : 'Not deployed'}
            </span>
          </div>
          <div className="deployment-info">
            <span className="deployment-label">Network:</span>
            <span className="deployment-value network-badge">{network}</span>
          </div>
        </div>
        
        {globalMetrics && (
          <div className="guardian-settings__metrics">
            <div className="metrics-grid">
              <div className="metric-card">
                <span className="metric-label">Total Transactions</span>
                <span className="metric-value">{globalMetrics.totalTransactions.toLocaleString()}</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">Total Volume</span>
                <span className="metric-value">{(globalMetrics.totalVolume / 1_000_000).toFixed(2)} ALGO</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">Status</span>
                <span className={`metric-value status ${isPaused ? 'paused' : 'active'}`}>
                  {isPaused ? '⏸️ Paused' : '✅ Active'}
                </span>
              </div>
            </div>
            
            <button 
              onClick={handleTogglePause}
              className={`guardian-settings__pause-btn ${isPaused ? 'unpause' : 'pause'}`}
              disabled={loading}
            >
              {isPaused ? '▶️ Resume Guardian' : '⏸️ Emergency Pause'}
            </button>
          </div>
        )}
      </div>

      <div className="guardian-settings__content">
        {/* Agent Registration Form */}
        <div className="guardian-settings__section">
          <h4>Register AI Agent</h4>
          <form onSubmit={handleRegisterAgent} className="guardian-form">
            <div className="form-group">
              <label htmlFor="agentAddress">Agent Address</label>
              <input
                type="text"
                id="agentAddress"
                value={registrationForm.agentAddress}
                onChange={(e) => setRegistrationForm(prev => ({ ...prev, agentAddress: e.target.value }))}
                placeholder="Agent's Algorand address"
                required
              />
              <button 
                type="button" 
                onClick={handleCheckAgentStatus}
                className="check-status-btn"
                disabled={loading || !registrationForm.agentAddress}
              >
                Check Status
              </button>
            </div>

            <div className="form-group">
              <label htmlFor="dailyCap">Daily Spending Cap (microAlgos)</label>
              <input
                type="number"
                id="dailyCap"
                value={registrationForm.dailyCap}
                onChange={(e) => setRegistrationForm(prev => ({ ...prev, dailyCap: e.target.value }))}
                placeholder="100000000"
                required
              />
              <small>1 ALGO = 1,000,000 microAlgos</small>
            </div>

            <div className="form-group">
              <label htmlFor="allowedAssets">Allowed Assets (Asset IDs)</label>
              <input
                type="text"
                id="allowedAssets"
                value={registrationForm.allowedAssets}
                onChange={(e) => setRegistrationForm(prev => ({ ...prev, allowedAssets: e.target.value }))}
                placeholder="0,31566704"
                required
              />
              <small>Comma-separated asset IDs (0 = ALGO, 31566704 = USDC)</small>
            </div>

            <div className="form-group">
              <label htmlFor="allowedMethods">Allowed Methods</label>
              <textarea
                id="allowedMethods"
                value={registrationForm.allowedMethods}
                onChange={(e) => setRegistrationForm(prev => ({ ...prev, allowedMethods: e.target.value }))}
                placeholder="swap(uint64,uint64,account)void,transfer(account,uint64)void"
                rows={3}
                required
              />
              <small>Comma-separated ABI method signatures</small>
            </div>

            <button type="submit" disabled={loading} className="guardian-form__submit">
              {loading ? 'Registering...' : 'Register Agent'}
            </button>
          </form>
        </div>

        {/* Agent Status Display */}
        {agentStatus && (
          <div className="guardian-settings__section">
            <h4>Agent Status</h4>
            <div className="agent-status">
              <div className="status-grid">
                <div className="status-item">
                  <span className="status-label">Active</span>
                  <span className={`status-value ${agentStatus.isActive ? 'active' : 'inactive'}`}>
                    {agentStatus.isActive ? '✅ Yes' : '❌ No'}
                  </span>
                </div>
                <div className="status-item">
                  <span className="status-label">Daily Cap</span>
                  <span className="status-value">{(agentStatus.dailySpendingCap / 1_000_000).toFixed(2)} ALGO</span>
                </div>
                <div className="status-item">
                  <span className="status-label">Spent Today</span>
                  <span className="status-value">{(agentStatus.dailySpentAmount / 1_000_000).toFixed(2)} ALGO</span>
                </div>
                <div className="status-item">
                  <span className="status-label">Transactions</span>
                  <span className="status-value">{agentStatus.transactionCount}</span>
                </div>
                <div className="status-item">
                  <span className="status-label">Risk Score</span>
                  <span className={`status-value risk-score ${agentStatus.riskScore >= 100 ? 'high' : agentStatus.riskScore >= 50 ? 'medium' : 'low'}`}>
                    {agentStatus.riskScore}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Policy Update Form */}
        <div className="guardian-settings__section">
          <h4>Update Agent Policy</h4>
          <form onSubmit={handleUpdatePolicy} className="guardian-form">
            <div className="form-group">
              <label htmlFor="policyAgentAddress">Agent Address</label>
              <input
                type="text"
                id="policyAgentAddress"
                value={policyForm.agentAddress}
                onChange={(e) => setPolicyForm(prev => ({ ...prev, agentAddress: e.target.value }))}
                placeholder="Agent's Algorand address"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="newDailyCap">New Daily Cap (microAlgos)</label>
              <input
                type="number"
                id="newDailyCap"
                value={policyForm.newDailyCap}
                onChange={(e) => setPolicyForm(prev => ({ ...prev, newDailyCap: e.target.value }))}
                placeholder="100000000"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="newAllowedAssets">New Allowed Assets</label>
              <input
                type="text"
                id="newAllowedAssets"
                value={policyForm.newAllowedAssets}
                onChange={(e) => setPolicyForm(prev => ({ ...prev, newAllowedAssets: e.target.value }))}
                placeholder="0,31566704"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="newAllowedMethods">New Allowed Methods</label>
              <textarea
                id="newAllowedMethods"
                value={policyForm.newAllowedMethods}
                onChange={(e) => setPolicyForm(prev => ({ ...prev, newAllowedMethods: e.target.value }))}
                placeholder="swap(uint64,uint64,account)void,transfer(account,uint64)void"
                rows={3}
                required
              />
            </div>

            <button type="submit" disabled={loading} className="guardian-form__submit update">
              {loading ? 'Updating...' : 'Update Policy'}
            </button>
          </form>
        </div>
      </div>

      <div className="guardian-settings__info">
        <h4>About Guardian Smart Contract</h4>
        <ul>
          <li>🛡️ <strong>Policy-driven controls:</strong> Define what AI agents can and cannot do</li>
          <li>💰 <strong>Spending limits:</strong> Daily caps and asset restrictions</li>
          <li>📊 <strong>Risk monitoring:</strong> Automatic risk scoring and agent deactivation</li>
          <li>📝 <strong>Audit trail:</strong> All agent actions logged on-chain</li>
          <li>⚡ <strong>Real-time enforcement:</strong> Pre-execution authorization checks</li>
          <li>🚨 <strong>Emergency controls:</strong> Owner can pause all agent activity</li>
        </ul>
      </div>
    </div>
  )
}