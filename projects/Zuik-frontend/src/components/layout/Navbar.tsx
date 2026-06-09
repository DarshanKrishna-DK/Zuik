import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useWallet } from '@txnlab/use-wallet-react'
import zuikLogo from '../../assets/zuik-logo.png'
import { getAlgodClient } from '../../services/algorand'
import { useVoiceComponentRef, useVoiceShellState } from '../voice'

interface NavbarProps {
  onConnectWallet: () => void
}

function WorkflowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="8" height="8" x="3" y="3" rx="2" /><path d="M7 11v4a2 2 0 0 0 2 2h4" /><rect width="8" height="8" x="13" y="13" rx="2" />
    </svg>
  )
}

function DashboardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" />
    </svg>
  )
}

function MarketIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="m7 14 3-3 3 3 4-4" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function WalletIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

const navItems = [
  { path: '/builder', label: 'Builder', Icon: WorkflowIcon },
  { path: '/market', label: 'Market', Icon: MarketIcon },
  { path: '/dashboard', label: 'Dashboard', Icon: DashboardIcon },
  { path: '/settings', label: 'Settings', Icon: SettingsIcon },
]

export default function Navbar({ onConnectWallet }: NavbarProps) {
  const location = useLocation()
  const { activeAddress } = useWallet()
  const [balances, setBalances] = useState<Array<{ assetId: number; label: string; amount: number; decimals: number }>>([])
  const [selectedAssetId, setSelectedAssetId] = useState(0)
  const [loadingBalances, setLoadingBalances] = useState(false)
  const [walletMenuOpen, setWalletMenuOpen] = useState(false)
  const walletMenuRef = useRef<HTMLDivElement>(null)

  const shortAddr = activeAddress
    ? `${activeAddress.slice(0, 4)}...${activeAddress.slice(-4)}`
    : null

  useEffect(() => {
    if (!activeAddress) {
      setBalances([])
      setSelectedAssetId(0)
      return
    }

    let cancelled = false
    const load = async () => {
      try {
        setLoadingBalances(true)
        const algod = getAlgodClient()
        const info = await algod.accountInformation(activeAddress).do()
        const algoBalance = Number(info.amount ?? 0) / 1_000_000
        const assets = Array.isArray(info.assets) ? info.assets : []
        const assetDetails = await Promise.all(
          assets.map(async (asset) => {
            try {
              const assetId = Number(asset.assetId ?? 0)
              if (!assetId || Number.isNaN(assetId)) {
                return null
              }

              // Handle known testnet assets
              const knownAssets: Record<number, string> = {
                10458941: 'USDC', // USDC on Algorand testnet
                148607: 'ALGO', // Native ALGO
              }

              if (knownAssets[assetId]) {
                const decimals = assetId === 10458941 ? 6 : 0
                const amount = Number(asset.amount ?? 0n) / Math.pow(10, decimals)
                return { assetId, label: knownAssets[assetId], amount, decimals }
              }

              const details = await algod.getAssetByID(BigInt(assetId)).do()
              const params = details?.params as { name?: string; ['unit-name']?: string; decimals?: number }
              const decimals = params?.decimals ?? 0
              const amount = Number(asset.amount ?? 0n) / Math.pow(10, decimals)
              const label = params?.['unit-name'] || params?.name || `ASA ${assetId}`
              return { assetId, label, amount, decimals }
            } catch {
              const assetId = Number(asset.assetId ?? 0)
              if (!assetId || Number.isNaN(assetId)) {
                return null
              }
              return {
                assetId,
                label: `ASA ${assetId}`,
                amount: Number(asset.amount ?? 0n),
                decimals: 0,
              }
            }
          }),
        )
        if (cancelled) return
        const validAssets = assetDetails.filter(
          (asset): asset is { assetId: number; label: string; amount: number; decimals: number } =>
            asset !== null && asset.amount > 0,
        )
        const nextBalances = [
          { assetId: 0, label: 'ALGO', amount: algoBalance, decimals: 6 },
          ...validAssets,
        ]
        setBalances(nextBalances)
        setSelectedAssetId((prev) => nextBalances.find((b) => b.assetId === prev)?.assetId ?? 0)
      } catch {
        if (!cancelled) {
          setBalances([{ assetId: 0, label: 'ALGO', amount: 0, decimals: 6 }])
        }
      } finally {
        if (!cancelled) setLoadingBalances(false)
      }
    }

    void load()
    const interval = window.setInterval(load, 30_000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [activeAddress])

  useEffect(() => {
    if (!walletMenuOpen) return
    const handleClick = (event: MouseEvent) => {
      if (!walletMenuRef.current?.contains(event.target as Node)) {
        setWalletMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [walletMenuOpen])

  const selectedBalance = useMemo(() => (
    balances.find((b) => b.assetId === selectedAssetId) ?? balances[0]
  ), [balances, selectedAssetId])

  const formatAmount = (value: number) => new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value < 1 ? 6 : 3,
  }).format(value)

  const voiceShellState = useMemo(
    () => ({
      walletConnected: Boolean(activeAddress),
      walletAddress: activeAddress ?? null,
      walletSummary: selectedBalance
        ? `${selectedBalance.label} ${formatAmount(selectedBalance.amount)}`
        : null,
      balances: balances.map((b) => ({ label: b.label, amount: b.amount })),
    }),
    [activeAddress, selectedBalance, balances],
  )

  useVoiceShellState(voiceShellState)

  useVoiceComponentRef('nav-connect-wallet', {
    click: onConnectWallet,
  })

  return (
    <nav className="zuik-navbar">
      <Link to="/" className="landing-nav-brand zuik-navbar-brand">
        <img src={zuikLogo} alt="Zuik" />
        <span>ZUIK</span>
      </Link>

      <div className="zuik-nav-links">
        {navItems.map(item => {
          const isActive = location.pathname === item.path
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`zuik-nav-link ${isActive ? 'active' : ''}`}
            >
              <item.Icon />
              {item.label}
            </Link>
          )
        })}
      </div>

      <div className="zuik-nav-right">
        {shortAddr ? (
          <div className="zuik-wallet-dropdown" ref={walletMenuRef}>
            <button className="zuik-btn zuik-btn-ghost zuik-btn-sm zuik-wallet-trigger" onClick={() => setWalletMenuOpen((open) => !open)}>
              <WalletIcon />
              {shortAddr}
              <span className="wallet-balance-pill">
                {loadingBalances ? 'Loading...' : selectedBalance ? `${selectedBalance.label} ${formatAmount(selectedBalance.amount)}` : '0'}
              </span>
              <ChevronIcon />
            </button>
            {walletMenuOpen && (
              <div className="zuik-wallet-menu">
                <div className="zuik-wallet-menu-title">Balances</div>
                {balances.map((balance) => (
                  <button
                    key={balance.assetId}
                    className={`zuik-wallet-item${balance.assetId === selectedAssetId ? ' active' : ''}`}
                    onClick={() => { setSelectedAssetId(balance.assetId); setWalletMenuOpen(false) }}
                  >
                    <span>{balance.label}</span>
                    <strong>{formatAmount(balance.amount)}</strong>
                  </button>
                ))}
                <div className="zuik-wallet-menu-divider" />
                <button className="zuik-wallet-item" onClick={onConnectWallet}>
                  Manage Wallet
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            className="zuik-btn zuik-btn-primary zuik-btn-sm"
            data-testid="nav-connect-wallet"
            onClick={onConnectWallet}
          >
            <WalletIcon />
            Connect Wallet
          </button>
        )}
      </div>
    </nav>
  )
}
