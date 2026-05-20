import algosdk, { type TransactionSigner } from 'algosdk'
import { getAlgorandClient } from './algorand'
import { ZuikGuardianClient } from '../contracts/ZuikGuardian'

const MICRO_PER_ALGO = 1_000_000n

interface GuardianDeployment {
  appId: number
  appAddress: string
  network: string
}

export interface AgentStatus {
  isActive: boolean
  dailySpendingCap: number
  dailySpentAmount: number
  transactionCount: number
  riskScore: number
}

export interface GlobalMetrics {
  totalTransactions: number
  totalVolume: number
  isPaused: boolean
}

export interface GuardianPolicy {
  dailyCap: number | bigint
  allowedAssets: number[]
  allowedMethods: string[]
}

const GUARDIAN_DEPLOYMENT: GuardianDeployment = {
  appId: parseInt(import.meta.env.VITE_GUARDIAN_APP_ID || '0', 10),
  appAddress: import.meta.env.VITE_GUARDIAN_APP_ADDRESS || '',
  network: import.meta.env.VITE_ALGOD_NETWORK || 'localnet',
}

function getLastRoundFromStatus(status: unknown): number {
  const s = status as { lastRound?: number; ['last-round']?: number }
  return s.lastRound ?? s['last-round'] ?? 0
}

function requireAppId(): number {
  const id = GUARDIAN_DEPLOYMENT.appId
  if (!id || Number.isNaN(id)) {
    throw new Error('Set VITE_GUARDIAN_APP_ID in your environment for this network.')
  }
  return id
}

function getGuardianClient(): ZuikGuardianClient {
  return new ZuikGuardianClient({
    algorand: getAlgorandClient(),
    appId: BigInt(requireAppId()),
  })
}

export class GuardianContractService {
  private get client(): ZuikGuardianClient {
    return getGuardianClient()
  }

  async getContractInfo(): Promise<{
    appId: number
    appAddress: string
    network: string
    isDeployed: boolean
  }> {
    const appId = GUARDIAN_DEPLOYMENT.appId
    let isDeployed = false
    try {
      if (appId > 0) {
        await getAlgorandClient().client.algod.getApplicationByID(appId).do()
        isDeployed = true
      }
    } catch {
      isDeployed = false
    }
    return {
      appId,
      appAddress:
        GUARDIAN_DEPLOYMENT.appAddress ||
        (isDeployed ? algosdk.getApplicationAddress(appId).toString() : ''),
      network: GUARDIAN_DEPLOYMENT.network,
      isDeployed,
    }
  }

  /**
   * Agent wallet must opt in to the Guardian app before the owner can register policy.
   */
  async agentOptIn(sender: string, signer: TransactionSigner): Promise<string> {
    const result = await this.client.send.optIn.optIn({
      sender,
      signer,
      args: [],
    })
    return result.txIds[0] ?? ''
  }

  /**
   * Owner registers daily cap (microAlgos) for an agent address.
   */
  async registerAgent(
    ownerAddress: string,
    signer: TransactionSigner,
    agentAddress: string,
    policy: GuardianPolicy,
  ): Promise<string> {
    const cap = BigInt(policy.dailyCap)
    if (cap <= 0n) throw new Error('dailyCap must be positive microAlgos')

    const result = await this.client.send.registerAgent({
      sender: ownerAddress,
      signer,
      args: {
        agent: agentAddress,
        dailyCapMicroAlgos: cap,
      },
    })
    return result.txIds[0] ?? ''
  }

  /**
   * On-chain spend check: agent signs; transaction succeeds only if within daily ALGO cap.
   */
  async attemptSpend(agentAddress: string, signer: TransactionSigner, amountMicroAlgos: bigint): Promise<string> {
    const result = await this.client.send.attemptSpend({
      sender: agentAddress,
      signer,
      args: {
        agent: agentAddress,
        amount: amountMicroAlgos,
      },
    })
    return result.txIds[0] ?? ''
  }

  async updateAgentPolicy(
    ownerAddress: string,
    signer: TransactionSigner,
    agentAddress: string,
    newPolicy: GuardianPolicy,
  ): Promise<string> {
    const cap = BigInt(newPolicy.dailyCap)
    if (cap <= 0n) throw new Error('dailyCap must be positive microAlgos')

    const result = await this.client.send.updateDailyCap({
      sender: ownerAddress,
      signer,
      args: {
        agent: agentAddress,
        dailyCapMicroAlgos: cap,
      },
    })
    return result.txIds[0] ?? ''
  }

  async setPaused(ownerAddress: string, signer: TransactionSigner, paused: boolean): Promise<string> {
    const result = await this.client.send.setPaused({
      sender: ownerAddress,
      signer,
      args: { paused },
    })
    return result.txIds[0] ?? ''
  }

  /**
   * Read-only: whether a spend would fit under the current on-chain daily counters (ALGO only).
   */
  async authorizeExecution(
    agentAddress: string,
    _methodSignature: string,
    assetId: number,
    amountMicroAlgos: number,
    _recipient: string,
  ): Promise<{ authorized: boolean; txId?: string }> {
    if (assetId !== 0) {
      return { authorized: false }
    }
    const status = await this.getAgentStatus(agentAddress)
    if (!status?.isActive) return { authorized: false }

    const algod = getAlgorandClient().client.algod
    const statusChain = await algod.status().do()
    const round = BigInt(getLastRoundFromStatus(statusChain))

    const local = await this.client.state.local(agentAddress).getAll()
    const spent = local.dailySpent ?? 0n
    const cap = BigInt(status.dailySpendingCap)
    const dayReset = local.dayResetRound ?? 0n

    let effectiveSpent = spent
    if (round >= dayReset) {
      effectiveSpent = 0n
    }

    const amount = BigInt(amountMicroAlgos)
    const ok = effectiveSpent + amount <= cap
    return { authorized: ok }
  }

  async logExecution(): Promise<string> {
    return ''
  }

  async getAgentStatus(agentAddress: string): Promise<AgentStatus | null> {
    try {
      const global = await this.client.state.global.getAll()
      const isPaused = (global.isPaused ?? 0n) !== 0n

      const local = await this.client.state.local(agentAddress).getAll()
      const registered = (local.isRegistered ?? 0n) !== 0n
      if (!registered) {
        return null
      }

      const algod = getAlgorandClient().client.algod
      const chain = await algod.status().do()
      const round = BigInt(getLastRoundFromStatus(chain))

      const dayReset = local.dayResetRound ?? 0n
      let dailySpent = local.dailySpent ?? 0n
      if (round >= dayReset) {
        dailySpent = 0n
      }

      return {
        isActive: registered && !isPaused,
        dailySpendingCap: Number(local.dailyCap ?? 0n),
        dailySpentAmount: Number(dailySpent),
        transactionCount: Number(local.transactionCount ?? 0n),
        riskScore: 0,
      }
    } catch {
      return null
    }
  }

  async getGlobalMetrics(): Promise<GlobalMetrics | null> {
    try {
      const g = await this.client.state.global.getAll()
      return {
        totalTransactions: Number(g.totalTransactions ?? 0n),
        totalVolume: Number(g.totalVolume ?? 0n),
        isPaused: (g.isPaused ?? 0n) !== 0n,
      }
    } catch {
      return null
    }
  }
}

export const guardianContract = new GuardianContractService()

export function algoToMicroAlgos(algo: number): bigint {
  return BigInt(Math.round(algo * Number(MICRO_PER_ALGO)))
}

export { MICRO_PER_ALGO }
