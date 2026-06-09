import type { ActionContext, ActionResult } from '../commandTypes'
import {
  listAgentWallets,
} from '../../agentWallet'
import {
  prepareAgentPayment,
  prepareFundAgent,
  prepareWalletPayment,
} from '../transactionPrep'
import { executeNavigationAction } from './navigationActions'

async function resolvePrimaryAgent(ownerAddress: string): Promise<string | null> {
  try {
    const wallets = await listAgentWallets(ownerAddress)
    const active = wallets.find((w) => w.status === 'active')
    return active?.agent_address ?? null
  } catch {
    return null
  }
}

export async function executeTransactionAction(
  action: string,
  params: Record<string, unknown>,
  ctx: ActionContext,
): Promise<ActionResult> {
  switch (action) {
    case 'prepare_send_payment': {
      const amount = Number(params.amount)
      const recipient = String(params.recipient ?? '').trim()
      const assetId = Number(params.assetId ?? 0)

      if (!ctx.activeAddress) {
        return {
          success: false,
          message: 'Connect your wallet first, then ask me to send a payment again.',
          requiresWallet: true,
        }
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        return { success: false, message: 'Say how much ALGO to send, for example send 1 algo to an address.' }
      }

      if (!recipient) {
        return {
          success: false,
          message: 'I need a recipient Algorand address. Say send 1 algo to followed by the address.',
        }
      }

      const prepared = await prepareWalletPayment({
        sender: ctx.activeAddress,
        recipient,
        amountAlgo: amount,
        assetId: Number.isFinite(assetId) ? assetId : 0,
        note: params.note ? String(params.note) : undefined,
      })

      return {
        success: prepared.status === 'awaiting_approval',
        message: prepared.voicePrompt,
        requiresUserApproval: prepared.status === 'awaiting_approval',
        data: { transactionId: prepared.id, kind: prepared.kind },
      }
    }

    case 'prepare_fund_agent': {
      const amount = Number(params.amount)

      if (!ctx.activeAddress) {
        return {
          success: false,
          message: 'Connect your wallet first to fund an agent.',
          requiresWallet: true,
        }
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        return { success: false, message: 'Specify a positive ALGO amount, for example fund agent with 2 algo.' }
      }

      let agentAddress = String(params.agentAddress ?? '').trim()
      if (!agentAddress) {
        agentAddress = (await resolvePrimaryAgent(ctx.activeAddress)) ?? ''
      }

      if (!agentAddress) {
        await executeNavigationAction('go_settings_section', { section: 'agents' }, ctx)
        return {
          success: false,
          message:
            'No active agent wallet found. I opened Agent Management - create an agent first, then try funding again.',
        }
      }

      const prepared = await prepareFundAgent({
        ownerAddress: ctx.activeAddress,
        agentAddress,
        amountAlgo: amount,
      })

      return {
        success: prepared.status === 'awaiting_approval',
        message: prepared.voicePrompt,
        requiresUserApproval: prepared.status === 'awaiting_approval',
        data: { transactionId: prepared.id, kind: prepared.kind },
      }
    }

    case 'prepare_agent_payment': {
      const amount = Number(params.amount)
      const recipient = String(params.recipient ?? '').trim()

      if (!ctx.activeAddress) {
        return {
          success: false,
          message: 'Connect your wallet first to send via your agent.',
          requiresWallet: true,
        }
      }

      if (!Number.isFinite(amount) || amount <= 0 || !recipient) {
        return {
          success: false,
          message: 'Say send 1 algo from my agent to followed by the recipient address.',
        }
      }

      let agentAddress = String(params.agentAddress ?? '').trim()
      if (!agentAddress) {
        agentAddress = (await resolvePrimaryAgent(ctx.activeAddress)) ?? ''
      }

      if (!agentAddress) {
        return {
          success: false,
          message: 'No active agent wallet. Create one in Settings > Agent Management first.',
        }
      }

      const prepared = await prepareAgentPayment({
        ownerAddress: ctx.activeAddress,
        agentAddress,
        recipient,
        amountAlgo: amount,
      })

      return {
        success: prepared.status === 'awaiting_approval',
        message: prepared.voicePrompt,
        requiresUserApproval: prepared.status === 'awaiting_approval',
        data: { transactionId: prepared.id, kind: prepared.kind },
      }
    }

    default:
      return { success: false, message: `Unknown transaction action: ${action}.` }
  }
}
