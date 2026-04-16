import type { AgentContext, WalletEventAmountOverride } from '../runAgent'

export type ExecutorFn = (
  config: Record<string, string | number | undefined>,
  context: AgentContext,
  upstreamOutputs?: Record<string, unknown>
) => Promise<Record<string, unknown> | null>

let timerIterations = new Map<string, number>()

export function resetTimerIterations() {
  timerIterations = new Map()
}

export const timerLoopExecutor: ExecutorFn = async (config, _context) => {
  const key = JSON.stringify(config)
  const count = (timerIterations.get(key) ?? 0) + 1
  timerIterations.set(key, count)
  return { tick: Date.now(), iteration: count }
}

function applyWalletEventOverride(
  ov: WalletEventAmountOverride,
  address: string,
  assetId: number,
): Record<string, unknown> {
  const dec = ov.decimals
  const human = Number(ov.amountBaseUnits) / 10 ** dec
  return {
    txn: null,
    amount: human,
    sender: address,
    asset: assetId,
    decimals: dec,
    /** Agent set this from balance delta since last poll, or full balance if amountMode is total */
    amountBaseUnits: ov.amountBaseUnits.toString(),
  }
}

export const walletEventExecutor: ExecutorFn = async (config, context) => {
  try {
    const algod = context.algorand.client.algod
    const address = (config.address as string) || context.sender
    const assetId = Number(config.assetId ?? 0)

    const override = context.walletEventOverride
    if (override && Number(override.assetId) === assetId) {
      return applyWalletEventOverride(override, address, assetId)
    }

    let amount = 0
    let decimals = 6

    // Get asset decimals
    if (assetId > 0) {
      try {
        const assetInfo = await algod.getAssetByID(assetId).do()
        const ai = assetInfo as unknown as Record<string, unknown>
        const params = ai.params as Record<string, unknown> | undefined
        decimals = Number(params?.decimals ?? (ai as Record<string, unknown>).decimals ?? 6)
      } catch { /* fallback to 6 */ }
    } else {
      decimals = 6 // ALGO always has 6 decimals
    }

    // Manual / test runs: use current on-chain balance (no agent override)
    try {
      const info = await algod.accountInformation(address).do()
      const accountInfo = info as unknown as Record<string, unknown>

      if (assetId === 0) {
        const microAlgo = Number(accountInfo.amount ?? 0)
        amount = microAlgo / Math.pow(10, decimals)
      } else {
        const assets = accountInfo.assets as Array<Record<string, unknown>> | undefined
        if (assets && Array.isArray(assets)) {
          const assetEntry = assets.find((a) => Number(a['asset-id'] ?? a.assetId) === assetId)
          const assetAmount = Number(assetEntry?.amount ?? assetEntry?.['amount'] ?? 0)
          amount = assetAmount / Math.pow(10, decimals)
        }
      }
    } catch {
      amount = 0
    }

    return {
      txn: null,
      amount,
      sender: address,
      asset: assetId,
      decimals,
    }
  } catch (err) {
    throw new Error(`Wallet Event: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export const webhookReceiverExecutor: ExecutorFn = async (config, context) => {
  context.log({
    nodeId: '', blockId: 'webhook-receiver', blockName: 'Webhook Receiver',
    type: 'skip', message: 'Webhook triggers require a backend API (Vercel serverless). Returning config.',
  })
  return { headers: {}, body: {}, query: {}, path: config.path ?? '' }
}

export const telegramTriggerExecutor: ExecutorFn = async (config, context) => {
  context.log({
    nodeId: '', blockId: 'telegram-trigger', blockName: 'Telegram Message',
    type: 'skip', message: 'Telegram triggers require a backend API for CORS. Returning config.',
  })
  return { message: '', chatId: config.chatId ?? '' }
}

export const triggerExecutors: Record<string, ExecutorFn> = {
  'timer-loop': timerLoopExecutor,
  'wallet-event': walletEventExecutor,
  'webhook-receiver': webhookReceiverExecutor,
  'telegram-trigger': telegramTriggerExecutor,
}
