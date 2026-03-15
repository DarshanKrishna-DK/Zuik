import { useState } from 'react'
import { useWallet, Wallet, WalletId } from '@txnlab/use-wallet-react'
import { Wallet as WalletIcon, X, Copy, ExternalLink, Check } from 'lucide-react'
import Account from './Account'

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
    <div
      className="modal modal-open"
      style={{
        position: 'fixed',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        backdropFilter: 'blur(4px)',
      }}
      onClick={handleBackdropClick}
    >
      <div
        className="modal-box"
        style={{
          margin: 'auto',
          background: 'var(--zuik-surface)',
          border: '1px solid var(--zuik-border)',
          borderRadius: '12px',
          width: '28em',
          maxWidth: '90vw',
          padding: '24px',
          color: 'var(--zuik-text)',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          aria-label="Close"
          data-test-id="close-wallet-modal"
          onClick={closeModal}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: '1px solid var(--zuik-border)',
            borderRadius: '8px',
            color: 'var(--zuik-text-muted)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--zuik-surface-2)'
            e.currentTarget.style.color = 'var(--zuik-text)'
            e.currentTarget.style.borderColor = 'var(--zuik-border)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--zuik-text-muted)'
            e.currentTarget.style.borderColor = 'var(--zuik-border)'
          }}
        >
          <X size={18} strokeWidth={2} />
        </button>

        {activeAddress ? (
          /* Connected state */
          <div style={{ paddingRight: '36px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '20px',
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: 'rgba(249, 115, 22, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--zuik-orange)',
                }}
              >
                <WalletIcon size={22} strokeWidth={2} />
              </div>
              <span
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  color: 'var(--zuik-text)',
                }}
              >
                Wallet Connected
              </span>
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
              style={{
                width: '100%',
                marginTop: '20px',
                padding: '10px 16px',
                background: 'var(--zuik-error)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#DC2626'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--zuik-error)'
              }}
            >
              Disconnect
            </button>
          </div>
        ) : (
          /* Not connected – wallet grid */
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '20px',
                paddingRight: '36px',
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: 'rgba(249, 115, 22, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--zuik-orange)',
                }}
              >
                <WalletIcon size={22} strokeWidth={2} />
              </div>
              <span
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  color: 'var(--zuik-text)',
                }}
              >
                Connect Wallet
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                gap: '12px',
              }}
            >
              {wallets?.map((wallet) => (
                <button
                  key={`provider-${wallet.id}`}
                  data-test-id={`${wallet.id}-connect`}
                  onClick={() => wallet.connect()}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '16px 12px',
                    background: 'var(--zuik-surface-2)',
                    border: '1px solid var(--zuik-border)',
                    borderRadius: '10px',
                    color: 'var(--zuik-text)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--zuik-border)'
                    e.currentTarget.style.borderColor = 'var(--zuik-text-dim)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--zuik-surface-2)'
                    e.currentTarget.style.borderColor = 'var(--zuik-border)'
                  }}
                >
                  {!isKmd(wallet) ? (
                    <img
                      src={wallet.metadata.icon}
                      alt={wallet.metadata.name}
                      style={{
                        width: '32px',
                        height: '32px',
                        objectFit: 'contain',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: 'var(--zuik-border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--zuik-text-muted)',
                      }}
                    >
                      <WalletIcon size={18} strokeWidth={2} />
                    </div>
                  )}
                  <span
                    style={{
                      fontSize: '0.8125rem',
                      fontWeight: 500,
                      textAlign: 'center',
                    }}
                  >
                    {isKmd(wallet) ? 'LocalNet Wallet' : wallet.metadata.name}
                  </span>
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
