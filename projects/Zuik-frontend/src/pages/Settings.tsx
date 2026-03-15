import { useWallet } from '@txnlab/use-wallet-react'
import { Settings as SettingsIcon, Wallet, Globe } from 'lucide-react'
import { getAlgodConfigFromViteEnvironment } from '../utils/network/getAlgoClientConfigs'

export default function Settings() {
  const { activeAddress } = useWallet()
  const algodConfig = getAlgodConfigFromViteEnvironment()

  return (
    <div className="zuik-page" style={{ justifyContent: 'flex-start', padding: 40 }}>
      <div style={{ width: '100%', maxWidth: 600 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <SettingsIcon size={24} style={{ color: 'var(--zuik-orange)' }} />
          <h2 style={{ margin: 0 }}>Settings</h2>
        </div>

        <div style={{ background: 'var(--zuik-surface)', border: '1px solid var(--zuik-border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Wallet size={16} style={{ color: 'var(--zuik-text-muted)' }} />
            <span style={{ fontWeight: 600 }}>Wallet</span>
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--zuik-text-muted)', wordBreak: 'break-all' }}>
            {activeAddress || 'No wallet connected'}
          </div>
        </div>

        <div style={{ background: 'var(--zuik-surface)', border: '1px solid var(--zuik-border)', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Globe size={16} style={{ color: 'var(--zuik-text-muted)' }} />
            <span style={{ fontWeight: 600 }}>Network</span>
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--zuik-text-muted)' }}>
            <div>Network: <strong style={{ color: 'var(--zuik-text)' }}>{algodConfig.network || 'localnet'}</strong></div>
            <div style={{ marginTop: 4 }}>Algod: {algodConfig.server}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
