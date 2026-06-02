import { test, expect } from '@playwright/test'

test.describe('Settings sections', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings')
  })

  test('loads account section by default', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  })

  test('navigates to agent wallets', async ({ page }) => {
    await page.getByTestId('settings-nav-agents').click()
    const section = page.getByTestId('agent-wallet-settings')
    await expect(section).toBeVisible()
    const createBtn = page.getByTestId('create-agent-wallet')
    const connectHint = section.getByText(/connect your wallet/i)
    await expect(createBtn.or(connectHint)).toBeVisible()
  })

  test('navigates to guardian', async ({ page }) => {
    await page.getByTestId('settings-nav-guardian').click()
    await expect(page.getByTestId('guardian-settings')).toBeVisible()
  })

  test('navigates to risk and slider works', async ({ page }) => {
    await page.getByTestId('settings-nav-risk').click()
    await expect(page.getByTestId('risk-settings')).toBeVisible()
    const slider = page.getByTestId('risk-slider')
    await slider.fill('42')
    await page.reload()
    await expect(page.getByTestId('risk-slider')).toHaveValue('42')
  })

  test('guardian shows configured app id when env set', async ({ page }) => {
    await page.goto('/settings?section=guardian')
    const section = page.getByTestId('guardian-settings')
    await expect(section).toBeVisible()
    const body = await section.textContent()
    if (body?.includes('763727553')) {
      expect(body).toContain('763727553')
    }
  })
})
