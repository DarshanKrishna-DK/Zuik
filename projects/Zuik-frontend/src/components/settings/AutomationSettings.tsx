import { useState, useEffect } from 'react'
import { useWallet } from '@txnlab/use-wallet-react'
import { isSupabaseConfigured } from '../../services/supabase'
import { readAssetDecimals } from '../../utils/algosdkCompat'
import { getAlgodClient } from '../../services/algorand'
import { resolveAssetName } from '../../services/assetResolver'
import {
  createLogicSigDelegation,
  deactivateLogicSigVault,
  getActiveLogicSigVault,
  type LogicSigVaultRow,
} from '../../services/logicSigDelegation'
import {
  SettingsPanelHeader,
  HelpCard,
  SettingsCard,
  SettingsField,
  SettingsInput,
  DetailRow,
  StatusBadge,
  FeedbackMessage,
  LoadingBlock,
  AddressDisplay,
} from './SettingsPrimitives'

async function getAssetDecimalsForSettings(assetId: number): Promise<number> {
  if (assetId === 0) return 6
  try {
    const algod = getAlgodClient()
    const info = await algod.getAssetByID(BigInt(assetId)).do()
    return readAssetDecimals(info)
  } catch {
    return 6
  }
}

export function AutomationSettings() {
  const { activeAddress, transactionSigner } = useWallet()
  const sbConfigured = isSupabaseConfigured()

  const [delegationVault, setDelegationVault] = useState<LogicSigVaultRow | null>(null)
  const [delegationStats, setDelegationStats] = useState<{
    assetLabel: string
    maxPerTrade: string
    dailyCap: string
  } | null>(null)
  const [delegationLoading, setDelegationLoading] = useState(false)
  const [delegationError, setDelegationError] = useState<string | null>(null)
  const [delegationSuccess, setDelegationSuccess] = useState<string | null>(null)
  const [delegationForm, setDelegationForm] = useState({
    assetId: '0',
    maxPerTrade: '1',
    dailyCap: '5',
    expiryDays: '30',
    maxFee: '2000',
    allowedDexAppId: '0',
  })

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
      setDelegationError('Cloud sync is not enabled. Sign in to your Zuik account or contact support.')
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
    setDelegationSuccess(null)

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
      setDelegationSuccess('Automation permission created. Your workflows can run within these limits.')
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
    setDelegationSuccess(null)
    try {
      await deactivateLogicSigVault(delegationVault.id)
      setDelegationVault(null)
      setDelegationSuccess('Automation permission turned off.')
    } catch {
      setDelegationError('Could not turn off this permission.')
    } finally {
      setDelegationLoading(false)
    }
  }

  return (
    <section className="st-section" data-testid="settings-delegation">
      <SettingsPanelHeader
        title="Automation permissions"
        subtitle="Let Zuik run approved swaps and transfers for you, within limits you control."
      />

      <HelpCard title="How it works">
        You set a maximum amount per trade and a daily total. Zuik can only act inside those bounds.
        You can revoke permission at any time.
      </HelpCard>

      {!sbConfigured && (
        <FeedbackMessage variant="info">
          Sign in with cloud sync enabled to save automation permissions across devices.
        </FeedbackMessage>
      )}

      {!activeAddress && (
        <FeedbackMessage variant="info">Connect a wallet to set up automation permissions.</FeedbackMessage>
      )}

      {delegationLoading && !delegationVault && <LoadingBlock label="Loading permissions..." />}

      {delegationVault ? (
        <SettingsCard>
          <div className="st-card-head">
            <h3 className="st-card-title">Active permission</h3>
            <StatusBadge variant="success">Active</StatusBadge>
          </div>
          <DetailRow label="Token" value={delegationStats?.assetLabel ?? `Token ${delegationVault.allowed_from_asset}`} />
          <DetailRow label="Max per trade" value={delegationStats?.maxPerTrade ?? delegationVault.max_per_trade} />
          <DetailRow label="Daily cap" value={delegationStats?.dailyCap ?? delegationVault.daily_cap} />
          <DetailRow
            label="Delegation address"
            value={<AddressDisplay address={delegationVault.lsig_address} />}
          />
          <div className="st-card-footer st-card-footer--stack">
            <button
              type="button"
              className="z-btn z-btn-danger z-btn-sm"
              onClick={handleDeactivateDelegation}
              disabled={delegationLoading}
            >
              {delegationLoading ? 'Turning off...' : 'Turn off automation'}
            </button>
          </div>
        </SettingsCard>
      ) : (
        <SettingsCard>
          <h3 className="st-card-title">Create permission</h3>
          <div className="st-form-grid">
            <SettingsField label="Token ID" hint="Use 0 for ALGO" htmlFor="delegation-asset">
              <SettingsInput
                id="delegation-asset"
                type="number"
                value={delegationForm.assetId}
                onChange={(e) => setDelegationForm((prev) => ({ ...prev, assetId: e.target.value }))}
                placeholder="0"
              />
            </SettingsField>
            <SettingsField label="Max per trade" htmlFor="delegation-max">
              <SettingsInput
                id="delegation-max"
                type="number"
                data-testid="delegation-max-per-trade"
                value={delegationForm.maxPerTrade}
                onChange={(e) => setDelegationForm((prev) => ({ ...prev, maxPerTrade: e.target.value }))}
                placeholder="1.0"
                step="any"
              />
            </SettingsField>
            <SettingsField label="Daily cap" htmlFor="delegation-daily">
              <SettingsInput
                id="delegation-daily"
                type="number"
                data-testid="delegation-daily-cap"
                value={delegationForm.dailyCap}
                onChange={(e) => setDelegationForm((prev) => ({ ...prev, dailyCap: e.target.value }))}
                placeholder="5.0"
                step="any"
              />
            </SettingsField>
            <SettingsField label="Expires after (days)" htmlFor="delegation-expiry">
              <SettingsInput
                id="delegation-expiry"
                type="number"
                data-testid="delegation-expiry-days"
                value={delegationForm.expiryDays}
                onChange={(e) => setDelegationForm((prev) => ({ ...prev, expiryDays: e.target.value }))}
                placeholder="30"
              />
            </SettingsField>
          </div>
          <div className="st-card-footer">
            <button
              type="button"
              className="z-btn z-btn-primary"
              data-testid="delegation-create"
              onClick={handleCreateDelegation}
              disabled={delegationLoading || !activeAddress}
            >
              {delegationLoading ? 'Creating...' : 'Create automation permission'}
            </button>
          </div>
        </SettingsCard>
      )}

      <FeedbackMessage variant="error">{delegationError}</FeedbackMessage>
      <FeedbackMessage variant="success">{delegationSuccess}</FeedbackMessage>
    </section>
  )
}
