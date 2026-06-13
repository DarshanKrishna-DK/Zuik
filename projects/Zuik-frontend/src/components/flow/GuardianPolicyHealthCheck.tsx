import { useState } from 'react'
import { useWallet } from '@txnlab/use-wallet-react'
import { testGuardianPolicyStatus } from '../../utils/testGuardianPolicy'
import { guardianContract } from '../../services/guardianContract'
import { getAgentWallet } from '../../services/agentWallet'

interface GuardianPolicyHealthCheckProps {
  workflowId: string | null
  isOpen: boolean
  onClose: () => void
}

interface HealthCheckResult {
  step: string
  status: 'pending' | 'success' | 'warning' | 'error'
  message: string
  action?: string
}

export default function GuardianPolicyHealthCheck({ workflowId, isOpen, onClose }: GuardianPolicyHealthCheckProps) {
  const { activeAddress } = useWallet()
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<HealthCheckResult[]>([])

  const runHealthCheck = async () => {
    if (!activeAddress || !workflowId) return

    setRunning(true)
    const checkResults: HealthCheckResult[] = []

    // Step 1: Environment check
    checkResults.push({
      step: '1. Environment Configuration',
      status: 'pending',
      message: 'Checking environment variables...'
    })
    setResults([...checkResults])

    const guardianAppId = import.meta.env.VITE_GUARDIAN_APP_ID
    if (!guardianAppId || parseInt(guardianAppId) === 0) {
      checkResults[0] = {
        step: '1. Environment Configuration',
        status: 'error',
        message: 'VITE_GUARDIAN_APP_ID not configured',
        action: 'Add VITE_GUARDIAN_APP_ID=764398655 to your .env.local file and restart dev server'
      }
      setResults([...checkResults])
      setRunning(false)
      return
    }

    checkResults[0] = {
      step: '1. Environment Configuration',
      status: 'success',
      message: `Guardian App ID: ${guardianAppId}`
    }
    setResults([...checkResults])

    // Step 2: Agent wallet check
    checkResults.push({
      step: '2. Agent Wallet',
      status: 'pending',
      message: 'Checking agent wallet...'
    })
    setResults([...checkResults])

    try {
      const agentWallet = await getAgentWallet(workflowId)
      if (!agentWallet) {
        checkResults[1] = {
          step: '2. Agent Wallet',
          status: 'error',
          message: 'No agent wallet found for this workflow',
          action: 'Create an agent wallet in Settings → Agent Management'
        }
        setResults([...checkResults])
        setRunning(false)
        return
      }

      checkResults[1] = {
        step: '2. Agent Wallet',
        status: 'success',
        message: `Agent: ${agentWallet.agent_address.slice(0, 12)}...`
      }
      setResults([...checkResults])

      // Step 3: Contract deployment check
      checkResults.push({
        step: '3. Guardian Contract',
        status: 'pending',
        message: 'Checking contract deployment...'
      })
      setResults([...checkResults])

      const contractInfo = await guardianContract.getContractInfo()
      if (!contractInfo.isDeployed) {
        checkResults[2] = {
          step: '3. Guardian Contract',
          status: 'error',
          message: 'Guardian contract not deployed',
          action: 'Contact support - Guardian contract deployment issue'
        }
        setResults([...checkResults])
        setRunning(false)
        return
      }

      checkResults[2] = {
        step: '3. Guardian Contract',
        status: 'success',
        message: `Contract deployed at ${contractInfo.appAddress.slice(0, 12)}...`
      }
      setResults([...checkResults])

      // Step 4: Pause status check
      checkResults.push({
        step: '4. Guardian Status',
        status: 'pending',
        message: 'Checking if Guardian is paused...'
      })
      setResults([...checkResults])

      const isPaused = await guardianContract.isPaused(activeAddress)
      if (isPaused) {
        checkResults[3] = {
          step: '4. Guardian Status',
          status: 'warning',
          message: 'Guardian is paused (emergency stop active)',
          action: 'Resume Guardian in Settings → Agent Management'
        }
      } else {
        checkResults[3] = {
          step: '4. Guardian Status',
          status: 'success',
          message: 'Guardian is active'
        }
      }
      setResults([...checkResults])

      // Step 5: Policy check
      checkResults.push({
        step: '5. Guardian Policy',
        status: 'pending',
        message: 'Checking on-chain policy...'
      })
      setResults([...checkResults])

      const policy = await guardianContract.getPolicy(agentWallet.agent_address, activeAddress)
      if (!policy) {
        checkResults[4] = {
          step: '5. Guardian Policy',
          status: 'error',
          message: 'No Guardian policy found on-chain',
          action: 'Register policy in Settings → Agent Management → Register Policy'
        }
        setResults([...checkResults])
        setRunning(false)
        return
      }

      // Check if policy is expired
      const currentRound = BigInt(Math.floor(Date.now() / 4500)) // Rough estimate
      if (policy.expiryRound > 0n && currentRound > policy.expiryRound) {
        checkResults[4] = {
          step: '5. Guardian Policy',
          status: 'warning',
          message: 'Guardian policy has expired',
          action: 'Renew policy in Settings → Agent Management'
        }
      } else if (policy.dailyExecutionsCap <= policy.dailyExecutionsSpent) {
        checkResults[4] = {
          step: '5. Guardian Policy',
          status: 'warning',
          message: 'No executions remaining today',
          action: 'Wait for daily reset or increase execution cap'
        }
      } else {
        checkResults[4] = {
          step: '5. Guardian Policy',
          status: 'success',
          message: 'Policy is active and ready'
        }
      }
      setResults([...checkResults])

    } catch (error) {
      const lastStep = checkResults.length - 1
      checkResults[lastStep] = {
        step: checkResults[lastStep].step,
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        action: 'Check console for details'
      }
      setResults([...checkResults])
    }

    setRunning(false)
  }

  if (!isOpen) return null

  const getStatusIcon = (status: HealthCheckResult['status']) => {
    switch (status) {
      case 'success': return '✅'
      case 'warning': return '⚠️'
      case 'error': return '❌'
      case 'pending': return '⏳'
      default: return '⏳'
    }
  }

  const hasErrors = results.some(r => r.status === 'error')
  const hasWarnings = results.some(r => r.status === 'warning')
  const allComplete = results.length > 0 && results.every(r => r.status !== 'pending')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h2>Guardian Policy Health Check</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          <p style={{ marginBottom: '16px', color: '#666' }}>
            This diagnostic will check your Guardian policy configuration and identify any issues.
          </p>
          
          <div style={{ marginBottom: '16px' }}>
            <button 
              className="z-btn z-btn-primary"
              onClick={runHealthCheck}
              disabled={running || !activeAddress || !workflowId}
            >
              {running ? 'Running Check...' : 'Run Health Check'}
            </button>
          </div>

          {results.length > 0 && (
            <div style={{ marginTop: '24px' }}>
              {results.map((result, index) => (
                <div 
                  key={index}
                  style={{ 
                    padding: '12px',
                    marginBottom: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    backgroundColor: result.status === 'error' ? '#fef2f2' : 
                                   result.status === 'warning' ? '#fffbeb' :
                                   result.status === 'success' ? '#f0fdf4' : '#f9fafb'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{getStatusIcon(result.status)}</span>
                    <strong>{result.step}</strong>
                  </div>
                  <div style={{ marginTop: '4px', color: '#666' }}>
                    {result.message}
                  </div>
                  {result.action && (
                    <div style={{ 
                      marginTop: '8px', 
                      padding: '8px', 
                      backgroundColor: '#f8f9fa', 
                      borderRadius: '4px',
                      fontSize: '14px'
                    }}>
                      <strong>Action needed:</strong> {result.action}
                    </div>
                  )}
                </div>
              ))}
              
              {allComplete && !running && (
                <div style={{ 
                  marginTop: '16px', 
                  padding: '12px', 
                  borderRadius: '6px',
                  backgroundColor: hasErrors ? '#fef2f2' : hasWarnings ? '#fffbeb' : '#f0fdf4',
                  border: `1px solid ${hasErrors ? '#fecaca' : hasWarnings ? '#fde68a' : '#bbf7d0'}`
                }}>
                  <strong>
                    {hasErrors ? '❌ Issues found that prevent execution' :
                     hasWarnings ? '⚠️ Warnings found - execution may be limited' :
                     '✅ All checks passed - Guardian policy is ready'}
                  </strong>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}