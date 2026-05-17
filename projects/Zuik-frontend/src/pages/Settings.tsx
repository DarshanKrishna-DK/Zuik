import { useMemo, useState, useCallback, useEffect } from 'react'
import { useWallet } from '@txnlab/use-wallet-react'
import { getAlgodConfigFromViteEnvironment } from '../utils/network/getAlgoClientConfigs'
import { isSupabaseConfigured } from '../services/supabase'
import { isGroqConfigured } from '../services/intentParser'
import { getAlgodClient } from '../services/algorand'
import { resolveAssetName } from '../services/assetResolver'
import {
  createLogicSigDelegation,
  deactivateLogicSigVault,
  getActiveLogicSigVault,
  type LogicSigVaultRow,
} from '../services/logicSigDelegation'
import { GuardianSettings } from '../components/settings/GuardianSettings'

/* ── Inline SVG Icons ─────────────────────────────────── */
function SettingsGearIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
}
function WalletIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/></svg>
}
function ShieldIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 4v5c0 5-3.5 9-7 10-3.5-1-7-5-7-10V7l7-4z"/></svg>
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

async function getAssetDecimalsForSettings(assetId: number): Promise<number> {
  if (assetId === 0) return 6
  try {
    const algod = getAlgodClient()
    const info = await algod.getAssetByID(BigInt(assetId)).do()
    const params = (info as Record<string, unknown>).params ?? info
    return Number((params as Record<string, unknown>).decimals ?? 6)
  } catch {
    return 6
  }
}

