import { useState } from 'react'
import { useWallet, Wallet, WalletId } from '@txnlab/use-wallet-react'
import Account from './Account'

function WalletIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </svg>
  )
}

function XIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  )
}

interface ConnectWalletInterface {
  openModal: boolean
  closeModal: () => void
}

const ConnectWallet = ({ openModal, closeModal }: ConnectWalletInterface) => {
  const { wallets, activeAddress } = useWallet()
  const [copied, setCopied] = useState(false)

  const isKmd = (wallet: Wallet) => wallet.id === WalletId.KMD

  const handleCopyAddress = async () => {
    if (!activeAddress) return
    await navigator.clipboard.writeText(activeAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) closeModal()
  }

  if (!openModal) return null

  return (
    <div className="z-modal-backdrop" onClick={handleBackdropClick}>
      <div className="z-modal-box" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          aria-label="Close"
          data-test-id="close-wallet-modal"
          onClick={closeModal}
          className="z-modal-close"
        >
          <XIcon />
        </button>

        {activeAddress ? (
          <div style={{ paddingRight: '36px' }}>
            <div className="z-modal-title-row">
              <div className="z-modal-icon-wrap">
                <WalletIcon />
              </div>
              <span className="z-modal-title">Wallet Connected</span>
            </div>

            <Account onCopyAddress={handleCopyAddress} copied={copied} />

            <button
              data-test-id="logout"
              onClick={async () => {
                if (wallets) {
                  const activeWallet = wallets.find((w) => w.isActive)
                  if (activeWallet) {
                    await activeWallet.disconnect()
                  } else {
                    localStorage.removeItem('@txnlab/use-wallet:v3')
                    window.location.reload()
                  }
                }
                closeModal()
              }}
              className="z-btn z-btn-danger"
              style={{ width: '100%', marginTop: '20px', justifyContent: 'center' }}
            >
              Disconnect
            </button>
          </div>
        ) : (
          <>
            <div className="z-modal-title-row" style={{ paddingRight: '36px' }}>
              <div className="z-modal-icon-wrap">
                <WalletIcon />
              </div>
              <span className="z-modal-title">Connect Wallet</span>
            </div>

            <div className="z-wallet-grid">
              {wallets?.map((wallet) => (
                <button
                  key={`provider-${wallet.id}`}
                  data-test-id={`${wallet.id}-connect`}
                  onClick={() => wallet.connect()}
                  className="z-wallet-option"
                >
                  {!isKmd(wallet) ? (
                    <img
                      src={wallet.metadata.icon}
                      alt={wallet.metadata.name}
                      style={{ width: '32px', height: '32px', objectFit: 'contain' }}
                    />
                  ) : (
                    <div className="z-wallet-kmd-icon">
                      <WalletIcon size={18} />
                    </div>
                  )}
                  <span>{isKmd(wallet) ? 'LocalNet Wallet' : wallet.metadata.name}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default ConnectWallet
