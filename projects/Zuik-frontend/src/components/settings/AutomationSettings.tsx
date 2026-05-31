import { useState, useEffect, useCallback } from 'react'

import { useWallet } from '@txnlab/use-wallet-react'

import { isSupabaseConfigured } from '../../services/supabase'

import { readAssetDecimals } from '../../utils/algosdkCompat'

import { getAlgodClient } from '../../services/algorand'

import { resolveAssetName } from '../../services/assetResolver'

import { formatAlgoAmount } from '../../lib/format'

import {

  createLogicSigDelegation,

  deleteLogicSigVault,

  listLogicSigVaults,

  setLogicSigVaultActive,

  type LogicSigVaultRow,

} from '../../services/logicSigDelegation'

import { agentWalletApi, type EnhancedAgentWallet } from '../../services/agentWalletApi'

import {

  delegationWalletHint,

  signDelegationProgram,

  walletSupportsDelegationSigning,

} from '../../services/delegationSigner'

import { ToggleSwitch } from './ToggleSwitch'

import { IconEdit, IconTrash } from './SettingsIcons'

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



interface VaultDisplay {

  vault: LogicSigVaultRow

  enhanced?: EnhancedAgentWallet

  assetLabel: string

  maxPerTrade: string

  dailyCap: string

}



const DEFAULT_FORM = {

  assetId: '0',

  maxPerTrade: '1',

  dailyCap: '5',

  expiryDays: '30',

  maxFee: '2000',

}



async function toVaultDisplay(vault: LogicSigVaultRow): Promise<VaultDisplay> {

  const assetId = Number(vault.allowed_from_asset)

  try {

    const [assetLabel, decimals] = await Promise.all([

      resolveAssetName(assetId),

      getAssetDecimalsForSettings(assetId),

    ])

    const maxPerTrade = Number(vault.max_per_trade) / 10 ** decimals

    const dailyCap = Number(vault.daily_cap) / 10 ** decimals

    return {

      vault,

      assetLabel,

      maxPerTrade: maxPerTrade.toFixed(decimals > 2 ? 4 : 2),

      dailyCap: dailyCap.toFixed(decimals > 2 ? 4 : 2),

    }

  } catch {

    return {

      vault,

      assetLabel: assetId === 0 ? 'ALGO' : `Token ${assetId}`,

      maxPerTrade: vault.max_per_trade,

      dailyCap: vault.daily_cap,

    }

  }

}



