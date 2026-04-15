import algosdk from 'algosdk'
import { getAlgodClient } from './algorand'
import type { SimulationWarning } from './transactionSimulator'

export interface SafetyCheckResult {
  passed: boolean
  warnings: SimulationWarning[]
  errors: SimulationWarning[]
}

const recentExecutions: number[] = []
const DUPLICATE_WINDOW_MS = 30_000

function isValidAlgorandAddress(addr: string): boolean {
  try {
    algosdk.decodeAddress(addr)
    return true
  } catch {
    return false
  }
}

export async function runSafetyChecks(
  actionBlocks: { nodeId: string; blockId: string; config: Record<string, string | number | undefined> }[],
  senderAddress: string,
  maxValueMicroAlgo?: number,
): Promise<SafetyCheckResult> {
  const warnings: SimulationWarning[] = []
  const errors: SimulationWarning[] = []

  let accountBalance = 0
  let accountMinBalance = 0
  let optedInAssets: Set<number> = new Set()

  try {
    const algod = getAlgodClient()
    const info = await algod.accountInformation(senderAddress).do()
    const raw = info as unknown as Record<string, unknown>
    accountBalance = Number(raw['amount'] ?? 0)
    accountMinBalance = Number(raw['min-balance'] ?? raw['minBalance'] ?? 100_000)

    const assetsRaw = raw['assets'] ?? raw['created-assets']
    if (Array.isArray(assetsRaw)) {
      for (const a of assetsRaw) {
        const holding = a as Record<string, unknown>
        const id = Number(holding['asset-id'] ?? holding['assetId'] ?? 0)
        if (id > 0) optedInAssets.add(id)
      }
    }
  } catch {
    warnings.push({
      severity: 'warning',
      message: 'Could not fetch account information. Balance and opt-in checks are skipped.',
    })
  }

  let totalAlgoNeeded = 0
  const asaAmountsNeeded = new Map<number, number>()

  for (const { blockId, config } of actionBlocks) {
    switch (blockId) {
      case 'send-payment': {
        const recipient = config.recipient as string
        const amount = Number(config.amount ?? 0)
        const assetId = Number(config.asset ?? 0)

        if (!recipient) {
          errors.push({ severity: 'error', message: 'Send Payment: recipient address is missing.', field: 'recipient' })
        } else if (!isValidAlgorandAddress(recipient)) {
          errors.push({ severity: 'error', message: `Send Payment: "${recipient.slice(0, 10)}..." is not a valid Algorand address.`, field: 'recipient' })
        }

        if (amount <= 0) {
          errors.push({ severity: 'error', message: 'Send Payment: amount must be greater than zero.', field: 'amount' })
        }

        if (assetId === 0) {
          totalAlgoNeeded += amount + 1000
        } else {
          const prev = asaAmountsNeeded.get(assetId) ?? 0
          asaAmountsNeeded.set(assetId, prev + amount)
          totalAlgoNeeded += 1000
        }

        if (assetId > 0 && optedInAssets.size > 0) {
          if (recipient && isValidAlgorandAddress(recipient)) {
            warnings.push({
              severity: 'info',
              message: `Send Payment: sending ASA #${assetId}. Make sure the recipient has opted in to this asset.`,
            })
          }
        }
        break
      }

      case 'opt-in-asa': {
        const assetId = Number(config.assetId ?? 0)
        if (assetId <= 0) {
          errors.push({ severity: 'error', message: 'Opt-In ASA: asset ID is missing or invalid.', field: 'assetId' })
        } else if (optedInAssets.has(assetId)) {
          warnings.push({ severity: 'info', message: `Opt-In ASA: you are already opted in to ASA #${assetId}. This step will be skipped.` })
        }
        totalAlgoNeeded += 101_000
        break
      }

      case 'create-asa': {
        if (!config.name) errors.push({ severity: 'error', message: 'Create ASA: asset name is required.', field: 'name' })
        if (!config.unitName) errors.push({ severity: 'error', message: 'Create ASA: unit name is required.', field: 'unitName' })
        if (!config.totalSupply || Number(config.totalSupply) <= 0) {
          errors.push({ severity: 'error', message: 'Create ASA: total supply must be greater than zero.', field: 'totalSupply' })
        }
        totalAlgoNeeded += 101_000
        break
      }

      case 'swap-token': {
        const fromAsset = Number(config.fromAsset ?? -1)
        const toAsset = Number(config.toAsset ?? -1)
        const amount = Number(config.amount ?? 0)

        if (fromAsset < 0) errors.push({ severity: 'error', message: 'Swap Token: source asset is required.', field: 'fromAsset' })
        if (toAsset < 0) errors.push({ severity: 'error', message: 'Swap Token: destination asset is required.', field: 'toAsset' })
        if (amount <= 0) errors.push({ severity: 'error', message: 'Swap Token: amount must be greater than zero.', field: 'amount' })
        if (fromAsset === toAsset && fromAsset >= 0) {
          errors.push({ severity: 'error', message: 'Swap Token: source and destination assets are the same.' })
        }

        if (fromAsset === 0) {
          totalAlgoNeeded += amount + 4000
        } else {
          const prev = asaAmountsNeeded.get(fromAsset) ?? 0
          asaAmountsNeeded.set(fromAsset, prev + amount)
          totalAlgoNeeded += 4000
        }

        const slippage = Number(config.slippage ?? 0.5)
        if (slippage > 5) {
          warnings.push({ severity: 'warning', message: `Swap Token: slippage tolerance is ${slippage}%. This is high and may result in unfavorable rates.` })
        }
        break
      }

      case 'webhook-action': {
        if (!config.url) errors.push({ severity: 'error', message: 'HTTP Request: URL is required.', field: 'url' })
        break
      }

      case 'fiat-onramp': {
        if (!config.userId) errors.push({ severity: 'error', message: 'Fiat On-Ramp: user ID is required.', field: 'userId' })
        if (!config.walletAddress) errors.push({ severity: 'error', message: 'Fiat On-Ramp: wallet address is required.', field: 'walletAddress' })
        break
      }

      case 'fiat-offramp': {
        if (!config.userId) errors.push({ severity: 'error', message: 'Fiat Off-Ramp: user ID is required.', field: 'userId' })
        if (!config.sourceId) errors.push({ severity: 'error', message: 'Fiat Off-Ramp: bank account (source ID) is required.', field: 'sourceId' })
        break
      }

      case 'fiat-quote': {
        if (!config.userId) errors.push({ severity: 'error', message: 'Fiat Quote: user ID is required.', field: 'userId' })
        if (!config.amount || Number(config.amount) <= 0) {
          errors.push({ severity: 'error', message: 'Fiat Quote: amount must be greater than zero.', field: 'amount' })
        }
        break
      }
    }
  }

  if (accountBalance > 0) {
    const spendable = accountBalance - accountMinBalance
    if (totalAlgoNeeded > spendable) {
      const needed = (totalAlgoNeeded / 1_000_000).toFixed(4)
      const available = (spendable / 1_000_000).toFixed(4)
      errors.push({
        severity: 'error',
        message: `Insufficient ALGO balance. This flow needs approximately ${needed} ALGO, but you only have ${available} ALGO available (after minimum balance).`,
      })
    }
  }

  if (maxValueMicroAlgo) {
    for (const { blockId, config } of actionBlocks) {
      if (blockId === 'send-payment') {
        const amount = Number(config.amount ?? 0)
        const assetId = Number(config.asset ?? 0)
        if (assetId === 0 && amount > maxValueMicroAlgo) {
          warnings.push({
            severity: 'warning',
            message: `Send Payment: ${(amount / 1_000_000).toFixed(4)} ALGO exceeds the maximum value guard. Double-check this is intended.`,
          })
        }
      }
    }
  }

  const now = Date.now()
  const recentCount = recentExecutions.filter((t) => now - t < DUPLICATE_WINDOW_MS).length
  if (recentCount > 0) {
    warnings.push({
      severity: 'warning',
      message: `This flow was executed ${recentCount} time(s) in the last 30 seconds. Are you sure you want to run it again?`,
    })
  }

  return {
    passed: errors.length === 0,
    warnings,
    errors,
  }
}

