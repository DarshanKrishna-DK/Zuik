import type { ActionContext, ActionResult } from '../commandTypes'
import {
  clickButtonByText,
  clickButtonByTitle,
  clickTestId,
  sendBuilderAiMessage,
  waitForElement,
} from '../domUtils'
import { executeNavigationAction } from './navigationActions'

async function ensureBuilder(ctx: ActionContext): Promise<void> {
  if (ctx.location.pathname !== '/builder') {
    ctx.navigate('/builder')
    await waitForElement('[data-testid="execution-mode-selector"]')
  }
}

async function openBuilderMenuItem(label: string): Promise<boolean> {
  const menuBtn = document.querySelector('.z-builder-menu-btn')
  if (menuBtn instanceof HTMLElement) {
    menuBtn.click()
    await waitForElement('.z-builder-dropdown')
  }
  return clickButtonByText(label, document.querySelector('.z-builder-dropdown') ?? document)
}

export async function executeWorkflowAction(
  action: string,
  params: Record<string, unknown>,
  ctx: ActionContext,
): Promise<ActionResult> {
  switch (action) {
    case 'create_workflow':
      await executeNavigationAction('go_builder', {}, ctx)
      return {
        success: true,
        message: 'Opening a new workflow in the builder.',
      }

    case 'create_dca_workflow': {
      await ensureBuilder(ctx)
      const sent = sendBuilderAiMessage('Create a DCA bot that buys ALGO weekly')
      return sent
        ? {
            success: true,
            message: 'Opening the builder and asking AI to create a DCA workflow.',
          }
        : {
            success: false,
            message: 'Could not open the AI assistant. Make sure you are on the builder page.',
          }
    }

    case 'run_workflow': {
      await ensureBuilder(ctx)
      const workflowName = params.workflowName as string | null | undefined
      if (workflowName) {
        const nameLower = workflowName.toLowerCase()
        if (nameLower.includes('dca')) {
          sendBuilderAiMessage(`Load or configure my ${workflowName} workflow`)
        }
      }
      const started = clickButtonByTitle('Start agent')
      return started
        ? {
            success: true,
            message: workflowName
              ? `Starting ${workflowName}. Monitor the agent controls on the builder toolbar.`
              : 'Starting the workflow agent.',
            requiresUserApproval: !ctx.activeAddress,
          }
        : {
            success: false,
            message:
              'Could not find the Run control. Open the builder and ensure agent controls are visible.',
          }
    }

    case 'stop_workflow': {
      await ensureBuilder(ctx)
      const stopped = clickButtonByTitle('Stop')
      return stopped
        ? { success: true, message: 'Stopping the workflow agent.' }
        : { success: false, message: 'Could not find the Stop control on the builder.' }
    }

    case 'pause_workflow': {
      await ensureBuilder(ctx)
      const paused = clickButtonByTitle('Pause')
      return paused
        ? { success: true, message: 'Pausing the workflow agent.' }
        : { success: false, message: 'Could not find the Pause control on the builder.' }
    }

    case 'resume_workflow': {
      await ensureBuilder(ctx)
      const resumed = clickButtonByTitle('Resume')
      return resumed
        ? { success: true, message: 'Resuming the workflow agent.' }
        : { success: false, message: 'Could not find the Resume control on the builder.' }
    }

    case 'open_ai_assistant': {
      await ensureBuilder(ctx)
      const opened = clickTestId('builder-ai-assistant')
      return opened
        ? { success: true, message: 'Opening the AI assistant.' }
        : { success: false, message: 'AI assistant button not found on the builder.' }
    }

    case 'send_ai_message': {
      await ensureBuilder(ctx)
      const message = String(params.message ?? '').trim()
      if (!message) {
        return { success: false, message: 'Please tell me what to ask the AI.' }
      }
      const sent = sendBuilderAiMessage(message)
      return sent
        ? { success: true, message: `Sent your request to the AI: ${message}` }
        : { success: false, message: 'Could not send a message to the AI assistant.' }
    }

    case 'open_execution_log': {
      await ensureBuilder(ctx)
      const opened = await openBuilderMenuItem('Execution Log')
      return opened
        ? { success: true, message: 'Opening the execution log.' }
        : { success: false, message: 'Could not open the execution log from the builder menu.' }
    }

    case 'clear_canvas': {
      await ensureBuilder(ctx)
      const cleared = clickButtonByTitle('Clear Canvas')
      return cleared
        ? {
            success: true,
            message: 'Clearing the canvas. Confirm in the dialog if prompted.',
          }
        : { success: false, message: 'Could not find the Clear Canvas control.' }
    }

    default:
      return { success: false, message: `Unknown workflow action: ${action}.` }
  }
}
