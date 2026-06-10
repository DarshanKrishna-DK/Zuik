import express from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createValidatedSupabaseClient } from './supabaseClient.js'
import { getAlgodClient } from './algorand.js'
import { storeAgentKey, hasAgentKey, removeAgentKey, getAgentExecutionContext } from './agentSigner.js'
import { sendAuthorizedPayment } from './guardianExecutor.js'

let sb: SupabaseClient

interface AgentWalletBalance {
  balance: number
  minBalance: number
  available: number
}

async function fetchWalletBalance(agentAddress: string): Promise<AgentWalletBalance> {
  const algod = getAlgodClient()
  try {
    const accountInfo = await algod.accountInformation(agentAddress).do()
    const balance = Number(accountInfo.amount) / 1_000_000
    const minBalance = Number(accountInfo.minBalance || 100_000) / 1_000_000
    const available = Math.max(0, balance - minBalance)
    return { balance, minBalance, available }
  } catch (error) {
    console.warn(`[AgentWallet] Failed to fetch balance for ${agentAddress}:`, error)
    return { balance: 0, minBalance: 0.1, available: 0 }
  }
}

// Agent wallet API: register keys server-side, expose balances and metadata (never the mnemonic).
export async function createAgentWalletRouter(): Promise<express.Router> {
  if (!sb) {
    sb = await createValidatedSupabaseClient()
  }
  const router = express.Router()

  router.post('/register', async (req, res) => {
    try {
      const { workflowId, ownerAddress, agentAddress, mnemonic, guardianAppId, budgetMicroAlgos, displayName } = req.body ?? {}

      if (!ownerAddress || !agentAddress || !mnemonic) {
        return res.status(400).json({ error: 'ownerAddress, agentAddress and mnemonic are required' })
      }

      storeAgentKey(agentAddress, mnemonic)

      // workflow_id must be a UUID; skip demo placeholders.
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      const safeWorkflowId = typeof workflowId === 'string' && UUID_RE.test(workflowId) ? workflowId : null

      const bindingType = safeWorkflowId ? 'dedicated' : 'shared'

      const { error } = await sb
        .from('agent_wallets')
        .upsert(
          {
            workflow_id: safeWorkflowId,
            wallet_address: ownerAddress,
            agent_address: agentAddress,
            guardian_app_id: guardianAppId ? Number(guardianAppId) : null,
            budget_microalgos: budgetMicroAlgos ? Number(budgetMicroAlgos) : null,
            display_name: displayName || null,
            status: 'active',
            binding_type: bindingType,
          },
          { onConflict: 'agent_address' },
        )

      if (error) {
        console.error('[AgentWallet] Failed to persist metadata:', error.message)
        return res.status(500).json({ error: 'Failed to persist agent wallet metadata' })
      }

      if (safeWorkflowId) {
        const { error: prefError } = await sb.from('agent_preferences').upsert(
          {
            agent_address: agentAddress,
            workflow_id: safeWorkflowId,
            preference_key: 'workflow_binding',
            preference_value: { binding_type: 'dedicated' },
          },
          { onConflict: 'workflow_id,preference_key' },
        )
        if (prefError) {
          console.warn('[AgentWallet] Failed to persist workflow binding preference:', prefError.message)
        }
      }

      res.json({ success: true, agentAddress })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to register agent wallet'
      console.error('[AgentWallet] register error:', message)
      res.status(500).json({ error: message })
    }
  })

  router.get('/:agentAddress/balance', async (req, res) => {
    try {
      const { agentAddress } = req.params
      const balance = await fetchWalletBalance(agentAddress)
      res.json({ balance, hasKey: hasAgentKey(agentAddress) })
    } catch (error) {
      console.error('[AgentWallet] balance error:', error)
      res.status(500).json({ error: 'Failed to fetch balance' })
    }
  })

  router.get('/by-wallet/:ownerAddress', async (req, res) => {
    try {
      const { ownerAddress } = req.params
      const { data, error } = await sb
        .from('agent_wallets')
        .select('id, workflow_id, wallet_address, agent_address, guardian_app_id, budget_microalgos, status, display_name, policy_binding_id, created_at')
        .eq('wallet_address', ownerAddress)
        .order('created_at', { ascending: false })

      if (error) {
        return res.status(500).json({ error: 'Failed to fetch agent wallets' })
      }
      res.json({ wallets: data ?? [] })
    } catch (error) {
      console.error('[AgentWallet] by-wallet error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  router.post('/bind-workflow', async (req, res) => {
    try {
      const { workflowId, agentAddress, ownerAddress, bindingType } = req.body ?? {}

      if (!workflowId || !agentAddress || !ownerAddress) {
        return res.status(400).json({ error: 'workflowId, agentAddress, and ownerAddress are required' })
      }

      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!UUID_RE.test(workflowId)) {
        return res.status(400).json({ error: 'workflowId must be a valid UUID' })
      }

      const bindType =
        bindingType === 'dedicated' || bindingType === 'shared' || bindingType === 'temporary'
          ? bindingType
          : 'shared'

      const { data: workflow, error: wfError } = await sb
        .from('workflows')
        .select('id, wallet_address')
        .eq('id', workflowId)
        .maybeSingle()

      if (wfError || !workflow || workflow.wallet_address !== ownerAddress) {
        return res.status(404).json({ error: 'Workflow not found for this owner' })
      }

      const { data: agentRow, error: agentError } = await sb
        .from('agent_wallets')
        .select('id, workflow_id, agent_address, status')
        .eq('agent_address', agentAddress)
        .eq('wallet_address', ownerAddress)
        .neq('status', 'archived')
        .maybeSingle()

      if (agentError || !agentRow) {
        return res.status(404).json({ error: 'Agent wallet not found for this owner' })
      }

      if (bindType === 'dedicated') {
        if (agentRow.workflow_id && agentRow.workflow_id !== workflowId) {
          return res.status(409).json({
            error: 'This agent is dedicated to another workflow. Use shared binding or pick a different agent.',
          })
        }

        const { error: dedicatedError } = await sb
          .from('agent_wallets')
          .update({ workflow_id: workflowId, binding_type: 'dedicated' })
          .eq('id', agentRow.id)

        if (dedicatedError) {
          return res.status(500).json({ error: 'Failed to set dedicated agent binding' })
        }
      }

      const { error: prefError } = await sb.from('agent_preferences').upsert(
        {
          agent_address: agentAddress,
          workflow_id: workflowId,
          preference_key: 'workflow_binding',
          preference_value: { binding_type: bindType },
        },
        { onConflict: 'workflow_id,preference_key' },
      )

      if (prefError) {
        console.error('[AgentWallet] bind-workflow preference error:', prefError.message)
        return res.status(500).json({ error: 'Failed to persist workflow binding preference' })
      }

      res.json({ success: true, bindingType: bindType, agentAddress, workflowId })
    } catch (error) {
      console.error('[AgentWallet] bind-workflow error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  router.get('/workflow-bindings/:ownerAddress', async (req, res) => {
    try {
      const { ownerAddress } = req.params

      const { data: workflows, error: wfError } = await sb
        .from('workflows')
        .select('id, name')
        .eq('wallet_address', ownerAddress)

      if (wfError) {
        return res.status(500).json({ error: 'Failed to load workflows' })
      }

      const workflowIds = (workflows ?? []).map((w) => w.id)
      if (workflowIds.length === 0) {
        return res.json({ bindings: [] })
      }

      const { data: prefs, error: prefError } = await sb
        .from('agent_preferences')
        .select('agent_address, workflow_id, preference_value')
        .eq('preference_key', 'workflow_binding')
        .in('workflow_id', workflowIds)

      if (prefError) {
        return res.status(500).json({ error: 'Failed to load workflow bindings' })
      }

      const { data: agents, error: agentError } = await sb
        .from('agent_wallets')
        .select('agent_address, workflow_id, display_name, binding_type, status')
        .eq('wallet_address', ownerAddress)
        .neq('status', 'archived')

      if (agentError) {
        return res.status(500).json({ error: 'Failed to load agent wallets' })
      }

      const nameById = new Map((workflows ?? []).map((w) => [w.id, w.name]))
      const agentByAddress = new Map((agents ?? []).map((a) => [a.agent_address, a]))
      const prefByWorkflow = new Map((prefs ?? []).map((p) => [p.workflow_id, p]))

      const bindings = workflowIds.map((workflowId) => {
        const pref = prefByWorkflow.get(workflowId)
        const dedicatedAgent = (agents ?? []).find((a) => a.workflow_id === workflowId)
        const agentAddress = pref?.agent_address ?? dedicatedAgent?.agent_address ?? null
        const agentMeta = agentAddress ? agentByAddress.get(agentAddress) : null
        const bindingType =
          (pref?.preference_value as { binding_type?: string } | null)?.binding_type ??
          (dedicatedAgent ? 'dedicated' : null)

        return {
          workflowId,
          workflowName: nameById.get(workflowId) ?? 'Untitled',
          agentAddress,
          agentDisplayName: agentMeta?.display_name ?? null,
          bindingType,
        }
      })

      res.json({ bindings })
    } catch (error) {
      console.error('[AgentWallet] workflow-bindings error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  router.patch('/:agentAddress', async (req, res) => {
    try {
      const { agentAddress } = req.params
      const { status, budgetMicroAlgos, ownerAddress } = req.body ?? {}

      if (!ownerAddress) {
        return res.status(400).json({ error: 'ownerAddress is required' })
      }

      const patch: Record<string, unknown> = {}
      if (status === 'active' || status === 'inactive' || status === 'archived') {
        patch.status = status
      }
      if (budgetMicroAlgos != null) {
        const n = Number(budgetMicroAlgos)
        if (!Number.isFinite(n) || n < 0) {
          return res.status(400).json({ error: 'budgetMicroAlgos must be a non-negative number' })
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
        .select('id, workflow_id, wallet_address, agent_address, guardian_app_id, budget_microalgos, status, display_name, policy_binding_id, created_at')
        .maybeSingle()

      if (error) {
        return res.status(500).json({ error: 'Failed to update agent wallet' })
      }
      if (!data) {
        return res.status(404).json({ error: 'Agent wallet not found for this owner' })
      }
      res.json({ wallet: data })
    } catch (error) {
      console.error('[AgentWallet] patch error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  router.post('/:agentAddress/send-payment', async (req, res) => {
    try {
      const { agentAddress } = req.params
      const { ownerAddress, recipient, amountMicroAlgos, assetId = 0, note } = req.body ?? {}

      if (!ownerAddress || !recipient || amountMicroAlgos == null) {
        return res.status(400).json({ error: 'ownerAddress, recipient, and amountMicroAlgos are required' })
      }

      const { data: row, error } = await sb
        .from('agent_wallets')
        .select('agent_address, wallet_address, guardian_app_id, status')
        .eq('agent_address', agentAddress)
        .eq('wallet_address', ownerAddress)
        .eq('status', 'active')
        .maybeSingle()

      if (error || !row) {
        return res.status(404).json({ error: 'Agent wallet not found for this owner' })
      }

      if (Number(assetId) !== 0) {
        return res.status(400).json({ error: 'Agent path supports ALGO (asset 0) only' })
      }

      const amount = Number(amountMicroAlgos)
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'amountMicroAlgos must be a positive number' })
      }

      const agentContext = await getAgentExecutionContext(agentAddress)
      if (!agentContext) {
        return res.status(400).json({ error: 'Agent signing key not available on server' })
      }

      const result = await sendAuthorizedPayment({
        agentAddress,
        recipient: String(recipient),
        amountMicroAlgos: BigInt(Math.round(amount)),
        guardianAppId: agentContext.guardianAppId,
        signer: agentContext.signer,
        note: typeof note === 'string' ? note : undefined,
      })

      res.json({
        txIds: result.txIds,
        txId: result.txIds[0] ?? '',
        confirmedRound: result.confirmedRound,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Agent payment failed'
      console.error('[AgentWallet] send-payment error:', message)
      res.status(500).json({ error: message })
    }
  })

  router.delete('/:agentAddress', async (req, res) => {
    try {
      const { agentAddress } = req.params
      const ownerAddress = (req.query.ownerAddress as string) || (req.body?.ownerAddress as string)

      if (!ownerAddress) {
        return res.status(400).json({ error: 'ownerAddress is required' })
      }

      const { error } = await sb
        .from('agent_wallets')
        .update({ status: 'archived' })
        .eq('agent_address', agentAddress)
        .eq('wallet_address', ownerAddress)

      if (error) {
        return res.status(500).json({ error: 'Failed to archive agent wallet' })
      }

      removeAgentKey(agentAddress)
      res.json({ success: true })
    } catch (error) {
      console.error('[AgentWallet] delete error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  return router
}
