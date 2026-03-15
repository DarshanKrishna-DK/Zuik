import { Link, useLocation } from 'react-router-dom'
import { useWallet } from '@txnlab/use-wallet-react'
import { Workflow, LayoutDashboard, Settings, Wallet } from 'lucide-react'
import zuikLogo from '../../assets/zuik-logo.png'

interface NavbarProps {
  onConnectWallet: () => void
}

const navItems = [
  { path: '/builder', label: 'Builder', icon: Workflow },
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/settings', label: 'Settings', icon: Settings },
]

export default function Navbar({ onConnectWallet }: NavbarProps) {
  const location = useLocation()
  const { activeAddress } = useWallet()

  const shortAddr = activeAddress
    ? `${activeAddress.slice(0, 4)}...${activeAddress.slice(-4)}`
    : null

  return (
    <nav className="zuik-navbar">
      <Link to="/" className="zuik-navbar-brand">
        <img src={zuikLogo} alt="Zuik" />
        <span>Zuik</span>
      </Link>

      <div className="zuik-nav-links">
        {navItems.map(item => {
          const Icon = item.icon
          const isActive = location.pathname === item.path
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`zuik-nav-link ${isActive ? 'active' : ''}`}
            >
              <Icon size={16} />
              {item.label}
            </Link>
          )
        })}
      </div>

      <div className="zuik-nav-right">
        {shortAddr ? (
          <button className="zuik-btn zuik-btn-ghost zuik-btn-sm" onClick={onConnectWallet}>
            <Wallet size={14} />
            {shortAddr}
          </button>
        ) : (
          <button className="zuik-btn zuik-btn-primary zuik-btn-sm" onClick={onConnectWallet}>
            <Wallet size={14} />
            Connect Wallet
          </button>
        )}
      </div>
    </nav>
  )
}
