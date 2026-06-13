import express from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createValidatedSupabaseClient } from './supabaseClient.js'
import { getAlgodClient } from './algorand.js'
import { readGuardianContext } from './guardianPolicy.js'
import { hasAgentKey } from './agentSigner.js'
import {
  derivePolicyLifecycleStatus,
  resolvePolicyParams,
  type AgentPolicyBindingRow,
  type PolicyTemplateRow,
} from './policyTemplates.js'

let sb: SupabaseClient

// Helper function to convert BigInt values to strings for JSON serialization
function serializeBigInts(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return typeof obj === 'bigint' ? obj.toString() : obj
  }
  
  if (Array.isArray(obj)) {
    return obj.map(serializeBigInts)
  }
  
  const result: any = {}
  for (const [key, value] of Object.entries(obj)) {
    result[key] = serializeBigInts(value)
  }
  return result
}

async function fetchWalletBalance(agentAddress: string) {
  const algod = getAlgodClient()
  try {
    const accountInfo = await algod.accountInformation(agentAddress).do()
    const balance = Number(accountInfo.amount) / 1_000_000
    const minBalance = Number(accountInfo.minBalance || 100_000) / 1_000_000
    const available = Math.max(0, balance - minBalance)
    return { balance, minBalance, available }
  } catch {
    return { balance: 0, minBalance: 0.1, available: 0 }
  }
}

async function getCurrentRound(): Promise<bigint> {
  try {
    const status = await getAlgodClient().status().do()
    return BigInt(status.lastRound ?? 0)
  } catch {
    return 0n
  }
}