export function AutomationSettings() {

  const { activeAddress, signData, activeWallet, withPrivateKey } = useWallet()

  const sbConfigured = isSupabaseConfigured()



  const [vaultDisplays, setVaultDisplays] = useState<VaultDisplay[]>([])

  const [delegationLoading, setDelegationLoading] = useState(false)

  const [delegationError, setDelegationError] = useState<string | null>(null)

  const [delegationSuccess, setDelegationSuccess] = useState<string | null>(null)

  const [showCreateForm, setShowCreateForm] = useState(false)

  const [editingVaultId, setEditingVaultId] = useState<string | null>(null)

  const [delegationForm, setDelegationForm] = useState(DEFAULT_FORM)

  const [expandedVaultId, setExpandedVaultId] = useState<string | null>(null)



  const loadVaults = useCallback(async () => {

    if (!activeAddress || !sbConfigured) {

      setVaultDisplays([])

      return

    }



    setDelegationLoading(true)

    try {

      const [vaults, enhancedWallets] = await Promise.all([

        listLogicSigVaults(activeAddress),

        agentWalletApi.getWallets(activeAddress),

      ])

      const enhancedById = new Map(enhancedWallets.map((w) => [w.id, w]))

      const displays = await Promise.all(

        vaults.map(async (vault) => {

          const display = await toVaultDisplay(vault)

          return { ...display, enhanced: enhancedById.get(vault.id) }

        }),

      )

      setVaultDisplays(displays)

      setDelegationError(null)

    } catch {

      setDelegationError('Unable to load automation permissions right now.')

      setVaultDisplays([])

    } finally {

      setDelegationLoading(false)

    }

  }, [activeAddress, sbConfigured])



  useEffect(() => {

    loadVaults()

  }, [loadVaults])



  const resetForm = () => {

    setDelegationForm(DEFAULT_FORM)

    setEditingVaultId(null)

    setShowCreateForm(false)

  }



  const handleCreateDelegation = async () => {

    if (!activeAddress) {

      setDelegationError('Connect your wallet to enable automation permissions.')

      return

    }

    if (!walletSupportsDelegationSigning(activeWallet)) {

      setDelegationError(delegationWalletHint(activeWallet))

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

      if (editingVaultId) {

        await deleteLogicSigVault(editingVaultId)

      }



      await createLogicSigDelegation({

        walletAddress: activeAddress,

        signProgram: async (programBytes, message) =>

          signDelegationProgram({

            programBytes,

            message,

            signerAddress: activeAddress,

            activeWallet,

            signData,

            withPrivateKey,

          }),

        maxPerTrade,

        dailyCap,

        allowedFromAsset: Number.isFinite(assetId) ? assetId : 0,

        allowedToAsset: 0,

        expiryDays: Number.isFinite(expiryDays) && expiryDays > 0 ? expiryDays : 30,

        maxFee: Number.isFinite(maxFee) && maxFee > 0 ? maxFee : 2000,

      })



      setDelegationSuccess(

        editingVaultId

          ? 'Permission updated. Approve the new signature in your wallet if prompted.'

          : 'Automation permission created. Your workflows can run within these limits.',

      )

      resetForm()

      await loadVaults()

    } catch (err) {

      setDelegationError(err instanceof Error ? err.message : 'Failed to save permission.')

    } finally {

      setDelegationLoading(false)

    }

  }



  const handleToggleVault = async (vaultId: string, nextActive: boolean) => {

    setDelegationLoading(true)

    setDelegationError(null)

    setDelegationSuccess(null)

    try {

      await setLogicSigVaultActive(vaultId, nextActive)

      setDelegationSuccess(nextActive ? 'Automation permission enabled.' : 'Automation permission paused.')

      await loadVaults()

    } catch {

      setDelegationError('Could not update this permission.')

    } finally {

      setDelegationLoading(false)

    }

  }



  const handleDeleteVault = async (vaultId: string) => {

    if (!window.confirm('Delete this automation permission? Workflows will no longer run autonomously for this token.')) {

      return

    }



    setDelegationLoading(true)

    setDelegationError(null)

    setDelegationSuccess(null)

    try {

      await deleteLogicSigVault(vaultId)

      setDelegationSuccess('Automation permission deleted.')

      if (editingVaultId === vaultId) resetForm()

      await loadVaults()

    } catch {

      setDelegationError('Could not delete this permission.')

    } finally {

      setDelegationLoading(false)

    }

  }



  const handleEditVault = async (display: VaultDisplay) => {

    const assetId = Number(display.vault.allowed_from_asset)

    const decimals = await getAssetDecimalsForSettings(assetId)

    setDelegationForm({

      assetId: String(assetId),

      maxPerTrade: (Number(display.vault.max_per_trade) / 10 ** decimals).toString(),

      dailyCap: (Number(display.vault.daily_cap) / 10 ** decimals).toString(),

      expiryDays: '30',

      maxFee: display.vault.max_fee || '2000',

    })

    setEditingVaultId(display.vault.id)

    setShowCreateForm(true)

    setDelegationError(null)

    setDelegationSuccess(null)

  }



  const activeCount = vaultDisplays.filter(({ vault }) => vault.is_active).length

  const formVisible = showCreateForm || vaultDisplays.length === 0



  return (

    <section className="st-section" data-testid="settings-delegation">

      <SettingsPanelHeader

        title="Automation"

        subtitle="Set spending limits, monitor delegation status, and let Zuik run workflows without repeated wallet prompts."

      />



      <HelpCard title="How it works">

        Funds stay in your connected wallet. You sign a LogicSig delegation once per permission.

        Zuik can only send transactions that match your max per trade and daily cap.

        Edit or delete permissions anytime.

      </HelpCard>



      {!sbConfigured && (

        <FeedbackMessage variant="info">

          Sign in with cloud sync enabled to save automation permissions across devices.

        </FeedbackMessage>

      )}



      {!activeAddress && (

        <FeedbackMessage variant="info">Connect a wallet to set up automation permissions.</FeedbackMessage>

      )}



      {activeAddress && !walletSupportsDelegationSigning(activeWallet) && (

        <FeedbackMessage variant="info">{delegationWalletHint(activeWallet)}</FeedbackMessage>

      )}



      {delegationLoading && vaultDisplays.length === 0 && <LoadingBlock label="Loading permissions..." />}



      {vaultDisplays.length > 0 && (

        <SettingsCard>

          <div className="st-card-head">

            <h3 className="st-card-title">Your permissions</h3>

            <StatusBadge variant={activeCount > 0 ? 'success' : 'neutral'}>

              {activeCount} active

            </StatusBadge>

          </div>

          <div className="st-vault-list">

            {vaultDisplays.map(({ vault, enhanced, assetLabel, maxPerTrade, dailyCap }) => (

              <div key={vault.id} className="st-vault-row" data-testid={`delegation-vault-${vault.id}`}>

                <div className="st-vault-row-main">

                  <div className="st-vault-row-head">

                    <span className="st-vault-asset">{assetLabel}</span>

                    <StatusBadge variant={vault.is_active ? 'success' : 'neutral'}>

                      {vault.is_active ? 'Active' : 'Paused'}

                    </StatusBadge>

                  </div>

                  <div className="st-vault-metrics">

                    <DetailRow label="Max per trade" value={`${maxPerTrade} ${assetLabel}`} />

                    <DetailRow label="Daily cap" value={`${dailyCap} ${assetLabel}`} />

                    {enhanced?.balance && (

                      <DetailRow

                        label="Wallet balance"

                        value={`${formatAlgoAmount(enhanced.balance.balance)} ALGO available`}

                      />

                    )}

                    {enhanced?.stats && enhanced.stats.transactionCount > 0 && (

                      <DetailRow

                        label="Tracked spending"

                        value={`${formatAlgoAmount(enhanced.stats.totalSpent)} ALGO (${enhanced.stats.transactionCount} txns)`}

                      />

                    )}

                  </div>

                  {expandedVaultId === vault.id && enhanced?.recentActivity && enhanced.recentActivity.length > 0 && (

                    <div className="st-vault-activity">

                      <h4 className="st-vault-activity-title">Recent activity</h4>

                      {enhanced.recentActivity.slice(0, 5).map((activity) => (

                        <div key={activity.txId} className="st-activity-item">

                          <span>{activity.type}</span>

                          <span>{formatAlgoAmount(activity.amount)} ALGO</span>

                          <span className={`st-activity-status ${activity.status}`}>{activity.status}</span>

                        </div>

                      ))}

                    </div>

                  )}

                </div>

                <div className="st-vault-row-actions">

                  <ToggleSwitch

                    checked={vault.is_active}

                    disabled={delegationLoading}

                    onChange={(next) => handleToggleVault(vault.id, next)}

                    label={vault.is_active ? 'On' : 'Off'}

                    testId={`delegation-toggle-${vault.id}`}

                  />

                  <div className="st-vault-icon-actions">

                    <button

                      type="button"

                      className="st-btn-icon"

                      title="Edit permission"

                      aria-label="Edit permission"

                      data-testid={`delegation-edit-${vault.id}`}

                      disabled={delegationLoading}

                      onClick={() => handleEditVault({ vault, assetLabel, maxPerTrade, dailyCap })}

                    >

                      <IconEdit />

                    </button>

                    <button

                      type="button"

                      className="st-btn-icon st-btn-icon--danger"

                      title="Delete permission"

                      aria-label="Delete permission"

                      data-testid={`delegation-delete-${vault.id}`}

                      disabled={delegationLoading}

                      onClick={() => handleDeleteVault(vault.id)}

                    >

                      <IconTrash />

                    </button>

                    {enhanced?.recentActivity && enhanced.recentActivity.length > 0 && (

                      <button

                        type="button"

                        className="st-btn-text"

                        onClick={() =>

                          setExpandedVaultId((prev) => (prev === vault.id ? null : vault.id))

                        }

                      >

                        {expandedVaultId === vault.id ? 'Hide activity' : 'Activity'}

                      </button>

                    )}

                  </div>

                </div>

              </div>

            ))}

          </div>

        </SettingsCard>

      )}



      {formVisible && (

        <SettingsCard>

          <h3 className="st-card-title">

            {editingVaultId ? 'Edit permission' : vaultDisplays.length === 0 ? 'Create permission' : 'Add permission'}

          </h3>

          {editingVaultId && (

            <p className="st-field-hint st-edit-note">

              Limits are enforced on-chain. Editing requires a new wallet signature.

            </p>

          )}

          <div className="st-form-grid">

            <SettingsField label="Currency" hint="ALGO is the default for TestNet workflows" htmlFor="delegation-asset">

              <select

                id="delegation-asset"

                className="st-input"

                value={delegationForm.assetId}

                disabled={Boolean(editingVaultId)}

                onChange={(e) => setDelegationForm((prev) => ({ ...prev, assetId: e.target.value }))}

              >

                <option value="0">ALGO</option>

                <option value="10458941">USDC (TestNet)</option>

              </select>

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

          <div className="st-card-footer st-card-footer--stack">

            {(vaultDisplays.length > 0 || editingVaultId) && (

              <button

                type="button"

                className="z-btn z-btn-secondary z-btn-sm"

                onClick={resetForm}

                disabled={delegationLoading}

              >

                Cancel

              </button>

            )}

            <button

              type="button"

              className="z-btn z-btn-primary"

              data-testid="delegation-create"

              onClick={handleCreateDelegation}

              disabled={delegationLoading || !activeAddress}

            >

              {delegationLoading

                ? 'Saving...'

                : editingVaultId

                  ? 'Save and re-sign'

                  : 'Create automation permission'}

            </button>

          </div>

        </SettingsCard>

      )}



      {vaultDisplays.length > 0 && !showCreateForm && !editingVaultId && (

        <div className="st-card-footer">

          <button

            type="button"

            className="z-btn z-btn-secondary z-btn-sm"

            onClick={() => setShowCreateForm(true)}

            disabled={delegationLoading}

          >

            Add another permission

          </button>

        </div>

      )}



      {activeAddress && (

        <DetailRow

          label="Authorized wallet"

          value={<AddressDisplay address={activeAddress} />}

        />

      )}



      <FeedbackMessage variant="error">{delegationError}</FeedbackMessage>

      <FeedbackMessage variant="success">{delegationSuccess}</FeedbackMessage>

    </section>

  )

}


