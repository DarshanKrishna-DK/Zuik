import algosdk, { type TransactionSigner } from 'algosdk'
import { AlgoAmount } from '@algorandfoundation/algokit-utils/types/amount'
import { getAlgorandClient } from './algorand'
import { ZuikGuardianClient } from '../contracts/ZuikGuardian'

const MICRO_PER_ALGO = 1_000_000n

interface GuardianDeployment {
  appId: number
  appAddress: string
  network: string
}

export interface GuardianAgentPolicy {
  maxPerTradeMicroAlgos: bigint
  dailyCapMicroAlgos: bigint
  dailySpentMicroAlgos: bigint
  dayResetRound: bigint
  expiryRound: bigint
  dailyExecutionsCap: bigint
  dailyExecutionsSpent: bigint
  allowedDexAppId: bigint
  allowedAssetId: bigint
}

const GUARDIAN_DEPLOYMENT: GuardianDeployment = {
  appId: parseInt(import.meta.env.VITE_GUARDIAN_APP_ID || '0', 10),
  appAddress: import.meta.env.VITE_GUARDIAN_APP_ADDRESS || '',
  network: import.meta.env.VITE_ALGOD_NETWORK || 'testnet',
}

function requireAppId(): number {
  const id = GUARDIAN_DEPLOYMENT.appId
  if (!id || Number.isNaN(id)) {
    throw new Error('Set VITE_GUARDIAN_APP_ID in your environment for this network.')
  }
  return id
}

function getGuardianClient(sender?: string, signer?: TransactionSigner): ZuikGuardianClient {
  const algorand = getAlgorandClient()
  if (sender && signer) {
    algorand.setSigner(sender, signer)
  }
  return new ZuikGuardianClient({
    algorand,
    appId: BigInt(requireAppId()),
    defaultSender: sender,
  })
}

export class GuardianContractService {
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
   * Owner registers (or re-registers) an agent policy on Guardian. User-signed.
   */
  async bootstrapGuardian(
    ownerAddress: string,
    signer: TransactionSigner,
    args: {
      agent: string
      maxPerTradeMicroAlgos: bigint
      dailyCapMicroAlgos: bigint
      expiryRound: bigint
      dailyExecutionsCap: bigint
      allowedAssetId: bigint
      allowedDexAppId: bigint
    },
  ): Promise<string> {
    const client = getGuardianClient(ownerAddress, signer)
    const result = await client.send.bootstrap({
      sender: ownerAddress,
      signer,
      args: {
        agent: args.agent,
        maxPerTradeMicroAlgos: args.maxPerTradeMicroAlgos,
        dailyCapMicroAlgos: args.dailyCapMicroAlgos,
        expiryRound: args.expiryRound,
        dailyExecutionsCap: args.dailyExecutionsCap,
        allowedAssetId: args.allowedAssetId,
        allowedDexAppId: args.allowedDexAppId,
      },
    })
    return result.txIds[0] ?? ''
  }

  /**
   * Owner adds a recipient to the global allowlist. User-signed.
   */
  async allowRecipient(
    ownerAddress: string,
    signer: TransactionSigner,
    agentAddress: string,
    recipient: string,
  ): Promise<string> {
    const client = getGuardianClient(ownerAddress, signer)
    const result = await client.send.allowRecipient({
      sender: ownerAddress,
      signer,
      args: { agent: agentAddress, recipient },
    })
    return result.txIds[0] ?? ''
  }

  async emergencyStop(ownerAddress: string, signer: TransactionSigner): Promise<string> {
    const client = getGuardianClient(ownerAddress, signer)
    const result = await client.send.emergencyStop({ sender: ownerAddress, signer, args: [] })
    return result.txIds[0] ?? ''
  }

  async resume(ownerAddress: string, signer: TransactionSigner): Promise<string> {
    const client = getGuardianClient(ownerAddress, signer)
    const result = await client.send.resume({ sender: ownerAddress, signer, args: [] })
    return result.txIds[0] ?? ''
  }

  /**
   * Read the on-chain policy for an agent. Returns null when no policy box exists.
   */
  async getPolicy(agentAddress: string, readerAddress?: string): Promise<GuardianAgentPolicy | null> {
    try {
      const sender = readerAddress || agentAddress
      const client = getGuardianClient()
      console.log(`Checking Guardian policy for agent: ${agentAddress}, reader: ${sender}`)
      
      const result = await client.send.getPolicy({ sender, args: { agent: agentAddress } })
      const p = result.return
      
      if (!p) {
        console.log('Guardian policy not found - no policy box exists for this agent')
        return null
      }
      
      const policy = {
        maxPerTradeMicroAlgos: BigInt(p.maxPerTradeMicroAlgos),
        dailyCapMicroAlgos: BigInt(p.dailyCapMicroAlgos),
        dailySpentMicroAlgos: BigInt(p.dailySpentMicroAlgos),
        dayResetRound: BigInt(p.dayResetRound),
        expiryRound: BigInt(p.expiryRound),
        dailyExecutionsCap: BigInt(p.dailyExecutionsCap),
        dailyExecutionsSpent: BigInt(p.dailyExecutionsSpent),
        allowedDexAppId: BigInt(p.allowedDexAppId),
        allowedAssetId: BigInt(p.allowedAssetId),
      }
      
      console.log('Guardian policy found:', policy)
      return policy
    } catch (error) {
      console.error('Error reading Guardian policy:', error)
      return null
    }
  }

  async isPaused(readerAddress: string): Promise<boolean> {
    try {
      const client = getGuardianClient()
      const result = await client.send.isPausedState({ sender: readerAddress, args: [] })
      return Boolean(result.return)
    } catch {
      return false
    }
  }

  async isRecipientAllowed(recipient: string, readerAddress: string): Promise<boolean> {
    try {
      const client = getGuardianClient()
      const result = await client.send.isRecipientAllowed({ sender: readerAddress, args: { recipient } })
      return Boolean(result.return)
    } catch {
      return false
    }
  }

  /**
   * Build the atomic enforcement group [pay(agent -> recipient), authorize_trade(pay)] ready to send.
   *
   * txn0 is a PaymentTxn from the agent sub-account; txn1 is the Guardian authorize_trade app call.
   * The returned composer is unsigned - both browser preview (simulate) and the server keeper
   * (send with the agent signer) reuse it. Fee pooling: extraFee on the app call covers both txns.
   */
  async buildAuthorizedPaymentGroup(
    agentAddress: string,
    recipient: string,
    amountMicro: bigint,
    options?: { note?: string },
  ): Promise<ReturnType<ReturnType<ZuikGuardianClient['newGroup']>['authorizeTrade']>> {
    const algorand = getAlgorandClient()
    const client = getGuardianClient(agentAddress)

    const paymentTxn = await algorand.createTransaction.payment({
      sender: agentAddress,
      receiver: recipient,
      amount: AlgoAmount.MicroAlgos(amountMicro),
      note: options?.note ? new TextEncoder().encode(options.note) : undefined,
    })

    return client.newGroup().authorizeTrade({
      sender: agentAddress,
      args: { pay: paymentTxn },
      // Pool fees so the group covers both the payment and the app call min fees.
      extraFee: AlgoAmount.MicroAlgos(1000n),
    })
  }
}

export const guardianContract = new GuardianContractService()

export function algoToMicroAlgos(algo: number): bigint {
  return BigInt(Math.round(algo * Number(MICRO_PER_ALGO)))
}

export { MICRO_PER_ALGO }
