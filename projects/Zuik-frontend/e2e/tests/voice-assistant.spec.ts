import { test, expect } from '@playwright/test'

test.describe('Voice assistant integration', () => {
  test('renders floating voice assistant on landing page', async ({ page }) => {
    await page.goto('/')
    const bubble = page.getByTestId('voice-assistant-bubble')
    await expect(bubble).toBeVisible()
    await expect(bubble).toHaveAttribute('aria-label', /voice assistant/i)
  })

  test('expands panel and shows conversation UI', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('voice-assistant-bubble').click()
    await expect(page.getByTestId('voice-assistant-panel')).toBeVisible()
    await expect(page.getByTestId('voice-assistant-status')).toBeVisible()
    await expect(page.getByTestId('voice-assistant-transcript')).toBeVisible()
  })

  test('persists voice assistant across navigation to builder', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('voice-assistant-root')).toBeVisible()
    await page.goto('/builder')
    await expect(page.getByTestId('voice-assistant-bubble')).toBeVisible()
  })

  test('does not break settings page layout', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByTestId('voice-assistant-bubble')).toBeVisible()
    await expect(page.locator('body')).toBeVisible()
  })
})