export async function createAgentManagementRouter(): Promise<express.Router> {
  if (!sb) {
    sb = await createValidatedSupabaseClient()
  }
  const router = express.Router()
  const defaultGuardianAppId = Number(process.env.GUARDIAN_APP_ID ?? 0)

  router.get('/policy-templates', async (req, res) => {
    try {
      const { ownerAddress } = req.query
      
      const query = sb
        .from('policy_templates')
        .select('*')
      
      if (ownerAddress) {
        query.or(`is_system.eq.true,wallet_address.eq.${ownerAddress}`)
      } else {
        query.or('is_system.eq.true,wallet_address.is.null')
      }
      
      const { data, error } = await query.order('max_per_trade_microalgos', { ascending: true })

      if (error) {
        return res.status(500).json({ error: 'Failed to load policy templates' })
      }
      res.json({ templates: data ?? [] })
    } catch (error) {
      console.error('[AgentManagement] policy-templates error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  router.post('/policy-templates', async (req, res) => {
    try {
      const { 
        ownerAddress, 
        name, 
        maxPerTradeMicroAlgos, 
        dailyCapMicroAlgos, 
        dailyExecutionsCap,
        expiryRoundHorizon
      } = req.body

      console.log('[AgentManagement] Creating custom policy template:', {
        ownerAddress, name, maxPerTradeMicroAlgos, dailyCapMicroAlgos, dailyExecutionsCap, expiryRoundHorizon
      })

      if (!ownerAddress || !name) {
        return res.status(400).json({ error: 'ownerAddress and name are required' })
      }

      // Create a slug from the name
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      
      const insertData = {
        wallet_address: ownerAddress,
        name,
        slug,
        description: `Custom policy: ${name}`,
        max_per_trade_microalgos: Number(maxPerTradeMicroAlgos || 500000),
        daily_cap_microalgos: Number(dailyCapMicroAlgos || 2000000),
        daily_executions_cap: Number(dailyExecutionsCap || 3),
        expiry_round_horizon: Number(expiryRoundHorizon || 30000),
        allowed_asset_id: 0,
        allowed_dex_app_id: 0,
        is_system: false,
      }

      console.log('[AgentManagement] Insert data:', insertData)
      
      const { data, error } = await sb
        .from('policy_templates')
        .insert(insertData)
        .select()
        .single()

      if (error) {
        console.error('[AgentManagement] Database error:', error)
        return res.status(500).json({ error: `Failed to create policy template: ${error.message}` })
      }

      console.log('[AgentManagement] Template created:', data)
      res.json({ template: data })
    } catch (error) {
      console.error('[AgentManagement] create template error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  router.get('/overview/:ownerAddress', async (req, res) => {
    try {
      const { ownerAddress } = req.params
      const { data: wallets, error: walletError } = await sb
        .from('agent_wallets')
        .select(
          'id, workflow_id, wallet_address, agent_address, guardian_app_id, budget_microalgos, status, display_name, policy_binding_id, binding_type, created_at',
        )
        .eq('wallet_address', ownerAddress)
        .neq('status', 'archived')
        .order('created_at', { ascending: false })

      if (walletError) {
        return res.status(500).json({ error: 'Failed to load agent wallets' })
      }

      const round = await getCurrentRound()
      const agents = await Promise.all(
        (wallets ?? []).map(async (wallet) => {
          const guardianAppId = wallet.guardian_app_id ?? defaultGuardianAppId
          const balance = await fetchWalletBalance(wallet.agent_address)
          const ctx = await readGuardianContext(guardianAppId, wallet.agent_address)

          let binding: AgentPolicyBindingRow | null = null
          let template: PolicyTemplateRow | null = null

          if (wallet.policy_binding_id) {
            const { data: bindingRow } = await sb
              .from('agent_policy_bindings')
              .select('*')
              .eq('id', wallet.policy_binding_id)
              .maybeSingle()
            binding = (bindingRow as AgentPolicyBindingRow) ?? null
          } else {
            const { data: bindingRow } = await sb
              .from('agent_policy_bindings')
              .select('*')
              .eq('agent_address', wallet.agent_address)
              .maybeSingle()
            binding = (bindingRow as AgentPolicyBindingRow) ?? null
          }

          if (binding?.policy_template_id) {
            const { data: templateRow } = await sb
              .from('policy_templates')
              .select('*')
              .eq('id', binding.policy_template_id)
              .maybeSingle()
            template = (templateRow as PolicyTemplateRow) ?? null
          }

          const hasOnChainPolicy = ctx.policy !== null
          const isExpired =
            hasOnChainPolicy && round > 0n && round > ctx.policy!.expiryRound
          const policyStatus = derivePolicyLifecycleStatus(
            ctx.isPaused,
            hasOnChainPolicy,
            isExpired,
            binding?.status,
          )

          const resolved = resolvePolicyParams(template, binding)
          const healthScore = computeHealthScore({
            walletStatus: wallet.status,
            hasKey: hasAgentKey(wallet.agent_address),
            balanceAvailable: balance.available,
            policyStatus,
          })

          return {
            wallet,
            balance: { ...balance, hasKey: hasAgentKey(wallet.agent_address) },
            guardian: {
              appId: guardianAppId,
              isPaused: ctx.isPaused,
              blocked: ctx.blocked,
              blockReason: ctx.blockReason,
              remainingDailyMicroAlgos: ctx.remainingDailyMicroAlgos.toString(),
              policy: ctx.policy
                ? {
                    maxPerTradeMicroAlgos: ctx.policy.maxPerTradeMicroAlgos.toString(),
                    dailyCapMicroAlgos: ctx.policy.dailyCapMicroAlgos.toString(),
                    dailySpentMicroAlgos: ctx.policy.dailySpentMicroAlgos.toString(),
                    dayResetRound: ctx.policy.dayResetRound.toString(),
                    expiryRound: ctx.policy.expiryRound.toString(),
                    dailyExecutionsCap: ctx.policy.dailyExecutionsCap.toString(),
                    dailyExecutionsSpent: ctx.policy.dailyExecutionsSpent.toString(),
                    allowedAssetId: ctx.policy.allowedAssetId.toString(),
                  }
                : null,
            },
            policyBinding: binding,
            policyTemplate: template,
            resolvedPolicy: resolved
              ? {
                  maxPerTradeMicroAlgos: resolved.maxPerTradeMicroAlgos.toString(),
                  dailyCapMicroAlgos: resolved.dailyCapMicroAlgos.toString(),
                  dailyExecutionsCap: resolved.dailyExecutionsCap.toString(),
                  expiryRoundHorizon: resolved.expiryRoundHorizon.toString(),
                  allowedAssetId: resolved.allowedAssetId.toString(),
                }
              : null,
            policyStatus,
            healthScore,
            currentRound: round.toString(),
          }
        }),
      )

      res.json({ agents, currentRound: round.toString() })
    } catch (error) {
      console.error('[AgentManagement] overview error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  router.post('/policy-bindings', async (req, res) => {
    try {
      const {
        ownerAddress,
        agentAddress,
        policyTemplateId,
        maxPerTradeMicroAlgos,
        dailyCapMicroAlgos,
        dailyExecutionsCap,
        allowedAssetId,
      } = req.body ?? {}

      if (!ownerAddress || !agentAddress) {
        return res.status(400).json({ error: 'ownerAddress and agentAddress are required' })
      }

      const { data: wallet, error: walletError } = await sb
        .from('agent_wallets')
        .select('id, agent_address')
        .eq('agent_address', agentAddress)
        .eq('wallet_address', ownerAddress)
        .maybeSingle()

      if (walletError || !wallet) {
        return res.status(404).json({ error: 'Agent wallet not found for this owner' })
      }

      const bindingPatch: Record<string, unknown> = {
        agent_address: agentAddress,
        wallet_address: ownerAddress,
        status: 'pending',
        updated_at: new Date().toISOString(),
      }

      if (policyTemplateId) bindingPatch.policy_template_id = policyTemplateId
      if (maxPerTradeMicroAlgos != null) bindingPatch.max_per_trade_microalgos = Number(maxPerTradeMicroAlgos)
      if (dailyCapMicroAlgos != null) bindingPatch.daily_cap_microalgos = Number(dailyCapMicroAlgos)
      if (dailyExecutionsCap != null) bindingPatch.daily_executions_cap = Number(dailyExecutionsCap)
      if (allowedAssetId != null) bindingPatch.allowed_asset_id = Number(allowedAssetId)

      const { data: binding, error: bindingError } = await sb
        .from('agent_policy_bindings')
        .upsert(bindingPatch, { onConflict: 'agent_address' })
        .select('*')
        .single()

      if (bindingError) {
        console.error('[AgentManagement] binding upsert error:', bindingError.message)
        return res.status(500).json({ error: 'Failed to save policy binding' })
      }

      const { error: linkError } = await sb
        .from('agent_wallets')
        .update({ policy_binding_id: binding.id })
        .eq('id', wallet.id)

      if (linkError) {
        return res.status(500).json({ error: 'Failed to link policy binding to agent' })
      }

      res.json({ binding })
    } catch (error) {
      console.error('[AgentManagement] policy-bindings error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  router.post('/policy-sync/:agentAddress', async (req, res) => {
    try {
      const { agentAddress } = req.params
      const { ownerAddress, bootstrapTxId, expiryRound } = req.body ?? {}

      if (!ownerAddress) {
        return res.status(400).json({ error: 'ownerAddress is required' })
      }

      const guardianAppId = defaultGuardianAppId
      const ctx = await readGuardianContext(guardianAppId, agentAddress)
      const round = await getCurrentRound()

      const hasOnChainPolicy = ctx.policy !== null
      const isExpired =
        hasOnChainPolicy && round > 0n && round > ctx.policy!.expiryRound

      let status = derivePolicyLifecycleStatus(
        ctx.isPaused,
        hasOnChainPolicy,
        isExpired,
      )

      const patch: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      }
      if (bootstrapTxId) patch.last_bootstrap_tx_id = bootstrapTxId
      if (expiryRound != null) patch.expiry_round = Number(expiryRound)
      else if (ctx.policy) patch.expiry_round = Number(ctx.policy.expiryRound)

      const { data, error } = await sb
        .from('agent_policy_bindings')
        .update(patch)
        .eq('agent_address', agentAddress)
        .eq('wallet_address', ownerAddress)
        .select('*')
        .maybeSingle()

      if (error) {
        return res.status(500).json({ error: 'Failed to sync policy status' })
      }

      // Serialize BigInt values before sending response
      const response = serializeBigInts({ binding: data, policyStatus: status, guardian: ctx })
      res.json(response)
    } catch (error) {
      console.error('[AgentManagement] policy-sync error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  router.patch('/agents/:agentAddress', async (req, res) => {
    try {
      const { agentAddress } = req.params
      const { ownerAddress, displayName, status, budgetMicroAlgos } = req.body ?? {}

      if (!ownerAddress) {
        return res.status(400).json({ error: 'ownerAddress is required' })
      }

      const patch: Record<string, unknown> = {}
      if (displayName != null) patch.display_name = String(displayName).trim() || null
      if (status === 'active' || status === 'inactive' || status === 'archived') {
        patch.status = status
      }
      if (budgetMicroAlgos != null) {
        const n = Number(budgetMicroAlgos)
        if (!Number.isFinite(n) || n < 0) {
          return res.status(400).json({ error: 'budgetMicroAlgos must be non-negative' })
        }
        patch.budget_microalgos = n
      }

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' })
      }

      const { data, error } = await sb
        .from('agent_wallets')
        .update(patch)
        .eq('agent_address', agentAddress)
        .eq('wallet_address', ownerAddress)
        .select(
          'id, workflow_id, wallet_address, agent_address, guardian_app_id, budget_microalgos, status, display_name, policy_binding_id, binding_type, created_at',
        )
        .maybeSingle()

      if (error || !data) {
        return res.status(404).json({ error: 'Agent wallet not found' })
      }
      res.json({ wallet: data })
    } catch (error) {
      console.error('[AgentManagement] patch agent error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  router.post('/force-policy-resync', async (req, res) => {
    try {
      const { ownerAddress, agentAddress } = req.body

      if (!ownerAddress || !agentAddress) {
        return res.status(400).json({ error: 'ownerAddress and agentAddress are required' })
      }

      console.log('[AgentManagement] Force policy resync:', { ownerAddress, agentAddress })

      // 1. Check what's actually on-chain
      const guardianCtx = await readGuardianContext(defaultGuardianAppId, agentAddress)
      const hasOnChainPolicy = guardianCtx.policy !== null

      console.log('On-chain policy status:', { hasPolicy: hasOnChainPolicy, blocked: guardianCtx.blocked, blockReason: guardianCtx.blockReason })

      // 2. Check what's in the database
      const { data: agentWallet } = await sb
        .from('agent_wallets')
        .select('*, policy_binding_id')
        .eq('agent_address', agentAddress)
        .eq('wallet_address', ownerAddress)
        .maybeSingle()

      if (!agentWallet) {
        return res.status(404).json({ error: 'Agent wallet not found' })
      }

      const { data: policyBinding } = await sb
        .from('agent_policy_bindings')
        .select('*')
        .eq('agent_address', agentAddress)
        .maybeSingle()

      const hasDbPolicy = policyBinding !== null

      console.log('Database policy status:', { hasPolicy: hasDbPolicy, bindingStatus: policyBinding?.status })

      let fixed = false
      let message = ''

      // 3. Fix database vs blockchain mismatches
      if (hasDbPolicy && !hasOnChainPolicy) {
        // Database says there's a policy, but blockchain doesn't have one
        // This is the main issue - reset the binding status to require re-registration
        
        if (policyBinding) {
          await sb
            .from('agent_policy_bindings')
            .update({ 
              status: 'failed',
              last_bootstrap_tx_id: null,
              updated_at: new Date().toISOString()
            })
            .eq('id', policyBinding.id)

          console.log('Updated policy binding status to failed')
        }

        // Clear the policy_binding_id from agent_wallets if it's set
        if (agentWallet.policy_binding_id) {
          await sb
            .from('agent_wallets')
            .update({ policy_binding_id: null })
            .eq('id', agentWallet.id)

          console.log('Cleared policy_binding_id from agent wallet')
        }

        fixed = true
        message = `Database policy binding reset. Bootstrap transaction likely failed. Please re-register policy in Agent Management.`

      } else if (!hasDbPolicy && hasOnChainPolicy) {
        // Blockchain has policy but database doesn't know about it
        // This is unusual but can happen - create a database record
        message = `On-chain policy exists but not in database. This is unusual - policy may have been registered externally.`

      } else if (hasDbPolicy && hasOnChainPolicy) {
        // Both exist - check if they match
        message = `Both database and blockchain have policy records. Sync looks consistent.`

      } else {
        // Neither has policy
        message = `No policy found in database or on-chain. Register a new policy in Agent Management.`
      }

      res.json({ fixed, message, hasOnChainPolicy, hasDbPolicy })

    } catch (error) {
      console.error('[AgentManagement] force resync error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  return router
}

function computeHealthScore(input: {
  walletStatus: string
  hasKey: boolean
  balanceAvailable: number
  policyStatus: string
}): number {
  let score = 0
  if (input.walletStatus === 'active') score += 25
  if (input.hasKey) score += 25
  if (input.balanceAvailable >= 0.5) score += 25
  else if (input.balanceAvailable > 0) score += 12
  if (input.policyStatus === 'active') score += 25
  else if (input.policyStatus === 'pending') score += 10
  return score
}
