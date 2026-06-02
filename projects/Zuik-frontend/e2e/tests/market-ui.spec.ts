import { test, expect } from '@playwright/test'

test.describe('Market explorer', () => {
  test('quick swap card visible', async ({ page }) => {
    await page.goto('/market')
    await expect(page.getByTestId('market-quick-swap')).toBeVisible({ timeout: 30_000 })
  })
})
