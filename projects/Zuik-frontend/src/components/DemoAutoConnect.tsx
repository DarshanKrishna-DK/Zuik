import { useEffect, useRef } from 'react'
import { useWallet, WalletId } from '@txnlab/use-wallet-react'

export default function DemoAutoConnect() {
  const { wallets, activeAddress, isReady } = useWallet()
  const attempted = useRef(false)

  useEffect(() => {
    if (import.meta.env.VITE_DEMO_AUTO_WALLET !== 'true') return
    if (!isReady || attempted.current || activeAddress) return

    const mnemonicWallet = wallets?.find((w) => w.id === WalletId.MNEMONIC)
    if (!mnemonicWallet) return

    attempted.current = true
    void mnemonicWallet.connect().catch(() => {
      attempted.current = false
    })
  }, [wallets, activeAddress, isReady])

  return null
}
