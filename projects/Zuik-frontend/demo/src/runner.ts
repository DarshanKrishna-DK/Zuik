import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import type { DemoConfig } from './config.js'
import { formatDemoFailure } from './errors.js'
import { gotoApp } from './navigation.js'
import { startDevServer, stopDevServer, waitForUrl } from './server.js'
import { DemoPresenter } from './visual/presenter.js'
import type { ChildProcess } from 'node:child_process'

export type DemoFn = (ctx: DemoContext) => Promise<void>

export interface DemoContext {
  page: Page
  presenter: DemoPresenter
  config: DemoConfig
  screenshot: (name: string) => Promise<void>
  goto: (path: string) => Promise<void>
}

export async function runDemo(name: string, fn: DemoFn, config: DemoConfig): Promise<void> {
  let server: ChildProcess | null = null
  let browser: Browser | null = null

  console.log(`\n=== Zuik Demo: ${name} ===\n`)

  try {
    if (config.startServer) {
      console.log('[demo] Starting Vite dev server...')
      server = startDevServer()
      await waitForUrl(config.baseUrl)
      console.log(`[demo] App ready at ${config.baseUrl}`)
    } else {
      await waitForUrl(config.baseUrl, 15_000)
    }

    mkdirSync(config.screenshotDir, { recursive: true })

    browser = await chromium.launch({
      headless: config.headless,
      slowMo: config.slowMo,
    })

    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      recordVideo: config.headless
        ? undefined
        : { dir: join(config.screenshotDir, 'videos') },
    })

    const page = await context.newPage()
    page.setDefaultTimeout(config.defaultTimeoutMs)

    const presenter = new DemoPresenter(page)
    await presenter.initOverlay()

    const screenshot = async (shotName: string) => {
      const safe = shotName.replace(/[^a-z0-9-_]/gi, '-').toLowerCase()
      const file = join(config.screenshotDir, `${Date.now()}-${safe}.png`)
      await page.screenshot({ path: file, fullPage: false })
      console.log(`[demo] Screenshot: ${file}`)
    }

    const goto = async (path: string) => {
      const url = path.startsWith('http') ? path : `${config.baseUrl}${path}`
      await gotoApp(page, url)
    }

    await fn({ page, presenter, config, screenshot, goto })

    await screenshot('demo-complete')
    await presenter.banner('Demo complete')
    await presenter.wait(1500)

    console.log(`\n[demo] ${name} finished successfully.\n`)
  } catch (err) {
    console.error(`\n[demo] ${name} failed:\n${formatDemoFailure(err)}\n`)
    process.exitCode = 1
  } finally {
    if (browser) await browser.close().catch(() => {})
    await stopDevServer(server)
  }
}
