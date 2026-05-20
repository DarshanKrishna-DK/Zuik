import { useMemo } from 'react'
import { useWallet } from '@txnlab/use-wallet-react'
import { getAlgodConfigFromViteEnvironment } from '../../utils/network/getAlgoClientConfigs'
import { IconExternalLink } from './SettingsIcons'
import {
  SettingsPanelHeader,
  HelpCard,
  SettingsCard,
  DetailRow,
  AddressDisplay,
  StatusBadge,
} from './SettingsPrimitives'

function explorerBase(network: string) {
  if (network === 'mainnet') return 'https://lora.algokit.io/mainnet'
  if (network === 'localnet') return 'https://lora.algokit.io/localnet'
  return 'https://lora.algokit.io/testnet'
}

function formatNetworkLabel(network: string): string {
  if (network === 'mainnet') return 'Mainnet'
  if (network === 'localnet') return 'Local network'
  return 'Testnet'
}

export function AccountSettings() {
  const { activeAddress } = useWallet()

  const algod = useMemo(() => {
    try {
      const cfg = getAlgodConfigFromViteEnvironment()
      return { network: cfg.network || 'localnet' }
    } catch {
      return { network: import.meta.env.VITE_ALGOD_NETWORK || 'testnet' }
    }
  }, [])

  const explorer = explorerBase(algod.network)
  const accountUrl = activeAddress ? `${explorer}/account/${activeAddress}` : undefined

  return (
    <section className="st-section" aria-labelledby="account-settings-title">
      <SettingsPanelHeader
        title="Account"
        subtitle="Your connected wallet and the Algorand network Zuik is using."
      />

      <HelpCard title="What this means">
        Zuik uses your wallet to sign transactions. Your keys stay in your wallet app - Zuik never
        stores them.
      </HelpCard>

      <SettingsCard>
        <DetailRow
          label="Connection"
          value={
            activeAddress ? (
              <StatusBadge variant="success">Connected</StatusBadge>
            ) : (
              <StatusBadge variant="warning">Not connected</StatusBadge>
            )
          }
        />

        <DetailRow
          label="Wallet address"
          value={
            activeAddress ? (
              <AddressDisplay address={activeAddress} explorerUrl={accountUrl} />
            ) : (
              <span className="st-muted">Connect a wallet from the top navigation bar.</span>
            )
          }
        />

        <DetailRow label="Network" value={formatNetworkLabel(algod.network)} />

        {activeAddress && accountUrl && (
          <div className="st-card-footer">
            <a href={accountUrl} target="_blank" rel="noreferrer" className="z-btn z-btn-ghost z-btn-sm st-explorer-link">
              View account on Lora <IconExternalLink />
            </a>
          </div>
        )}
      </SettingsCard>
    </section>
  )
}
