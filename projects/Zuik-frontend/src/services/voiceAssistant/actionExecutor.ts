import type { ActionContext, ActionResult, ParsedCommand } from './commandTypes'
import {
  executeComponentAction,
  executeFormAction,
  executeNavigationAction,
  executeQueryAction,
  executeTransactionAction,
  executeWorkflowAction,
} from './actions'

export async function executeCommand(
  command: ParsedCommand,
  ctx: ActionContext,
): Promise<ActionResult> {
  if (command.intent === 'unknown') {
    return {
      success: false,
      message: 'I did not understand that command.',
    }
  }

  switch (command.intent) {
    case 'navigation':
      return executeNavigationAction(command.action, command.params, ctx)
    case 'workflow':
      return executeWorkflowAction(command.action, command.params, ctx)
    case 'form':
      return executeFormAction(command.action, command.params, ctx)
    case 'transaction':
      return executeTransactionAction(command.action, command.params, ctx)
    case 'component':
      return executeComponentAction(command.action, command.params, ctx)
    case 'query':
      return executeQueryAction(command.action, command.params, ctx)
    default:
      return {
        success: false,
        message: `Unsupported intent: ${command.intent}.`,
      }
  }
}

export function formatActionResult(result: ActionResult): string {
  let message = result.message

  if (result.requiresWallet && !message.toLowerCase().includes('connect')) {
    message += ' Connect your wallet to continue.'
  }

  if (result.requiresUserApproval) {
    message += ' Review the approval panel next to the voice assistant, then approve when ready.'
  }

  return message
}