export function recordExecution(): void {
  recentExecutions.push(Date.now())
  while (recentExecutions.length > 20) {
    recentExecutions.shift()
  }
}

export function suggestFix(errorMessage: string): string | null {
  const msg = errorMessage.toLowerCase()

  if (msg.includes('template expression')) {
    return 'Template variables like {{...}} are resolved at runtime by the workflow agent. To test manually, replace with a real number.'
  }
  if (msg.includes('not opted in to asset')) {
    return 'Your wallet must opt in to this asset before you can swap it. Add an Opt-In ASA block first.'
  }
  if (msg.includes('do not have enough of this asset')) {
    return 'Your wallet does not hold enough of the source asset. Check your balance and reduce the swap amount.'
  }
  if (msg.includes('fund this wallet')) {
    return 'Fund the active wallet with ALGO from the TestNet Dispenser: https://bank.testnet.algorand.network/'
  }
  if (msg.includes('overspend') || msg.includes('insufficient')) {
    return 'Your account does not have enough ALGO. Fund your wallet from the Algorand TestNet Dispenser.'
  }
  if (msg.includes('asset not opted in') || msg.includes('asset not found')) {
    return 'The recipient has not opted in to this asset. They need to opt in before receiving it.'
  }
  if (msg.includes('below min') || msg.includes('min balance')) {
    return 'The connected wallet does not have enough ALGO to cover minimum balance + fees. Switch to a funded wallet or add ALGO.'
  }
  if (msg.includes('slippage') || msg.includes('price moved')) {
    return 'The swap price moved beyond your slippage tolerance. Try increasing the slippage or try again.'
  }
  if (msg.includes('logic eval') || msg.includes('assert')) {
    return 'The smart contract rejected this transaction. Check that your inputs match what the contract expects.'
  }
  if (msg.includes('timeout') || msg.includes('network')) {
    return 'Network request timed out. Check your internet connection and try again.'
  }
  if (msg.includes('rejected') || msg.includes('cancelled')) {
    return 'The transaction was rejected in your wallet. Open your wallet app and try approving again.'
  }

  return null
}
