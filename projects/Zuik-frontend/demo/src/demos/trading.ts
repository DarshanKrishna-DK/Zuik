import type { DemoFn } from '../runner.js'
import { SEL } from '../selectors.js'
import { gotoApp, waitForBuilderReady } from '../navigation.js'
import { ensureAiPanelOpen, sendAiIntent } from './builder-shared.js'
import { promptWalletConnection } from '../wallet.js'

/** Market explorer to swap workflow (optional segment; uses safe navigation). */
export const tradingDemo: DemoFn = async ({ page, presenter, config, screenshot, goto }) => {
  const asset = config.scenarios.trading.marketAsset
  const marketUrl = `${config.baseUrl}/market?asset=${asset}`

  await presenter.banner('Market context for DeFi strategies')
  await gotoApp(page, marketUrl)
  await page.waitForSelector('.market-explorer, .market-card, main', {
    state: 'visible',
    timeout: 20_000,
  }).catch(() => {})
  await page.waitForTimeout(2000)
  await screenshot('market-explorer')

  await promptWalletConnection(page, presenter, config)

  const tradeBtn = page.locator(SEL.market.tradeButton)
  if (await tradeBtn.isVisible().catch(() => false)) {
    await presenter.safeClick(tradeBtn, { label: 'Opening builder with swap intent...' })
    await page.waitForURL(/\/builder/, { timeout: 20_000 })
  } else {
    await presenter.banner('Opening builder for trading workflow')
    await goto('/builder')
  }

  await waitForBuilderReady(page)
  await page.waitForTimeout(1000)
  await screenshot('trading-builder')

  await ensureAiPanelOpen(page, presenter)

  const ctx = { page, presenter, config, screenshot, goto }
  await sendAiIntent(ctx, config.scenarios.trading.swapIntent, {
    banner: 'Building automated swap workflow...',
    minNodes: 1,
  })

  const runBtn = page.getByRole('button', { name: /Run Workflow/i })
  if (await runBtn.isVisible().catch(() => false)) {
    await presenter.safeClick(runBtn, {
      label: 'Opening simulation panel (wallet may be required)',
      optional: true,
    })
    await page.waitForTimeout(2500)
    await screenshot('trading-simulation')
  }

  await screenshot('trading-complete')
}
