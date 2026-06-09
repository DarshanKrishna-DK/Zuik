import type { ActionContext, ActionResult } from '../commandTypes'
import { invokeComponentClick } from '../componentRegistry'
import {
  clickButtonByText,
  clickTestId,
  setExecutionMode,
  waitForElement,
} from '../domUtils'
import { executeNavigationAction } from './navigationActions'

export async function executeComponentAction(
  action: string,
  params: Record<string, unknown>,
  ctx: ActionContext,
): Promise<ActionResult> {
  switch (action) {
    case 'click_testid': {
      const testId = String(params.testId ?? '').trim()
      if (!testId) {
        return { success: false, message: 'No test ID specified.' }
      }
      const clicked = invokeComponentClick(testId) || clickTestId(testId)
      return clicked
        ? { success: true, message: `Clicked ${testId}.` }
        : { success: false, message: `Could not find element with test ID ${testId}.` }
    }

    case 'toggle_execution_mode': {
      const mode = params.mode === 'agent' ? 'agent' : 'user'
      if (ctx.location.pathname !== '/builder') {
        await executeNavigationAction('go_builder', {}, ctx)
        await waitForElement('[data-testid="execution-mode-selector"]')
      }
      const switched = setExecutionMode(mode)
      return switched
        ? {
            success: true,
            message:
              mode === 'agent'
                ? 'Switched to agent wallet execution mode.'
                : 'Switched to user signing mode.',
          }
        : { success: false, message: 'Execution mode selector not found on the builder.' }
    }

    case 'toggle_sidebar': {
      if (ctx.location.pathname !== '/builder') {
        await executeNavigationAction('go_builder', {}, ctx)
      }
      const sidebar = document.querySelector('.zuik-sidebar')
      const expand = params.expand !== false
      const isCollapsed = sidebar?.classList.contains('zuik-sidebar-collapsed')

      if (expand && isCollapsed) {
        const toggle = document.querySelector('.zuik-sidebar-toggle')
        if (toggle instanceof HTMLElement) {
          toggle.click()
          return { success: true, message: 'Expanded the block sidebar.' }
        }
      }
      if (!expand && !isCollapsed) {
        const toggle = document.querySelector('.zuik-sidebar-toggle')
        if (toggle instanceof HTMLElement) {
          toggle.click()
          return { success: true, message: 'Collapsed the block sidebar.' }
        }
      }

      return {
        success: true,
        message: expand ? 'Block sidebar is already expanded.' : 'Block sidebar is already collapsed.',
      }
    }

    case 'open_templates': {
      if (ctx.location.pathname !== '/builder') {
        await executeNavigationAction('go_builder', {}, ctx)
      }
      const opened = clickButtonByText('Templates')
      return opened
        ? { success: true, message: 'Opening the template gallery.' }
        : { success: false, message: 'Templates button not found on the builder.' }
    }

    default:
      return { success: false, message: `Unknown component action: ${action}.` }
  }
}
