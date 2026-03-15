import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import Navbar from './components/layout/Navbar'
import ConnectWallet from './components/ConnectWallet'
import Landing from './pages/Landing'
import Builder from './pages/Builder'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'

export default function AppShell() {
  const [walletModalOpen, setWalletModalOpen] = useState(false)

  return (
    <div className="zuik-app">
      <div className="zuik-main">
        <Navbar onConnectWallet={() => setWalletModalOpen(true)} />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/builder" element={<Builder />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
      <ConnectWallet openModal={walletModalOpen} closeModal={() => setWalletModalOpen(false)} />
    </div>
  )
}
