import type { Page } from 'playwright'
import type { DemoConfig } from '../config.js'
import type { DemoPresenter } from '../visual/presenter.js'
import { SEL } from '../selectors.js'
import { gotoApp, waitForAiResponse, waitForBuilderReady, waitForFlowNodes } from '../navigation.js'
import { promptWalletConnection } from '../wallet.js'

export interface BuilderDemoContext {
  page: Page
  presenter: DemoPresenter
  config: DemoConfig
  screenshot: (name: string) => Promise<void>
  goto: (path: string) => Promise<void>
}

export async function openBuilder(ctx: BuilderDemoContext): Promise<void> {
  await ctx.goto('/builder')
  await waitForBuilderReady(ctx.page)
  await ctx.screenshot('builder-loaded')
}

export async function ensureAiPanelOpen(page: Page, presenter: DemoPresenter): Promise<void> {
  const panel = page.locator(SEL.builder.chatPanel)
  if (await panel.isVisible().catch(() => false)) return
  const aiBtn = page.locator(SEL.builder.aiButton)
  await presenter.safeClick(aiBtn, { label: 'Opening AI workflow assistant...' })
  await page.waitForSelector(SEL.builder.chatPanel, { timeout: 15_000 })
}

export async function sendAiIntent(
  ctx: BuilderDemoContext,
  intent: string,
  options: {
    banner?: string
    screenshotAfterType?: string
    waitForNodes?: boolean
    minNodes?: number
  } = {},
): Promise<number> {
  const { page, presenter, screenshot } = ctx
  await ensureAiPanelOpen(page, presenter)

  const input = page.locator(SEL.builder.chatInput)
  await presenter.safeFill(input, intent, {
    label: options.banner ?? 'Describing automation in plain language...',
  })
  if (options.screenshotAfterType) await screenshot(options.screenshotAfterType)

  await presenter.safeClick(page.locator(SEL.builder.chatSend), {
    label: 'Generating workflow from intent...',
  })

  await presenter.banner('Waiting for AI response and canvas update...')
  await waitForAiResponse(page)

  if (options.waitForNodes === false) {
    return page.locator(SEL.builder.flowNode).count()
  }

  const minNodes = options.minNodes ?? 1
  const count = await waitForFlowNodes(page, minNodes, 50_000)
  if (count >= minNodes) {
    await presenter.banner(`Workflow materialized with ${count} block(s)`)
    await page.locator(SEL.builder.flowNode).first().scrollIntoViewIfNeeded()
  } else {
    await presenter.banner('AI may be unavailable - showing manual builder instead')
    const templateBtn = page.getByRole('button', { name: /Templates/i })
    if (await templateBtn.isVisible().catch(() => false)) {
      await presenter.safeClick(templateBtn, { label: 'Opening workflow templates', optional: true })
      await page.waitForTimeout(2000)
    }
  }
  return count
}

export async function runBuilderIntro(ctx: BuilderDemoContext): Promise<void> {
  await openBuilder(ctx)
  await promptWalletConnection(ctx.page, ctx.presenter, ctx.config)
  await ensureAiPanelOpen(ctx.page, ctx.presenter)
}

export async function highlightFirstNode(page: Page, presenter: DemoPresenter): Promise<void> {
  const box = await page.locator(SEL.builder.flowNode).first().boundingBox()
  if (box) {
    await page.evaluate(
      ({ x, y }) => window.__zuikDemoOverlay?.moveCursor(x, y),
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    )
  }
  await presenter.wait(1200)
}

/** Navigate directly when market polling would hang on goto networkidle. */
export async function gotoBuilderFromMarket(page: Page, baseUrl: string): Promise<void> {
  await gotoApp(page, `${baseUrl}/builder`)
  await waitForBuilderReady(page)
}
