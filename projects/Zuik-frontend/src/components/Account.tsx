import { useWallet } from '@txnlab/use-wallet-react'
import { useMemo } from 'react'
import { Copy, ExternalLink, Check } from 'lucide-react'
import { getAlgodConfigFromViteEnvironment } from '../utils/network/getAlgoClientConfigs'

interface AccountProps {
  onCopyAddress?: () => void
  copied?: boolean
}

const Account = ({ onCopyAddress, copied = false }: AccountProps) => {
  const { activeAddress } = useWallet()
  const algoConfig = getAlgodConfigFromViteEnvironment()

  const networkName = useMemo(() => {
    return algoConfig.network === '' ? 'localnet' : algoConfig.network.toLocaleLowerCase()
  }, [algoConfig.network])

  const explorerUrl = activeAddress
    ? `https://lora.algokit.io/${networkName}/account/${activeAddress}/`
    : '#'

  if (!activeAddress) return null

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {/* Address with copy */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 12px',
          background: 'var(--zuik-bg)',
          border: '1px solid var(--zuik-border)',
          borderRadius: '8px',
        }}
      >
        <code
          style={{
            flex: 1,
            fontSize: '0.8125rem',
            fontFamily: 'ui-monospace, monospace',
            color: 'var(--zuik-text)',
            wordBreak: 'break-all',
          }}
        >
          {activeAddress}
        </code>
        {onCopyAddress && (
          <button
            type="button"
            onClick={onCopyAddress}
            aria-label="Copy address"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              padding: 0,
              background: copied ? 'var(--zuik-success)' : 'var(--zuik-surface-2)',
              border: '1px solid var(--zuik-border)',
              borderRadius: '6px',
              color: copied ? 'white' : 'var(--zuik-text-muted)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              if (!copied) {
                e.currentTarget.style.background = 'var(--zuik-border)'
                e.currentTarget.style.color = 'var(--zuik-text)'
              }
            }}
            onMouseLeave={(e) => {
              if (!copied) {
                e.currentTarget.style.background = 'var(--zuik-surface-2)'
                e.currentTarget.style.color = 'var(--zuik-text-muted)'
              }
            }}
          >
            {copied ? (
              <Check size={16} strokeWidth={2.5} />
            ) : (
              <Copy size={16} strokeWidth={2} />
            )}
          </button>
        )}
      </div>
      {copied && (
        <span
          style={{
            fontSize: '0.75rem',
            color: 'var(--zuik-success)',
            marginTop: '-4px',
          }}
        >
          Copied!
        </span>
      )}

      {/* Network */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.875rem',
        }}
      >
        <span style={{ color: 'var(--zuik-text-muted)' }}>Network</span>
        <span
          style={{
            color: 'var(--zuik-text)',
            fontWeight: 500,
            textTransform: 'capitalize',
          }}
        >
          {networkName}
        </span>
      </div>

      {/* Lora explorer link */}
      <a
        href={explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '0.875rem',
          fontWeight: 500,
          color: 'var(--zuik-orange)',
          textDecoration: 'none',
          transition: 'color 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--zuik-orange-dark)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--zuik-orange)'
        }}
      >
        View on Lora Explorer
        <ExternalLink size={14} strokeWidth={2} />
      </a>
    </div>
  )
}

export default Account
