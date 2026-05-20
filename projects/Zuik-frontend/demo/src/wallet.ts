import type { Page } from 'playwright'
import type { DemoConfig } from './config.js'
import type { DemoPresenter } from './visual/presenter.js'
import { SEL } from './selectors.js'
import { DemoError } from './errors.js'

export async function isWalletConnected(page: Page): Promise<boolean> {
  const connectBtn = page.locator(SEL.nav.connectWallet)
  return !(await connectBtn.isVisible().catch(() => false))
}

export async function promptWalletConnection(
  page: Page,
  presenter: DemoPresenter,
  config: DemoConfig,
): Promise<void> {
  if (config.skipWallet) {
    await presenter.banner('Skipping wallet (DEMO_SKIP_WALLET=true)')
    return
  }

  if (await isWalletConnected(page)) {
    await presenter.banner('Wallet already connected')
    return
  }

  await presenter.banner('Connect your wallet in the extension, then continue')
  const connectBtn = page.locator(SEL.nav.connectWallet)
  await presenter.safeClick(connectBtn, { label: 'Opening wallet picker...' })

  const preferKmd = process.env.DEMO_WALLET_PROVIDER === 'kmd'
  const preferPera = process.env.DEMO_WALLET_PROVIDER === 'pera'
  const kmd = page.locator(SEL.wallet.kmdConnect)
  const pera = page.locator(SEL.wallet.peraConnect)

  if (preferKmd && (await kmd.isVisible().catch(() => false))) {
    await presenter.safeClick(kmd, { label: 'LocalNet wallet (demo)', optional: true })
  } else if (preferPera && (await pera.isVisible().catch(() => false))) {
    await presenter.safeClick(pera, { label: 'Pera wallet', optional: true })
  } else {
    await presenter.banner('Choose your wallet provider in the modal')
  }

  const deadline = Date.now() + config.walletWaitMs
  while (Date.now() < deadline) {
    if (await isWalletConnected(page)) {
      const close = page.locator(SEL.wallet.close)
      if (await close.isVisible().catch(() => false)) {
        await close.click().catch(() => {})
      }
      await presenter.banner('Wallet connected')
      await presenter.wait(800)
      return
    }
    await page.waitForTimeout(1000)
  }

  throw new DemoError(
    'Wallet connection timed out.',
    'Connect manually via the navbar, set DEMO_SKIP_WALLET=true for UI-only demos, or increase DEMO_WALLET_WAIT_MS.',
  )
}
