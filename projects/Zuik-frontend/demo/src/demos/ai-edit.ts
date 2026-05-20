import type { DemoFn } from '../runner.js'
import {
  highlightFirstNode,
  runBuilderIntro,
  sendAiIntent,
} from './builder-shared.js'

/** Step 2: AI extends the canvas to multi-trigger / multi-agent automation. */
export const aiEditDemo: DemoFn = async (ctx) => {
  const { presenter, config, screenshot } = ctx

  await presenter.banner('Step 2: Evolve the workflow with AI editing')
  await runBuilderIntro(ctx)

  await sendAiIntent(ctx, config.scenarios.aiWorkflow.intent, {
    banner: 'Starting from a simple wallet-trigger workflow...',
    screenshotAfterType: 'edit-initial-intent',
    minNodes: 1,
  })
  await screenshot('edit-before-evolve')

  const count = await sendAiIntent(ctx, config.scenarios.aiEdit.editIntent, {
    banner: 'Adding timer loop, spawn agents, and alerts...',
    screenshotAfterType: 'edit-follow-up-typed',
    minNodes: 2,
  })

  if (count > 0) await highlightFirstNode(ctx.page, presenter)
  await screenshot('edit-workflow-result')
  await presenter.banner('Multi-agent workflow ready - next: Guardian and LogicSig protection')
  await presenter.wait(2000)
}
