import { useWallet } from '@txnlab/use-wallet-react'
import { useMemo } from 'react'
import { getAlgodConfigFromViteEnvironment } from '../utils/network/getAlgoClientConfigs'

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function ExternalLinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  )
}

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div className="z-account-address-row">
        <code className="z-account-address">{activeAddress}</code>
        {onCopyAddress && (
          <button type="button" onClick={onCopyAddress} aria-label="Copy address" className={`z-account-copy-btn${copied ? ' copied' : ''}`}>
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
        )}
      </div>
      {copied && <span style={{ fontSize: '0.75rem', color: 'var(--z-success)', marginTop: '-4px' }}>Copied!</span>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.875rem' }}>
        <span style={{ color: 'var(--z-text-dim)' }}>Network</span>
        <span style={{ color: 'var(--z-text)', fontWeight: 500, textTransform: 'capitalize' }}>{networkName}</span>
      </div>

      <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="z-account-explorer-link">
        View on Lora Explorer
        <ExternalLinkIcon />
      </a>
    </div>
  )
}

export default Account
