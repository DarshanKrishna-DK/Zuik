import type { ActionContext, ActionResult } from '../commandTypes'
import { getShellState } from '../componentRegistry'
import {
  isConnectPromptVisible,
  readStat,
  readWalletBalances,
  waitForElement,
} from '../domUtils'
import { getSuggestions } from '../intentClassifier'
import { buildPageContext, describePageContext } from '../pageContext'
import { executeNavigationAction } from './navigationActions'

export async function executeQueryAction(
  action: string,
  _params: Record<string, unknown>,
  ctx: ActionContext,
): Promise<ActionResult> {
  const pageContext = buildPageContext(ctx.location, Boolean(ctx.activeAddress))

  switch (action) {
    case 'wallet_balance': {
      if (!ctx.activeAddress) {
        return {
          success: true,
          message: 'Your wallet is not connected. Say connect wallet to link your account.',
          requiresWallet: true,
        }
      }

      const shell = getShellState()
      if (shell?.balances.length) {
        const summary = shell.balances
          .map((b) => `${b.label} ${b.amount}`)
          .join('; ')
        return {
          success: true,
          message: `Your wallet balances: ${summary}.`,
          data: { balances: shell.balances },
        }
      }

      const balances = readWalletBalances()
      if (balances.length > 0) {
        return {
          success: true,
          message: `Your wallet balances: ${balances.join('; ')}.`,
          data: { balances },
        }
      }

      return {
        success: true,
        message:
          'Wallet is connected. Open the wallet menu in the navbar to view detailed balances.',
      }
    }

    case 'execution_history': {
      if (ctx.location.pathname === '/dashboard') {
        await waitForElement('.dash-exec-row, .zuik-empty-state')
        const rows = document.querySelectorAll('.dash-exec-row')
        if (rows.length === 0) {
          return { success: true, message: 'No recent executions on your dashboard yet.' }
        }
        return {
          success: true,
          message: `You have ${rows.length} recent execution${rows.length === 1 ? '' : 's'} on the dashboard.`,
          data: { count: rows.length },
        }
      }

      await executeNavigationAction('go_dashboard', {}, ctx)
      await waitForElement('.zuik-dashboard')
      return {
        success: true,
        message: 'Opening your dashboard to show execution history.',
      }
    }

    case 'dashboard_stats': {
      if (ctx.location.pathname !== '/dashboard') {
        await executeNavigationAction('go_dashboard', {}, ctx)
        await waitForElement('.zuik-stat-card')
      }

      const registered = pageContext.pageData
      if (registered && typeof registered.workflowCount === 'number') {
        const workflowCount = registered.workflowCount as number
        const totalExecutions = (registered.totalExecutions as number) ?? 0
        const agentCount = (registered.agentCount as number) ?? 0
        const parts = [
          `${workflowCount} saved workflow${workflowCount === 1 ? '' : 's'}`,
          totalExecutions > 0 ? `${totalExecutions} total executions` : null,
          agentCount > 0 ? `${agentCount} agent${agentCount === 1 ? '' : 's'}` : null,
        ].filter(Boolean)
        if (parts.length > 0) {
          return {
            success: true,
            message: `Dashboard: ${parts.join(', ')}.`,
            data: registered,
          }
        }
      }

      const workflows = readStat('Workflows') ?? readStat('Active')
      const executions = readStat('Executions')
      const successRate = readStat('Success')

      const parts = [
        workflows ? `Workflows: ${workflows}` : null,
        executions ? `Executions: ${executions}` : null,
        successRate ? `Success rate: ${successRate}` : null,
      ].filter(Boolean)

      if (parts.length === 0) {
        if (isConnectPromptVisible()) {
          return {
            success: true,
            message: 'Connect your wallet to view dashboard statistics.',
            requiresWallet: true,
          }
        }
        return { success: true, message: 'Dashboard stats are not visible yet.' }
      }

      return { success: true, message: parts.join('. ') + '.', data: { workflows, executions, successRate } }
    }

    case 'current_page':
      return {
        success: true,
        message: `You are on ${describePageContext(pageContext)}.`,
        data: pageContext,
      }

    case 'risk_tolerance': {
      const slider = document.querySelector('[data-testid="risk-slider"]') as HTMLInputElement | null
      if (slider) {
        return {
          success: true,
          message: `Your max token risk tolerance is set to ${slider.value}.`,
          data: { value: Number(slider.value) },
        }
      }

      await executeNavigationAction('go_settings_section', { section: 'risk' }, ctx)
      await waitForElement('[data-testid="risk-slider"]')
      const afterNav = document.querySelector('[data-testid="risk-slider"]') as HTMLInputElement | null
      if (afterNav) {
        return {
          success: true,
          message: `Your max token risk tolerance is set to ${afterNav.value}.`,
          data: { value: Number(afterNav.value) },
        }
      }

      return {
        success: false,
        message: 'Could not read risk tolerance. Open Settings, Risk management.',
      }
    }

    case 'help': {
      const suggestions = getSuggestions(pageContext)
      return {
        success: true,
        message: `You can try: ${suggestions.slice(0, 5).join('; ')}.`,
        data: { suggestions },
      }
    }

    default:
      return { success: false, message: `Unknown query action: ${action}.` }
  }
}
