import { useMemo } from 'react'
import { useWallet } from '@txnlab/use-wallet-react'
import { getAlgodConfigFromViteEnvironment } from '../utils/network/getAlgoClientConfigs'
import { isSupabaseConfigured } from '../services/supabase'
import { isGroqConfigured } from '../services/intentParser'

/* ── Inline SVG Icons ─────────────────────────────────── */
function SettingsGearIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
}
function WalletIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/></svg>
}
function GlobeIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
}
function DatabaseIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>
}
function BrainIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/></svg>
}
function ExternalLinkIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
}
function TelegramIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0h-.056zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
}
function UserIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
}
function BellIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
}

const TG_BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'ZuikDeFiBot'

function explorerBase(network: string) {
  if (network === 'mainnet') return 'https://lora.algokit.io/mainnet'
  if (network === 'localnet') return 'https://lora.algokit.io/localnet'
  return 'https://lora.algokit.io/testnet'
}

export default function Settings() {
  const { activeAddress } = useWallet()
  const sbConfigured = isSupabaseConfigured()
  const groqConfigured = isGroqConfigured()

  const algod = useMemo(() => {
    try {
      const cfg = getAlgodConfigFromViteEnvironment()
      return { network: cfg.network || 'localnet', server: cfg.server || '-' }
    } catch {
      return {
        network: import.meta.env.VITE_ALGOD_NETWORK || 'testnet',
        server: import.meta.env.VITE_ALGOD_SERVER || '-',
      }
    }
  }, [])

  const explorer = explorerBase(algod.network)

  return (
    <div className="zuik-settings">
      <div className="zuik-settings-inner">
        <div className="zuik-settings-title">
          <SettingsGearIcon /> Settings
        </div>

        <div className="zuik-settings-grid">
          {/* Account */}
          <div className="zuik-settings-card">
            <div className="zuik-settings-card-title"><UserIcon /> Account</div>
            <div className="zuik-settings-row">
              <span className="zuik-settings-label">Wallet Address</span>
              <span className="zuik-settings-value" style={{ fontFamily: 'var(--z-mono)', fontSize: '0.75rem' }}>
                {activeAddress || 'No wallet connected'}
              </span>
            </div>
            {activeAddress && (
              <div className="zuik-settings-row">
                <span className="zuik-settings-label">Explorer</span>
                <a href={`${explorer}/account/${activeAddress}`} target="_blank" rel="noreferrer" className="z-account-explorer-link" style={{ fontSize: '0.8125rem' }}>
                  View on Lora <ExternalLinkIcon />
                </a>
              </div>
            )}
            <div className="zuik-settings-row">
              <span className="zuik-settings-label">Network</span>
              <span className="zuik-settings-value">{algod.network}</span>
            </div>
          </div>

          {/* Telegram */}
          <div className="zuik-settings-card">
            <div className="zuik-settings-card-title"><TelegramIcon /> Telegram Bot</div>
            <div className="zuik-settings-row">
              <span className="zuik-settings-label">Bot</span>
              <span className="zuik-settings-value" style={{ fontFamily: 'var(--z-mono)', fontSize: '0.75rem' }}>@{TG_BOT_USERNAME}</span>
            </div>
            <div style={{ padding: '4px 16px 12px' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--z-text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
                Open the bot in Telegram, press /start, and it will automatically link to your account. Build workflows, get alerts, and check status - all from Telegram.
              </p>
              <a
                href={`https://t.me/${TG_BOT_USERNAME}`}
                target="_blank"
                rel="noopener noreferrer"
                className="z-btn z-btn-primary z-btn-sm"
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}
              >
                <TelegramIcon /> Open in Telegram <ExternalLinkIcon />
              </a>
            </div>
          </div>

          {/* Notifications */}
          <div className="zuik-settings-card">
            <div className="zuik-settings-card-title"><BellIcon /> Notifications</div>
            <div className="zuik-settings-row">
              <span className="zuik-settings-label">Browser Notifications</span>
              <span className="zuik-settings-value">
                {typeof Notification !== 'undefined' && Notification.permission === 'granted' ? 'Enabled' : 'Not enabled'}
              </span>
            </div>
            {typeof Notification !== 'undefined' && Notification.permission !== 'granted' && (
              <div style={{ padding: '4px 16px 12px' }}>
                <button className="z-btn z-btn-ghost z-btn-sm" onClick={() => Notification.requestPermission()} style={{ width: '100%' }}>
                  Enable Browser Notifications
                </button>
              </div>
            )}
          </div>

          {/* Network */}
          <div className="zuik-settings-card">
            <div className="zuik-settings-card-title"><GlobeIcon /> Network</div>
            <div className="zuik-settings-row">
              <span className="zuik-settings-label">Network</span>
              <span className="zuik-settings-value">{algod.network}</span>
            </div>
            <div className="zuik-settings-row">
              <span className="zuik-settings-label">Algod Server</span>
              <span className="zuik-settings-value" style={{ fontFamily: 'var(--z-mono)', fontSize: '0.7rem' }}>{algod.server}</span>
            </div>
          </div>

          {/* Persistence */}
          <div className="zuik-settings-card">
            <div className="zuik-settings-card-title"><DatabaseIcon /> Data & Storage</div>
            <div className="zuik-settings-row">
              <span className="zuik-settings-label">Persistence</span>
              <span className={`zuik-settings-value${sbConfigured ? ' success' : ''}`}>
                {sbConfigured ? 'Supabase Connected' : 'localStorage only'}
              </span>
            </div>
            <div className="zuik-settings-row">
              <span className="zuik-settings-label">Info</span>
              <span className="zuik-settings-value" style={{ fontSize: '0.75rem' }}>
                {sbConfigured
                  ? 'Workflows and executions saved to Supabase'
                  : 'Set VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY for cloud persistence'}
              </span>
            </div>
          </div>

          {/* AI */}
          <div className="zuik-settings-card">
            <div className="zuik-settings-card-title"><BrainIcon /> AI Intent Engine</div>
            <div className="zuik-settings-row">
              <span className="zuik-settings-label">Status</span>
              <span className={`zuik-settings-value${groqConfigured ? ' success' : ''}`}>
                {groqConfigured ? 'Groq API Connected' : 'Not configured'}
              </span>
            </div>
            <div className="zuik-settings-row">
              <span className="zuik-settings-label">Model</span>
              <span className="zuik-settings-value" style={{ fontSize: '0.75rem' }}>
                {groqConfigured ? 'Llama 3.3 70B (Groq free tier)' : 'Set VITE_GROQ_API_KEY for AI features'}
              </span>
            </div>
          </div>

          {/* Wallet */}
          <div className="zuik-settings-card">
            <div className="zuik-settings-card-title"><WalletIcon /> Wallet</div>
            <div className="zuik-settings-row">
              <span className="zuik-settings-label">Provider</span>
              <span className="zuik-settings-value">Pera / Defly / Exodus</span>
            </div>
            <div className="zuik-settings-row">
              <span className="zuik-settings-label">Status</span>
              <span className={`zuik-settings-value${activeAddress ? ' success' : ''}`}>
                {activeAddress ? 'Connected' : 'Not connected'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
