import { useMemo } from 'react'
import { useWallet } from '@txnlab/use-wallet-react'
import { getAlgodConfigFromViteEnvironment } from '../utils/network/getAlgoClientConfigs'
import { isSupabaseConfigured } from '../services/supabase'
import { isGroqConfigured } from '../services/intentParser'

function SettingsGearIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
}
function WalletIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /></svg>
}
function GlobeIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></svg>
}
function DatabaseIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5V19A9 3 0 0 0 21 19V5" /><path d="M3 12A9 3 0 0 0 21 12" /></svg>
}
function SparklesIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" /><path d="M20 3v4" /><path d="M22 5h-4" /></svg>
}
function ExternalLinkIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
}
function TerminalIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5" /><line x1="12" x2="20" y1="19" y2="19" /></svg>
}

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

  const cards = [
    {
      Icon: WalletIcon,
      title: 'Wallet',
      rows: [
        { label: 'Address', value: activeAddress || 'No wallet connected' },
        ...(activeAddress ? [{ label: 'Explorer', value: '', link: `${explorer}/account/${activeAddress}` }] : []),
      ],
    },
    {
      Icon: GlobeIcon,
      title: 'Network',
      rows: [
        { label: 'Network', value: algod.network },
        { label: 'Algod Server', value: algod.server },
      ],
    },
    {
      Icon: DatabaseIcon,
      title: 'Persistence',
      rows: [
        { label: 'Status', value: sbConfigured ? 'Supabase Connected' : 'localStorage only', status: sbConfigured ? 'success' : undefined },
        { label: 'Note', value: sbConfigured ? 'Workflows and executions are saved to Supabase' : 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for cloud persistence' },
      ],
    },
    {
      Icon: SparklesIcon,
      title: 'AI Intent Engine',
      rows: [
        { label: 'Status', value: groqConfigured ? 'Groq API Connected' : 'Not configured', status: groqConfigured ? 'success' : undefined },
        { label: 'Model', value: groqConfigured ? 'Llama 3.3 70B (Groq free tier)' : 'Set VITE_GROQ_API_KEY for AI-powered workflow generation' },
      ],
    },
  ]

  const envVars = [
    { key: 'VITE_ALGOD_NETWORK', set: !!algod.network },
    { key: 'VITE_SUPABASE_URL', set: sbConfigured },
    { key: 'VITE_SUPABASE_ANON_KEY', set: sbConfigured },
    { key: 'VITE_GROQ_API_KEY', set: groqConfigured },
    { key: 'VITE_TELEGRAM_BOT_TOKEN', set: !!import.meta.env.VITE_TELEGRAM_BOT_TOKEN },
  ]

  return (
    <div className="zuik-settings">
      <div className="zuik-settings-inner">
        <div className="zuik-settings-title">
          <SettingsGearIcon /> Settings
        </div>

        <div className="zuik-settings-grid">
          {cards.map((card) => (
            <div key={card.title} className="zuik-settings-card">
              <div className="zuik-settings-card-title">
                <card.Icon /> {card.title}
              </div>
              {card.rows.map((row) => (
                <div key={row.label} className="zuik-settings-row">
                  <span className="zuik-settings-label">{row.label}</span>
                  {'link' in row && row.link ? (
                    <a href={row.link} target="_blank" rel="noreferrer" className="z-account-explorer-link" style={{ fontSize: '0.8125rem' }}>
                      View on Explorer <ExternalLinkIcon />
                    </a>
                  ) : (
                    <span className={`zuik-settings-value${'status' in row && row.status === 'success' ? ' success' : ''}`}>
                      {row.value}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="zuik-settings-env">
          <div className="zuik-settings-env-title"><TerminalIcon /> Environment Variables</div>
          <div className="zuik-settings-env-grid">
            {envVars.map((v) => (
              <div key={v.key} className="zuik-env-row">
                <span className="zuik-env-key">{v.key}</span>
                <span className={`zuik-env-status ${v.set ? 'set' : 'missing'}`}>{v.set ? 'Configured' : 'Not set'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
