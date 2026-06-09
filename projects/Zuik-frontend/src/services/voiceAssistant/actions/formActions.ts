import type { SettingsSectionId } from '../../../components/settings/types'
import { listAgentWallets } from '../../agentWallet'
import type { ActionContext, ActionResult } from '../commandTypes'
import { clickTestId, fillInput, setRangeSlider, waitForElement } from '../domUtils'
import { prepareFundAgent } from '../transactionPrep'
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

async function ensureSettingsSection(
  ctx: ActionContext,
  section: SettingsSectionId,
): Promise<boolean> {
  if (ctx.location.pathname !== '/settings') {
    await executeNavigationAction('go_settings_section', { section }, ctx)
  } else {
    ctx.navigate(`/settings?section=${section}`)
    await waitForElement(`[data-testid="settings-nav-${section}"]`)
    clickTestId(`settings-nav-${section}`)
  }
  return Boolean(await waitForElement(`[data-testid="settings-nav-${section}"]`))
}

export async function executeFormAction(
  action: string,
  params: Record<string, unknown>,
  ctx: ActionContext,
): Promise<ActionResult> {
  switch (action) {
    case 'set_risk_tolerance': {
      const value = Number(params.value)
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        return { success: false, message: 'Risk tolerance must be a number between 0 and 100.' }
      }

      await ensureSettingsSection(ctx, 'risk')
      await waitForElement('[data-testid="risk-slider"]')
      const updated = setRangeSlider('risk-slider', value)

      return updated
        ? {
            success: true,
            message: `Set max token risk tolerance to ${value}.`,
          }
        : { success: false, message: 'Could not find the risk tolerance slider.' }
    }

    case 'fund_agent': {
      const amount = Number(params.amount)
      if (!Number.isFinite(amount) || amount <= 0) {
        return { success: false, message: 'Please specify a positive ALGO amount to fund.' }
      }

      if (!ctx.activeAddress) {
        return {
          success: false,
          message: 'Connect your wallet first, then say fund agent again.',
          requiresWallet: true,
        }
      }

      await ensureSettingsSection(ctx, 'agents')
      await waitForElement('[data-testid="agent-management"]')

      const fundInputs = document.querySelectorAll<HTMLInputElement>('input[id^="fund-"]')
      if (fundInputs.length === 0) {
        return {
          success: false,
          message:
            'No agent fund field found. Expand an agent card in Agent Management or create an agent wallet first.',
        }
      }

      const targetInput = fundInputs[0]
      targetInput.focus()
      targetInput.value = String(amount)
      targetInput.dispatchEvent(new Event('input', { bubbles: true }))
      targetInput.dispatchEvent(new Event('change', { bubbles: true }))

      const agentAddress = (await resolvePrimaryAgent(ctx.activeAddress)) ?? ''

      if (agentAddress) {
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

      return {
        success: true,
        message: `Prepared funding of ${amount} ALGO in Agent Management. Use the approval panel or click Fund to sign.`,
        requiresUserApproval: true,
      }
    }

    case 'set_telegram_chat_id': {
      const chatId = String(params.chatId ?? '').trim()
      if (!chatId) {
        return { success: false, message: 'Please provide a Telegram chat ID.' }
      }

      await ensureSettingsSection(ctx, 'telegram')
      await waitForElement('#telegram-chat-id')
      const updated = fillInput('#telegram-chat-id', chatId)

      return updated
        ? { success: true, message: `Set Telegram chat ID to ${chatId}. Save if required.` }
        : { success: false, message: 'Could not find the Telegram chat ID field.' }
    }

    case 'rename_workflow': {
      const name = String(params.name ?? '').trim()
      if (!name) {
        return { success: false, message: 'Please say the new workflow name.' }
      }

      if (ctx.location.pathname !== '/builder') {
        await executeNavigationAction('go_builder', {}, ctx)
      }
      await waitForElement('.zuik-wf-name-input')
      const input = document.querySelector('.zuik-wf-name-input')
      if (!(input instanceof HTMLInputElement)) {
        return { success: false, message: 'Workflow name input not found on the builder.' }
      }
      input.focus()
      input.value = name
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      input.blur()

      return { success: true, message: `Renamed the workflow to ${name}.` }
    }

    default:
      return { success: false, message: `Unknown form action: ${action}.` }
  }
}
