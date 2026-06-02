import { test, expect } from '@playwright/test'
import { GUARDIAN_APP_ID, TEST_RECIPIENT } from '../fixtures/constants.js'

/**
 * Wallet-connected Guardian flows require Pera/Defly approval.
 * Skip in CI unless E2E_WALLET_CONNECTED=1 and a human is ready to sign.
 */
const walletConnected = process.env.E2E_WALLET_CONNECTED === '1'

test.describe('Guardian wallet flows @wallet', () => {
  test.skip(!walletConnected, 'Set E2E_WALLET_CONNECTED=1 and connect wallet manually')

  test.beforeEach(async ({ page }) => {
    await page.goto('/settings?section=guardian')
    await expect(page.getByTestId('guardian-settings')).toBeVisible()
  })

  test('bootstrap form accepts minimal policy values', async ({ page }) => {
    const agent = process.env.E2E_AGENT_ADDRESS
    test.skip(!agent, 'Set E2E_AGENT_ADDRESS to the funded agent public address')

    await page.getByLabel(/agent/i).first().fill(agent!)
    await page.getByLabel(/max per trade/i).fill('0.1')
    await page.getByLabel(/daily cap/i).fill('0.2')
    await page.getByTestId('guardian-bootstrap').click()
    await expect(page.locator('.feedback-message, [class*="Feedback"]')).toBeVisible({
      timeout: 120_000,
    })
  })

  test('allow recipient form uses test recipient', async ({ page }) => {
    const agent = process.env.E2E_AGENT_ADDRESS
    test.skip(!agent, 'Set E2E_AGENT_ADDRESS')

    await page.getByTestId('settings-nav-guardian').click()
    await page.getByRole('button', { name: /recipient/i }).click().catch(() => {})
    await page.goto('/settings?section=guardian')
    const recipientField = page.getByLabel(/recipient/i).last()
    await recipientField.fill(TEST_RECIPIENT)
    await page.getByTestId('guardian-allow-recipient').click()
    await expect(page.getByText(/success|allowed/i)).toBeVisible({ timeout: 120_000 })
  })
})

test.describe('Guardian env', () => {
  test('documents expected app id constant', () => {
    expect(GUARDIAN_APP_ID).toBe(763727553)
    expect(TEST_RECIPIENT).toHaveLength(58)
  })
})
