import type { Locator, Page } from 'playwright'
import { DemoError } from '../errors.js'
import { DEMO_OVERLAY_INIT } from './overlay.js'

export class DemoPresenter {
  private overlayReady = false

  constructor(private readonly page: Page) {}

  async initOverlay(): Promise<void> {
    if (this.overlayReady) return
    await this.page.addInitScript(DEMO_OVERLAY_INIT)
    this.overlayReady = true
  }

  async banner(text: string): Promise<void> {
    await this.page.evaluate((t) => window.__zuikDemoOverlay?.banner(t), text)
  }

  async highlightSelector(selector: string): Promise<boolean> {
    return this.page.evaluate((sel) => window.__zuikDemoOverlay?.highlight(sel) ?? false, selector)
  }

  async clearHighlight(): Promise<void> {
    await this.page.evaluate(() => window.__zuikDemoOverlay?.clearHighlight())
  }

  async moveToLocator(locator: Locator): Promise<void> {
    const box = await locator.boundingBox()
    if (!box) return
    await this.page.evaluate(
      ({ x, y }) => window.__zuikDemoOverlay?.moveCursor(x, y),
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    )
  }

  async clickWithPresentation(locator: Locator, label?: string): Promise<void> {
    await locator.scrollIntoViewIfNeeded()
    await this.moveToLocator(locator)
    if (label) await this.banner(label)
    await this.page.waitForTimeout(400)
    await locator.click()
    await this.page.waitForTimeout(300)
  }

  async typeNaturally(locator: Locator, text: string, delayMs = 45): Promise<void> {
    await locator.scrollIntoViewIfNeeded()
    await this.moveToLocator(locator)
    await locator.click()
    await locator.fill('')
    for (const char of text) {
      await locator.pressSequentially(char, { delay: delayMs })
    }
  }

  async wait(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms)
  }

  async safeClick(
    locator: Locator,
    options: { label?: string; timeout?: number; optional?: boolean } = {},
  ): Promise<boolean> {
    const timeout = options.timeout ?? 15_000
    try {
      await locator.waitFor({ state: 'visible', timeout })
      await this.clickWithPresentation(locator, options.label)
      return true
    } catch (err) {
      if (options.optional) return false
      throw new DemoError(
        `Could not click: ${locator}`,
        'Confirm the app is on the expected page and a wallet is connected if required.',
        err,
      )
    }
  }

  async safeFill(
    locator: Locator,
    value: string,
    options: { label?: string; timeout?: number } = {},
  ): Promise<void> {
    const timeout = options.timeout ?? 15_000
    try {
      await locator.waitFor({ state: 'visible', timeout })
      if (options.label) await this.banner(options.label)
      await this.typeNaturally(locator, value)
    } catch (err) {
      throw new DemoError(
        `Could not fill input: ${locator}`,
        'Check that Settings or the form is visible and try again.',
        err,
      )
    }
  }
}

declare global {
  interface Window {
    __zuikDemoOverlay?: {
      moveCursor: (x: number, y: number) => void
      hideCursor: () => void
      highlight: (selector: string) => boolean
      clearHighlight: () => void
      banner: (text: string) => void
    }
  }
}