export default function Settings() {
  const { activeAddress, transactionSigner } = useWallet()
  const sbConfigured = isSupabaseConfigured()
  const groqConfigured = isGroqConfigured()
  const [tgChatId, setTgChatId] = useState(() =>
    typeof localStorage !== 'undefined' ? localStorage.getItem('zuik_telegram_chat_id') ?? '' : ''
  )
  const saveTgChatId = useCallback((value: string) => {
    setTgChatId(value)
    if (value.trim()) {
      localStorage.setItem('zuik_telegram_chat_id', value.trim())
    } else {
      localStorage.removeItem('zuik_telegram_chat_id')
    }
  }, [])

  const [delegationVault, setDelegationVault] = useState<LogicSigVaultRow | null>(null)
  const [delegationStats, setDelegationStats] = useState<{ assetLabel: string; maxPerTrade: string; dailyCap: string } | null>(null)
  const [delegationLoading, setDelegationLoading] = useState(false)
  const [delegationError, setDelegationError] = useState<string | null>(null)
  const [delegationForm, setDelegationForm] = useState({
    assetId: '0',
    maxPerTrade: '1',
    dailyCap: '5',
    expiryDays: '30',
    maxFee: '2000',
    allowedDexAppId: '0',
  })

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

  useEffect(() => {
    if (!activeAddress || !sbConfigured) {
      setDelegationVault(null)
      setDelegationStats(null)
      return
    }

    setDelegationLoading(true)
    getActiveLogicSigVault(activeAddress)
      .then((vault) => {
        setDelegationVault(vault)
        setDelegationError(null)
      })
      .catch(() => {
        setDelegationError('Unable to load automation permissions right now.')
        setDelegationVault(null)
      })
      .finally(() => setDelegationLoading(false))
  }, [activeAddress, sbConfigured])

  useEffect(() => {
    if (!delegationVault) {
      setDelegationStats(null)
      return
    }

    const assetId = Number(delegationVault.allowed_from_asset)
    Promise.all([resolveAssetName(assetId), getAssetDecimalsForSettings(assetId)])
      .then(([assetLabel, decimals]) => {
        const maxPerTrade = Number(delegationVault.max_per_trade) / 10 ** decimals
        const dailyCap = Number(delegationVault.daily_cap) / 10 ** decimals
        setDelegationStats({
          assetLabel,
          maxPerTrade: maxPerTrade.toFixed(decimals > 2 ? 4 : 2),
          dailyCap: dailyCap.toFixed(decimals > 2 ? 4 : 2),
        })
      })
      .catch(() => {
        setDelegationStats({
          assetLabel: `Token ${assetId}`,
          maxPerTrade: delegationVault.max_per_trade,
          dailyCap: delegationVault.daily_cap,
        })
      })
  }, [delegationVault])

  const handleCreateDelegation = async () => {
    if (!activeAddress) {
      setDelegationError('Connect your wallet to enable automation permissions.')
      return
    }
    if (!transactionSigner) {
      setDelegationError('Wallet signer not available. Reconnect your wallet and try again.')
      return
    }
    if (!sbConfigured) {
      setDelegationError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
      return
    }

    const maxPerTrade = Number(delegationForm.maxPerTrade)
    const dailyCap = Number(delegationForm.dailyCap)
    const assetId = Number(delegationForm.assetId)
    const expiryDays = Number(delegationForm.expiryDays)
    const maxFee = Number(delegationForm.maxFee)
    const dexAppId = Number(delegationForm.allowedDexAppId)

    if (!Number.isFinite(maxPerTrade) || maxPerTrade <= 0) {
      setDelegationError('Max per trade must be a positive number.')
      return
    }
    if (!Number.isFinite(dailyCap) || dailyCap <= 0) {
      setDelegationError('Daily cap must be a positive number.')
      return
    }

    setDelegationLoading(true)
    setDelegationError(null)

    try {
      const vault = await createLogicSigDelegation({
        walletAddress: activeAddress,
        signer: transactionSigner,
        maxPerTrade,
        dailyCap,
        allowedFromAsset: Number.isFinite(assetId) ? assetId : 0,
        allowedToAsset: 0,
        expiryDays: Number.isFinite(expiryDays) && expiryDays > 0 ? expiryDays : 30,
        maxFee: Number.isFinite(maxFee) && maxFee > 0 ? maxFee : 2000,
        allowedDexAppId: Number.isFinite(dexAppId) ? dexAppId : 0,
      })
      setDelegationVault(vault)
    } catch (err) {
      setDelegationError(err instanceof Error ? err.message : 'Failed to create permission.')
    } finally {
      setDelegationLoading(false)
    }
  }

  const handleDeactivateDelegation = async () => {
    if (!delegationVault) return
    setDelegationLoading(true)
    setDelegationError(null)
    try {
      await deactivateLogicSigVault(delegationVault.id)
      setDelegationVault(null)
    } catch {
      setDelegationError('Could not turn off this permission.')
    } finally {
      setDelegationLoading(false)
    }
  }

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
                1. Open the bot in Telegram and press /start<br/>
                2. The bot will show your <strong>Chat ID</strong> - copy it below<br/>
                3. Workflows with "Send Telegram" blocks will auto-use this ID
              </p>
              <a
                href={`https://t.me/${TG_BOT_USERNAME}`}
                target="_blank"
                rel="noopener noreferrer"
                className="z-btn z-btn-primary z-btn-sm"
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none', marginBottom: 10 }}
              >
                <TelegramIcon /> Open in Telegram <ExternalLinkIcon />
              </a>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  value={tgChatId}
                  onChange={(e) => saveTgChatId(e.target.value)}
                  placeholder="Paste your Telegram Chat ID"
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    fontSize: '0.75rem',
                    borderRadius: 6,
                    border: '1px solid var(--z-border)',
                    background: 'var(--z-surface)',
                    color: 'var(--z-text)',
                    fontFamily: 'var(--z-mono)',
                  }}
                />
              </div>
              {tgChatId && (
                <p style={{ fontSize: '0.7rem', color: 'var(--z-success)', marginTop: 4 }}>
                  Chat ID saved. Telegram notifications will use this ID.
                </p>
              )}
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

          {/* Automation Permissions */}
          <div className="zuik-settings-card">
            <div className="zuik-settings-card-title"><ShieldIcon /> Automation Permissions</div>
            {!sbConfigured && (
              <div style={{ padding: '4px 16px 12px', fontSize: '0.75rem', color: 'var(--z-text-muted)' }}>
                Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to save permissions.
              </div>
            )}
            {!activeAddress && (
              <div style={{ padding: '4px 16px 12px', fontSize: '0.75rem', color: 'var(--z-text-muted)' }}>
                Connect a wallet to enable automation permissions.
              </div>
            )}
            {delegationVault ? (
              <>
                <div className="zuik-settings-row">
                  <span className="zuik-settings-label">Status</span>
                  <span className="zuik-settings-value success">Active</span>
                </div>
                <div className="zuik-settings-row">
                  <span className="zuik-settings-label">Verifier App ID</span>
                  <span className="zuik-settings-value" style={{ fontFamily: 'var(--z-mono)', fontSize: '0.75rem' }}>
                    {delegationVault.verifier_app_id}
                  </span>
                </div>
                <div className="zuik-settings-row">
                  <span className="zuik-settings-label">Delegation Address</span>
                  <span className="zuik-settings-value" style={{ fontFamily: 'var(--z-mono)', fontSize: '0.7rem' }}>
                    {delegationVault.lsig_address.slice(0, 8)}...{delegationVault.lsig_address.slice(-6)}
                  </span>
                </div>
                <div className="zuik-settings-row">
                  <span className="zuik-settings-label">Token</span>
                  <span className="zuik-settings-value">
                    {delegationStats?.assetLabel ?? `Token ${delegationVault.allowed_from_asset}`}
                  </span>
                </div>
                <div className="zuik-settings-row">
                  <span className="zuik-settings-label">Max per trade</span>
                  <span className="zuik-settings-value">
                    {delegationStats?.maxPerTrade ?? delegationVault.max_per_trade}
                  </span>
                </div>
                <div className="zuik-settings-row">
                  <span className="zuik-settings-label">Daily cap</span>
                  <span className="zuik-settings-value">
                    {delegationStats?.dailyCap ?? delegationVault.daily_cap}
                  </span>
                </div>
                <div style={{ padding: '4px 16px 12px' }}>
                  <button
                    className="z-btn z-btn-danger z-btn-sm"
                    onClick={handleDeactivateDelegation}
                    disabled={delegationLoading}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    Turn Off Automation Permission
                  </button>
                </div>
              </>
            ) : (
              <div style={{ padding: '4px 16px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--z-text-muted)', lineHeight: 1.5 }}>
                  Allow Zuik to run approved payments for you on schedule. This is a testnet-only feature and uses a
                  one-time signing key to create the permission.
                </p>
                <div style={{ display: 'grid', gap: 8 }}>
                  <label style={{ fontSize: '0.7rem', color: 'var(--z-text-muted)' }}>Token ID (0 = ALGO)</label>
                  <input
                    type="number"
                    value={delegationForm.assetId}
                    onChange={(e) => setDelegationForm((prev) => ({ ...prev, assetId: e.target.value }))}
                    placeholder="0"
                    style={{
                      padding: '6px 10px',
                      fontSize: '0.75rem',
                      borderRadius: 6,
                      border: '1px solid var(--z-border)',
                      background: 'var(--z-surface)',
                      color: 'var(--z-text)',
                    }}
                  />
                  <label style={{ fontSize: '0.7rem', color: 'var(--z-text-muted)' }}>Max per trade</label>
                  <input
                    type="number"
                    value={delegationForm.maxPerTrade}
                    onChange={(e) => setDelegationForm((prev) => ({ ...prev, maxPerTrade: e.target.value }))}
                    placeholder="1.0"
                    style={{
                      padding: '6px 10px',
                      fontSize: '0.75rem',
                      borderRadius: 6,
                      border: '1px solid var(--z-border)',
                      background: 'var(--z-surface)',
                      color: 'var(--z-text)',
                    }}
                  />
                  <label style={{ fontSize: '0.7rem', color: 'var(--z-text-muted)' }}>Daily cap</label>
                  <input
                    type="number"
                    value={delegationForm.dailyCap}
                    onChange={(e) => setDelegationForm((prev) => ({ ...prev, dailyCap: e.target.value }))}
                    placeholder="5.0"
                    style={{
                      padding: '6px 10px',
                      fontSize: '0.75rem',
                      borderRadius: 6,
                      border: '1px solid var(--z-border)',
                      background: 'var(--z-surface)',
                      color: 'var(--z-text)',
                    }}
                  />
                  <label style={{ fontSize: '0.7rem', color: 'var(--z-text-muted)' }}>Expiry (days)</label>
                  <input
                    type="number"
                    value={delegationForm.expiryDays}
                    onChange={(e) => setDelegationForm((prev) => ({ ...prev, expiryDays: e.target.value }))}
                    placeholder="30"
                    style={{
                      padding: '6px 10px',
                      fontSize: '0.75rem',
                      borderRadius: 6,
                      border: '1px solid var(--z-border)',
                      background: 'var(--z-surface)',
                      color: 'var(--z-text)',
                    }}
                  />
                  <button
                    className="z-btn z-btn-primary z-btn-sm"
                    onClick={handleCreateDelegation}
                    disabled={delegationLoading || !activeAddress}
                    style={{ justifyContent: 'center' }}
                  >
                    {delegationLoading ? 'Creating...' : 'Create Automation Permission'}
                  </button>
                  {delegationError && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--z-error)' }}>{delegationError}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Guardian Smart Contract Settings */}
      <GuardianSettings />
    </div>
  )
}
