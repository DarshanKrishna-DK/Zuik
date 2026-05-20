import type { DemoFn } from '../runner.js'
import { SEL } from '../selectors.js'
import { promptWalletConnection } from '../wallet.js'

export const logicSigDemo: DemoFn = async ({ page, presenter, config, screenshot, goto }) => {
  await presenter.banner('Step 4: LogicSig delegation for hands-off automation')
  await goto('/settings?section=automation')
  await screenshot('settings-loaded')

  await promptWalletConnection(page, presenter, config)

  const card = page.locator(SEL.settings.delegationCard)
  await card.scrollIntoViewIfNeeded()
  await presenter.highlightSelector('[data-testid="settings-delegation"]')
  await presenter.banner('LogicSig delegation lets agents sign within your limits')
  await screenshot('delegation-section')

  const sbWarning = page.getByText(/Enable cloud sync/i)
  if (await sbWarning.isVisible().catch(() => false)) {
    await presenter.banner('Supabase required to persist delegation - configure VITE_SUPABASE_URL')
    await screenshot('delegation-needs-supabase')
    return
  }

  const activeVault = page.getByText(/Turn Off Automation Permission|Status.*Active/i)
  if (await activeVault.first().isVisible().catch(() => false)) {
    await presenter.banner('Existing automation permission found')
    await screenshot('delegation-active')
    return
  }

  const { maxPerTrade, dailyCap, expiryDays } = config.scenarios.logicSig

  await presenter.safeFill(
    page.locator(SEL.settings.maxPerTrade),
    maxPerTrade,
    { label: 'Max per trade' },
  )
  await presenter.safeFill(
    page.locator(SEL.settings.dailyCap),
    dailyCap,
    { label: 'Daily cap' },
  )

  const expiryInput = page.locator('[data-testid="delegation-expiry-days"]')
  if (await expiryInput.isVisible().catch(() => false)) {
    await presenter.safeFill(expiryInput, expiryDays, { label: 'Permission expiry (days)' })
  }

  await screenshot('delegation-form-filled')

  const createBtn = page.locator(SEL.settings.createDelegation)
  await presenter.safeClick(createBtn, {
    label: 'Create permission (sign in wallet)',
    optional: true,
  })

  await presenter.wait(5000)
  await screenshot('delegation-complete')
}
