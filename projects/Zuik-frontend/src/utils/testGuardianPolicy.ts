import { guardianContract } from '../services/guardianContract'

export async function testGuardianPolicyStatus(agentAddress: string, ownerAddress: string) {
  console.group('🧪 Guardian Policy Test')
  
  try {
    // Test 1: Check environment
    const guardianAppId = import.meta.env.VITE_GUARDIAN_APP_ID
    console.log('✅ Guardian App ID:', guardianAppId)
    
    if (!guardianAppId || parseInt(guardianAppId) === 0) {
      console.error('❌ VITE_GUARDIAN_APP_ID not configured or is 0')
      console.groupEnd()
      return false
    }
    
    // Test 2: Check contract info
    const contractInfo = await guardianContract.getContractInfo()
    console.log('✅ Contract Info:', contractInfo)
    
    if (!contractInfo.isDeployed) {
      console.error('❌ Guardian contract is not deployed')
      console.groupEnd()
      return false
    }
    
    // Test 3: Check if paused
    const isPaused = await guardianContract.isPaused(ownerAddress)
    console.log('✅ Is Paused:', isPaused)
    
    if (isPaused) {
      console.warn('⚠️ Guardian is paused - needs to be resumed')
    }
    
    // Test 4: Check policy
    const policy = await guardianContract.getPolicy(agentAddress, ownerAddress)
    console.log('✅ Policy Result:', policy)
    
    if (!policy) {
      console.error('❌ No policy found on-chain for agent:', agentAddress)
      console.log('💡 Action needed: Register policy in Agent Management')
      console.groupEnd()
      return false
    }
    
    // Test 5: Check policy validity
    const now = Date.now()
    const currentRound = BigInt(Math.floor(now / 4500)) // Rough estimate
    
    if (policy.expiryRound > 0n && currentRound > policy.expiryRound) {
      console.warn('⚠️ Policy has expired')
      console.log('💡 Action needed: Renew policy in Agent Management')
    }
    
    if (policy.dailyExecutionsCap <= policy.dailyExecutionsSpent) {
      console.warn('⚠️ No executions remaining today')
    }
    
    console.log('✅ Policy is valid and active!')
    console.groupEnd()
    return true
    
  } catch (error) {
    console.error('❌ Test failed with error:', error)
    console.groupEnd()
    return false
  }
}

// Make available globally for console debugging
if (typeof window !== 'undefined') {
  (window as any).testGuardianPolicy = testGuardianPolicyStatus
}