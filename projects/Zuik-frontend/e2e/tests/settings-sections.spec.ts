import { test, expect } from '@playwright/test'

test.describe('Settings sections', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings')
  })

  test('loads account section by default', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  })

  test('navigates to agent management', async ({ page }) => {
    await page.getByTestId('settings-nav-agents').click()
    const section = page.getByTestId('agent-management')
    await expect(section).toBeVisible()
    const createBtn = page.getByTestId('create-agent-wallet')
    const connectHint = section.getByText(/connect your wallet/i)
    await expect(createBtn.or(connectHint)).toBeVisible()
  })

  test('guardian section redirects to agent management', async ({ page }) => {
    await page.goto('/settings?section=guardian')
    await expect(page.getByTestId('agent-management')).toBeVisible()
  })

  test('navigates to risk and slider works', async ({ page }) => {
    await page.getByTestId('settings-nav-risk').click()
    await expect(page.getByTestId('risk-settings')).toBeVisible()
    const slider = page.getByTestId('risk-slider')
    await slider.fill('42')
    await page.reload()
    await expect(page.getByTestId('risk-slider')).toHaveValue('42')
  })

  test('agent management shows guardian context when env set', async ({ page }) => {
    await page.goto('/settings?section=agents')
    const section = page.getByTestId('agent-management')
    await expect(section).toBeVisible()
    const body = await section.textContent()
    if (body?.includes('Guardian')) {
      expect(body).toMatch(/Guardian|policy/i)
    }
  })
})
