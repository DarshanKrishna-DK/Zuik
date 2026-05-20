import type { DemoFn } from '../runner.js'
import { SEL } from '../selectors.js'
import { promptWalletConnection } from '../wallet.js'

export const guardianDemo: DemoFn = async ({ page, presenter, config, screenshot, goto }) => {
  await presenter.banner('Step 3: On-chain Guardian spend limits for agents')
  await goto('/settings?section=guardian')
  await screenshot('settings-loaded')

  await promptWalletConnection(page, presenter, config)

  const guardian = page.locator(SEL.guardian.section)
  await guardian.scrollIntoViewIfNeeded()
  await presenter.highlightSelector('[data-testid="guardian-settings"]')
  await presenter.banner('Guardian enforces on-chain daily spend limits for agents')
  await screenshot('guardian-section')

  const notConfigured = page.locator('.guardian-settings__banner-warn')
  if (await notConfigured.isVisible().catch(() => false)) {
    await presenter.banner(
      'Guardian contract not configured for this network. Set VITE_GUARDIAN_APP_ID in .env.local.',
    )
    await screenshot('guardian-not-configured')
    return
  }

  const optIn = page.locator(SEL.guardian.optIn)
  if (await optIn.isVisible().catch(() => false)) {
    await presenter.safeClick(optIn, {
      label: 'Agent opt-in (approve in wallet if prompted)',
      optional: true,
    })
    await presenter.wait(3000)
  }

  const agentField = page.locator(SEL.guardian.agentAddress)
  if (await agentField.isVisible().catch(() => false)) {
    const demoAgent = process.env.DEMO_GUARDIAN_AGENT_ADDRESS
    if (demoAgent) {
      await presenter.safeFill(agentField, demoAgent, { label: 'Agent wallet address' })
    } else {
      await presenter.banner('Paste your agent address in Settings to register limits (demo paused)')
      await screenshot('guardian-register-form')
      return
    }

    const cap = config.scenarios.guardian.dailyCapAlgo
    await presenter.safeFill(page.locator(SEL.guardian.dailyCap), cap, { label: 'Daily ALGO cap' })

    const refresh = page.locator(SEL.guardian.refreshStatus)
    await presenter.safeClick(refresh, { label: 'Checking agent status', optional: true })
    await screenshot('guardian-agent-status')

    const register = page.locator(SEL.guardian.register)
    await presenter.safeClick(register, {
      label: 'Register agent (confirm in wallet)',
      optional: true,
    })
    await presenter.wait(4000)
  }

  await screenshot('guardian-complete')
}
