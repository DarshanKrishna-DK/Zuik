import type { Page } from 'playwright'
import { SEL } from './selectors.js'

/** Market and builder pages keep polling; avoid networkidle hangs. */
export async function gotoApp(page: Page, url: string, timeoutMs = 45_000): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
  await page.waitForSelector('body', { state: 'attached', timeout: 10_000 })
  await page.waitForLoadState('load').catch(() => {})
  await page.waitForTimeout(400)
}

export async function waitForBuilderReady(page: Page, timeoutMs = 20_000): Promise<void> {
  await page.waitForSelector(SEL.builder.reactFlow, { state: 'visible', timeout: timeoutMs })
}

export async function waitForFlowNodes(
  page: Page,
  minCount = 1,
  timeoutMs = 45_000,
): Promise<number> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const count = await page.locator(SEL.builder.flowNode).count()
    if (count >= minCount) return count
    await page.waitForTimeout(500)
  }
  return page.locator(SEL.builder.flowNode).count()
}

export async function waitForAiResponse(page: Page, timeoutMs = 90_000): Promise<void> {
  const typing = page.locator(`${SEL.builder.chatPanel} .zuik-chat-typing`)
  if (await typing.isVisible().catch(() => false)) {
    await typing.waitFor({ state: 'hidden', timeout: timeoutMs }).catch(() => {})
  }
  const sendBtn = page.locator(SEL.builder.chatSend)
  await sendBtn.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(600)
}
