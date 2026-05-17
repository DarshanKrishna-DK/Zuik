import algosdk from 'algosdk'
import { getAlgodClient } from './algorand'
import { WalletAccount } from '@txnlab/use-wallet'

// Guardian contract deployment info
interface GuardianDeployment {
  appId: number
  appAddress: string
  network: string
}

// Agent status from Guardian contract
interface AgentStatus {
  isActive: boolean
  dailySpendingCap: number
  dailySpentAmount: number
  transactionCount: number
  riskScore: number
}

// Global metrics from Guardian contract
interface GlobalMetrics {
  totalTransactions: number
  totalVolume: number
  isPaused: boolean
}

// Guardian policy configuration
interface GuardianPolicy {
  dailyCap: number
  allowedAssets: number[] // Asset IDs
  allowedMethods: string[] // Method signatures
}

// Load Guardian deployment info (in production, this would come from environment)
const GUARDIAN_DEPLOYMENT: GuardianDeployment = {
  appId: parseInt(import.meta.env.VITE_GUARDIAN_APP_ID || '0'),
  appAddress: import.meta.env.VITE_GUARDIAN_APP_ADDRESS || '',
  network: import.meta.env.VITE_ALGOD_NETWORK || 'localnet'
}

export class GuardianContractService {
  private algod: algosdk.Algodv2
  private appId: number

  constructor() {
    this.algod = getAlgodClient()
    this.appId = GUARDIAN_DEPLOYMENT.appId
    
    if (!this.appId) {
      console.warn('Guardian app ID not configured')
    }
  }

  /**
   * Get basic contract information
   */
  async getContractInfo(): Promise<{
    appId: number
    appAddress: string
    network: string
    isDeployed: boolean
  }> {
    let isDeployed = false
    
    try {
      if (this.appId > 0) {
        await this.algod.getApplicationByID(this.appId).do()
        isDeployed = true
      }
    } catch (error) {
      console.warn('Guardian contract not found:', error)
    }
    
    return {
      appId: this.appId,
      appAddress: GUARDIAN_DEPLOYMENT.appAddress,
      network: GUARDIAN_DEPLOYMENT.network,
      isDeployed
    }
  }

  /**
   * Register a new AI agent (Demo Version - Returns mock success)
   */
  async registerAgent(
    account: WalletAccount,
    agentAddress: string,
    policy: GuardianPolicy
  ): Promise<string> {
    console.log('Guardian Demo: Registering agent', {
      agentAddress,
      policy,
      contractId: this.appId
    })
    
    // In the demo version, we return a mock transaction ID
    // This simulates successful registration without actual contract interaction
    const mockTxId = 'MOCK_TXN_' + Math.random().toString(36).substring(2, 15).toUpperCase()
    
    return mockTxId
  }

  /**
   * Check authorization (Demo Version - Returns mock result)
   */
  async authorizeExecution(
    agentAddress: string,
    methodSignature: string,
    assetId: number,
    amount: number,
    recipient: string
  ): Promise<{ authorized: boolean; txId?: string }> {
    console.log('Guardian Demo: Checking authorization', {
      agentAddress,
      methodSignature,
      amount,
      contractId: this.appId
    })
    
    // Mock authorization logic - approve small amounts, deny large ones
    const authorized = amount <= 1000000 // 1 ALGO in microALGOs
    
    return { authorized }
  }

  /**
   * Log execution results (Demo Version - Returns mock success)
   */
  async logExecution(
    account: WalletAccount,
    agentAddress: string,
    txnId: string,
    methodSignature: string,
    amount: number,
    success: boolean
  ): Promise<string> {
    console.log('Guardian Demo: Logging execution', {
      agentAddress,
      txnId,
      success,
      contractId: this.appId
    })
    
    const mockTxId = 'MOCK_LOG_' + Math.random().toString(36).substring(2, 15).toUpperCase()
    return mockTxId
  }

  /**
   * Get agent status (Demo Version - Returns mock data)
   */
  async getAgentStatus(agentAddress: string): Promise<AgentStatus | null> {
    console.log('Guardian Demo: Getting agent status', {
      agentAddress,
      contractId: this.appId
    })
    
    // Return mock agent status
    return {
      isActive: true,
      dailySpendingCap: 5000000, // 5 ALGO in microALGOs
      dailySpentAmount: 1500000, // 1.5 ALGO spent today
      transactionCount: 3,
      riskScore: 25 // Low risk
    }
  }

  /**
   * Get global Guardian contract metrics (Demo Version - Returns mock data)
   */
  async getGlobalMetrics(): Promise<GlobalMetrics | null> {
    console.log('Guardian Demo: Getting global metrics', {
      contractId: this.appId
    })
    
    // Return mock global metrics
    return {
      totalTransactions: 127,
      totalVolume: 50000000, // 50 ALGO total volume
      isPaused: false
    }
  }

  /**
   * Update agent policy (Demo Version - Returns mock success)
   */
  async updateAgentPolicy(
    account: WalletAccount,
    agentAddress: string,
    newPolicy: GuardianPolicy
  ): Promise<string> {
    console.log('Guardian Demo: Updating agent policy', {
      agentAddress,
      newPolicy,
      contractId: this.appId
    })
    
    const mockTxId = 'MOCK_UPDATE_' + Math.random().toString(36).substring(2, 15).toUpperCase()
    return mockTxId
  }

  /**
   * Emergency pause (Demo Version - Returns mock success)
   */
  async setPaused(account: WalletAccount, paused: boolean): Promise<string> {
    console.log('Guardian Demo: Setting pause state', {
      paused,
      contractId: this.appId
    })
    
    const mockTxId = 'MOCK_PAUSE_' + Math.random().toString(36).substring(2, 15).toUpperCase()
    return mockTxId
  }
}

// Export singleton instance
export const guardianContract = new GuardianContractService()

// Export types
export type { AgentStatus, GlobalMetrics, GuardianPolicy }