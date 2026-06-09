import type { SettingsSectionId } from '../../../components/settings/types'
import type { ActionContext, ActionResult } from '../commandTypes'
import { clickTestId, waitForElement } from '../domUtils'

function settingsPath(section?: SettingsSectionId): string {
  return section ? `/settings?section=${section}` : '/settings'
}

export async function executeNavigationAction(
  action: string,
  params: Record<string, unknown>,
  ctx: ActionContext,
): Promise<ActionResult> {
  switch (action) {
    case 'go_home':
      ctx.navigate('/')
      return { success: true, message: 'Opening the landing page.' }

    case 'go_builder':
      ctx.navigate('/builder')
      return { success: true, message: 'Opening the workflow builder.' }

    case 'go_market':
      ctx.navigate('/market')
      return { success: true, message: 'Opening the market explorer.' }

    case 'go_dashboard': {
      if (!ctx.activeAddress) {
        ctx.navigate('/dashboard')
        return {
          success: true,
          message: 'Opening your dashboard. Connect your wallet to see workflow data.',
          requiresWallet: true,
        }
      }
      ctx.navigate('/dashboard')
      return { success: true, message: 'Opening your dashboard.' }
    }

    case 'go_settings':
      ctx.navigate('/settings')
      return { success: true, message: 'Opening settings.' }

    case 'go_settings_section': {
      const section = (params.section as SettingsSectionId) ?? 'account'
      ctx.navigate(settingsPath(section))
      await waitForElement(`[data-testid="settings-nav-${section}"]`)
      clickTestId(`settings-nav-${section}`)
      return {
        success: true,
        message: `Opening ${section} settings.`,
      }
    }

    case 'connect_wallet': {
      if (ctx.activeAddress) {
        return { success: true, message: 'Your wallet is already connected.' }
      }
      if (ctx.openWalletModal) {
        ctx.openWalletModal()
        return { success: true, message: 'Opening the wallet connection dialog.' }
      }
      const clicked = clickTestId('nav-connect-wallet')
      return clicked
        ? { success: true, message: 'Opening the wallet connection dialog.' }
        : { success: false, message: 'Connect wallet is not available on this page.' }
    }

    case 'go_market_asset': {
      const assetId = String(params.assetId ?? '0')
      ctx.navigate(`/market?asset=${encodeURIComponent(assetId)}`)
      return { success: true, message: `Showing market data for asset ${assetId}.` }
    }

    default:
      return { success: false, message: `Unknown navigation action: ${action}.` }
  }
}
