import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useWallet } from '@txnlab/use-wallet-react'
import Navbar from './components/layout/Navbar'
import ConnectWallet from './components/ConnectWallet'
import ErrorBoundary from './components/ErrorBoundary'
import LoadingFallback from './components/LoadingFallback'
import DemoAutoConnect from './components/DemoAutoConnect'
import { VoiceAssistant, VoicePlatformProvider } from './components/voice'

const Builder = lazy(() => import('./pages/Builder'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Settings = lazy(() => import('./pages/Settings'))
const MarketExplorer = lazy(() => import('./pages/Market/MarketExplorer'))
const Landing = lazy(() => import('./pages/Landing'))

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
    <VoicePlatformProvider openWalletModal={openWalletModal}>
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
                <Route path="/market" element={<MarketExplorer />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </div>
        <ConnectWallet openModal={walletModalOpen} closeModal={() => setWalletModalOpen(false)} />
        <VoiceAssistant enabled />
        <DemoAutoConnect />
      </div>
    </VoicePlatformProvider>
  )
}
