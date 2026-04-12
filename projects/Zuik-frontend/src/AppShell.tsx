import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useWallet } from '@txnlab/use-wallet-react'
import Navbar from './components/layout/Navbar'
import ConnectWallet from './components/ConnectWallet'
import ErrorBoundary from './components/ErrorBoundary'
import LoadingFallback from './components/LoadingFallback'
import Landing from './pages/Landing'

const Builder = lazy(() => import('./pages/Builder'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Settings = lazy(() => import('./pages/Settings'))

export default function AppShell() {
  const [walletModalOpen, setWalletModalOpen] = useState(false)
  const { activeAddress } = useWallet()
  const navigate = useNavigate()
  const location = useLocation()
  const pendingRedirect = useRef<string | null>(null)

  const openWalletModal = useCallback(() => setWalletModalOpen(true), [])

  const connectAndRedirect = useCallback((target: string) => {
    if (activeAddress) {
      navigate(target)
    } else {
      pendingRedirect.current = target
      setWalletModalOpen(true)
    }
  }, [activeAddress, navigate])

  useEffect(() => {
    if (activeAddress && pendingRedirect.current) {
      const target = pendingRedirect.current
      pendingRedirect.current = null
      setWalletModalOpen(false)
      navigate(target)
    }
  }, [activeAddress, navigate])

  const isLanding = location.pathname === '/'

  return (
    <div className="zuik-app">
      <div className="zuik-main">
        {!isLanding && <Navbar onConnectWallet={openWalletModal} />}
        <ErrorBoundary>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/" element={
                <Landing
                  onConnectWallet={openWalletModal}
                  onStartBuilding={() => connectAndRedirect('/builder')}
                />
              } />
              <Route path="/builder" element={<Builder />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </div>
      <ConnectWallet openModal={walletModalOpen} closeModal={() => setWalletModalOpen(false)} />
    </div>
  )
}
