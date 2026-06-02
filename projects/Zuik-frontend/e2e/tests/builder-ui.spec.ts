import { test, expect } from '@playwright/test'

test.describe('Builder UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/builder')
  })

  test('renders flow canvas and execution controls', async ({ page }) => {
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('execution-mode-selector')).toBeVisible()
  })

  test('AI assistant panel is present', async ({ page }) => {
    await expect(page.getByTestId('builder-ai-assistant')).toBeVisible()
  })

  test('builder route is reachable from home', async ({ page }) => {
    await page.goto('/')
    await page.goto('/builder')
    await expect(page.locator('.react-flow')).toBeVisible()
  })

  test('navbar opens builder without wallet', async ({ page }) => {
    // App navbar (Builder link) is hidden on landing; use any in-app route first.
    await page.goto('/market')
    await expect(page.getByTestId('nav-connect-wallet')).toBeVisible()
    await page.getByRole('link', { name: 'Builder' }).click()
    await expect(page).toHaveURL(/\/builder/)
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 30_000 })
  })
})
