import type { DemoFn } from '../runner.js'
import {
  highlightFirstNode,
  runBuilderIntro,
  sendAiIntent,
} from './builder-shared.js'

/** Step 1: AI builds a simple single-trigger workflow (wallet event). */
export const aiWorkflowDemo: DemoFn = async (ctx) => {
  const { presenter, config, screenshot } = ctx

  await presenter.banner('Step 1: Describe automation in plain language')
  await runBuilderIntro(ctx)

  const count = await sendAiIntent(ctx, config.scenarios.aiWorkflow.intent, {
    banner: 'Single-agent workflow: wallet trigger and swap...',
    screenshotAfterType: 'intent-typed',
    minNodes: 1,
  })

  if (count > 0) await highlightFirstNode(ctx.page, presenter)
  await screenshot('workflow-result')
  await presenter.banner('Simple workflow ready - next: extend with multi-agent triggers')
  await presenter.wait(2000)
}
