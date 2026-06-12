import { guardianContract } from '../services/guardianContract'
import { getAgentWallet } from '../services/agentWallet'

export async function debugGuardianPolicy(workflowId: string, ownerAddress: string) {
  console.group('🔍 Guardian Policy Debug')
  
  // Check environment
  const guardianAppId = import.meta.env.VITE_GUARDIAN_APP_ID
  console.log('Environment VITE_GUARDIAN_APP_ID:', guardianAppId)
  
  // Get agent wallet
  const agentWallet = await getAgentWallet(workflowId)
  console.log('Agent wallet:', agentWallet)
  
  if (!agentWallet) {
    console.error('❌ No agent wallet found for workflow:', workflowId)
    console.groupEnd()
    return
  }
  
  // Check guardian contract info
  try {
    const contractInfo = await guardianContract.getContractInfo()
    console.log('Guardian contract info:', contractInfo)
  } catch (error) {
    console.error('❌ Failed to get contract info:', error)
  }
  
  // Check if Guardian is paused
  try {
    const isPaused = await guardianContract.isPaused(ownerAddress)
    console.log('Guardian paused:', isPaused)
  } catch (error) {
    console.error('❌ Failed to check paused status:', error)
  }
  
  // Check policy
  try {
    const policy = await guardianContract.getPolicy(agentWallet.agent_address, ownerAddress)
    console.log('Policy found:', policy)
    
    if (!policy) {
      console.warn('⚠️ No policy found on-chain for agent:', agentWallet.agent_address)
      console.log('💡 Try registering a policy in Agent Management')
    }
  } catch (error) {
    console.error('❌ Failed to get policy:', error)
  }
  
  console.groupEnd()
}

// Global debug function for console use
if (typeof window !== 'undefined') {
  (window as any).debugGuardianPolicy = debugGuardianPolicy
}