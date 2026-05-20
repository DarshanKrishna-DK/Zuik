import type { DemoFn } from '../runner.js'
import { SEL } from '../selectors.js'
import { aiWorkflowDemo } from './ai-workflow.js'
import { aiEditDemo } from './ai-edit.js'
import { guardianDemo } from './guardian.js'
import { logicSigDemo } from './logicsig.js'

const STORY = [
  { title: 'AI workflow generation', run: aiWorkflowDemo },
  { title: 'AI workflow editing', run: aiEditDemo },
  { title: 'Guardian on-chain limits', run: guardianDemo },
  { title: 'LogicSig delegation', run: logicSigDemo },
] as const

/** End-to-end story: simple AI workflow -> multi-agent edit -> protection -> automation. */
export const fullDemo: DemoFn = async (ctx) => {
  const { presenter, screenshot, goto, page } = ctx

  await goto('/')
  await presenter.banner('Zuik - AI-powered multi-agent DeFi automation on Algorand')
  await screenshot('landing')
  await presenter.wait(2000)

  const start = page.locator(SEL.landing.startBuilding)
  if (await start.isVisible().catch(() => false)) {
    await presenter.safeClick(start, { label: 'Start building', optional: true })
    await page.waitForURL(/\/builder/, { timeout: 20_000 }).catch(() => goto('/builder'))
  } else {
    await goto('/builder')
  }

  for (let i = 0; i < STORY.length; i++) {
    const step = STORY[i]
    await presenter.banner(`Chapter ${i + 1} of ${STORY.length}: ${step.title}`)
    await step.run(ctx)
    if (i < STORY.length - 1) await presenter.wait(1200)
  }

  await goto('/dashboard')
  await presenter.banner('Dashboard - saved workflows and execution history')
  await page.waitForTimeout(2500)
  await screenshot('full-dashboard')

  await presenter.banner('Full story complete: build, evolve, protect, and automate with Zuik')
}
